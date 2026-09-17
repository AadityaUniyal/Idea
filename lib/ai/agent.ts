import { sqlClient, db } from "@/lib/db";
import { chunks, documents } from "@/lib/db/schema";
import { getEmbedding } from "./embeddings";
import { checkSemanticCache, writeSemanticCache } from "./cache";
import { groqJson, groqComplete, GROQ_MODELS } from "./groq";
import { traverseGraph } from "./graph";
import { rerankCandidates, RerankCandidate } from "./rerank";
import { ExecutionTracer } from "./tracer";
import { checkAndConsumeTokens, addTokensUsed } from "./rate-limiter";

export interface Citation {
  chunk_id: string;
  document_id: string;
  filename: string;
  page_number?: number;
  snippet: string;
}

export interface AgentQueryResult {
  answer: string;
  confidence: "verified" | "uncertain";
  citations: Citation[];
  cacheHit: boolean;
  planSummary: string;
  totalLatencyMs: number;
  traceId: string | null;
}

interface PlanOutput {
  strategy: "direct" | "decompose";
  subquestions: string[];
  entities: string[];
  reasoning: string;
}

interface VerificationOutput {
  all_supported: boolean;
  unsupported_claims: string[];
  reasoning: string;
}

/**
 * Execute the 12-stage Agentic RAG Pipeline with full tracing, hybrid + graph retrieval,
 * cross-encoder reranking, and self-verification.
 */
export async function executeAgentQuery({
  workspaceId,
  conversationId,
  query,
  onProgress,
}: {
  workspaceId: string;
  conversationId?: string;
  query: string;
  onProgress?: (step: string, data?: any) => void;
}): Promise<AgentQueryResult> {
  const startTime = Date.now();
  const tracer = new ExecutionTracer(workspaceId, query, conversationId);
  const traceId = await tracer.start();

  // 1. Token-bucket rate limit check
  const rateLimit = await checkAndConsumeTokens(workspaceId, 0, 50000);
  if (!rateLimit.allowed) {
    await tracer.recordStep({
      step_type: "plan",
      input_summary: "Rate limit check",
      output_summary: "Daily token limit exceeded",
      latency_ms: Date.now() - startTime,
    });
    await tracer.finish({ confidence: "uncertain" });
    return {
      answer: "The workspace has reached its daily token limit (50,000 tokens). Please try again tomorrow or contact your administrator.",
      confidence: "uncertain",
      citations: [],
      cacheHit: false,
      planSummary: "Rate limit reached",
      totalLatencyMs: Date.now() - startTime,
      traceId,
    };
  }

  // 2. Embed Query
  const embedStart = Date.now();
  onProgress?.("Embedding query...");
  const queryVector = await getEmbedding(query);
  await tracer.recordStep({
    step_type: "embed",
    input_summary: `Embed text (${query.length} chars)`,
    output_summary: `1024-dim vector generated`,
    latency_ms: Date.now() - embedStart,
  });

  // 3. Semantic Cache Check
  const cacheStart = Date.now();
  onProgress?.("Checking semantic cache...");
  const cacheHit = await checkSemanticCache(workspaceId, query, queryVector);
  await tracer.recordStep({
    step_type: "cache_check",
    input_summary: `Cosine distance check in query_cache`,
    output_summary: cacheHit.hit ? `Cache hit! Similarity: ${cacheHit.similarity?.toFixed(4)}` : "Cache miss",
    latency_ms: Date.now() - cacheStart,
  });

  if (cacheHit.hit && cacheHit.answer) {
    onProgress?.("Serving instant answer from cache");
    const totalLatency = Date.now() - startTime;
    await tracer.finish({ cacheHit: true, confidence: "verified" });
    return {
      answer: cacheHit.answer,
      confidence: "verified",
      citations: cacheHit.citations || [],
      cacheHit: true,
      planSummary: "Served instantly from semantic cache (pgvector similarity > 0.95)",
      totalLatencyMs: totalLatency,
      traceId,
    };
  }

  // 4. Plan (Llama 3.1 8B)
  const planStart = Date.now();
  onProgress?.("Planning retrieval strategy...");
  const planPrompt = `User Question: "${query}"
Task: Determine if this question is a "direct" single-fact lookup or if it requires "decompose" (multi-hop reasoning across multiple policies, regulations, or interacting conditions). Also identify 1 to 4 key entities mentioned.

Return JSON format:
{
  "strategy": "direct" | "decompose",
  "subquestions": ["subquestion 1", "subquestion 2"],
  "entities": ["Entity Name 1", "Entity Name 2"],
  "reasoning": "Brief explanation"
}`;

  const plan = await groqJson<PlanOutput>(
    planPrompt,
    "You are a retrieval planner for an enterprise document archive.",
    GROQ_MODELS.FAST
  );

  const planSummary =
    plan.strategy === "decompose" && plan.subquestions.length > 0
      ? `Breaking question into ${plan.subquestions.length} sub-queries for multi-hop graph & vector synthesis.`
      : "Executing direct hybrid retrieval and cross-encoder reranking.";

  onProgress?.(planSummary, { strategy: plan.strategy, subquestions: plan.subquestions });

  await tracer.recordStep({
    step_type: "plan",
    input_summary: `Classify query complexity`,
    output_summary: `Strategy: ${plan.strategy}. ${plan.reasoning}`,
    latency_ms: Date.now() - planStart,
    metadata: { plan },
  });

  // 5. Retrieve candidates for each question / sub-question
  const questionsToSearch =
    plan.strategy === "decompose" && plan.subquestions.length > 0
      ? plan.subquestions
      : [query];

  const candidateMap = new Map<string, RerankCandidate>();

  for (const q of questionsToSearch) {
    // a) Vector Search
    const vecStart = Date.now();
    const qVec = await getEmbedding(q);
    const vecRows = await sqlClient(
      `SELECT 
         c.id,
         c.document_id,
         c.content,
         c.page_number,
         d.filename,
         (c.embedding <=> $2::vector) as distance
       FROM chunks c
       JOIN documents d ON d.id = c.document_id
       WHERE c.workspace_id = $1
       ORDER BY distance ASC
       LIMIT 15;`,
      [workspaceId, `[${qVec.join(",")}]`]
    );

    await tracer.recordStep({
      step_type: "vector_retrieve",
      input_summary: `pgvector HNSW search: "${q}"`,
      output_summary: `Found ${vecRows.length} chunks`,
      latency_ms: Date.now() - vecStart,
      metadata: { count: vecRows.length },
    });

    for (const r of vecRows) {
      if (!candidateMap.has(r.id)) {
        candidateMap.set(r.id, {
          id: r.id,
          document_id: r.document_id,
          filename: r.filename,
          page_number: r.page_number,
          content: r.content,
        });
      }
    }

    // b) Keyword Search (Full Text Search)
    const kwStart = Date.now();
    const cleanQ = q.replace(/[^\w\s]/g, " ").trim().split(/\s+/).slice(0, 5).join(" | ");
    if (cleanQ) {
      const ftsRows = await sqlClient(
        `SELECT 
           c.id,
           c.document_id,
           c.content,
           c.page_number,
           d.filename,
           ts_rank_cd(to_tsvector('english', c.content), to_tsquery('english', $2)) as rank
         FROM chunks c
         JOIN documents d ON d.id = c.document_id
         WHERE c.workspace_id = $1
           AND to_tsvector('english', c.content) @@ to_tsquery('english', $2)
         ORDER BY rank DESC
         LIMIT 15;`,
        [workspaceId, cleanQ]
      );

      await tracer.recordStep({
        step_type: "keyword_retrieve",
        input_summary: `FTS tsquery: "${cleanQ}"`,
        output_summary: `Found ${ftsRows.length} chunks`,
        latency_ms: Date.now() - kwStart,
        metadata: { count: ftsRows.length },
      });

      for (const r of ftsRows) {
        if (!candidateMap.has(r.id)) {
          candidateMap.set(r.id, {
            id: r.id,
            document_id: r.document_id,
            filename: r.filename,
            page_number: r.page_number,
            content: r.content,
          });
        }
      }
    }
  }

  // c) Graph Traversal (Multi-hop recursive CTE)
  const graphStart = Date.now();
  onProgress?.("Traversing knowledge graph relations...");
  const entitiesToQuery = plan.entities && plan.entities.length > 0 ? plan.entities : [query];
  const graphResults = await traverseGraph(workspaceId, entitiesToQuery);

  if (graphResults.length > 0) {
    const chunkIds = graphResults.map((g) => g.sourceChunkId).filter(Boolean) as string[];
    if (chunkIds.length > 0) {
      const extraChunks = await sqlClient(
        `SELECT c.id, c.document_id, c.content, c.page_number, d.filename
         FROM chunks c
         JOIN documents d ON d.id = c.document_id
         WHERE c.id = ANY($1::uuid[]);`,
        [chunkIds]
      );

      for (const r of extraChunks) {
        if (!candidateMap.has(r.id)) {
          candidateMap.set(r.id, {
            id: r.id,
            document_id: r.document_id,
            filename: r.filename,
            page_number: r.page_number,
            content: r.content,
          });
        }
      }
    }
  }

  await tracer.recordStep({
    step_type: "graph_retrieve",
    input_summary: `Recursive CTE walk for: [${entitiesToQuery.join(", ")}]`,
    output_summary: `Explored ${graphResults.length} graph relations`,
    latency_ms: Date.now() - graphStart,
    metadata: { relations: graphResults },
  });

  // 6. Cross-Encoder Re-Ranking
  const rerankStart = Date.now();
  onProgress?.("Re-ranking retrieved chunks with cross-encoder...");
  const rawCandidates = Array.from(candidateMap.values());
  const topChunks = await rerankCandidates(query, rawCandidates, 6);

  await tracer.recordStep({
    step_type: "rerank",
    input_summary: `Cross-encoder reranking over ${rawCandidates.length} merged candidates`,
    output_summary: `Selected top ${topChunks.length} chunks`,
    latency_ms: Date.now() - rerankStart,
    metadata: { topChunkIds: topChunks.map((c) => c.id) },
  });

  // 7. Synthesis with Claim Citations (Groq Llama 3.3 70B)
  const synthStart = Date.now();
  onProgress?.("Synthesizing final verified answer...");

  const contextBlocks = topChunks
    .map(
      (c, idx) =>
        `--- SOURCE CHUNK [${idx + 1}] (Document: "${c.filename}", Page: ${c.page_number ?? 1}) ---\n${c.content}`
    )
    .join("\n\n");

  const synthSystemPrompt = `You are DocMind, an advanced enterprise archive intelligence agent.
Your mission is to answer user inquiries strictly grounded in the provided document chunks.
Guidelines:
1. Every major fact, condition, rule, or number MUST be directly referenced with its source marker like [1], [2], etc.
2. If the sources conflict (e.g. local policy vs regulation), clearly explain how they interact based on the evidence.
3. If the provided sources do not contain enough facts to answer with certainty, state clearly what is known and what is missing. Do NOT hallucinate or speculate.`;

  const userPrompt = `User Question: "${query}"

Retrieved Archive Chunks:
${contextBlocks || "No document chunks retrieved."}

Please provide a well-structured, clear answer with margin-note citation markers [1], [2], etc.`;

  const { text: draftAnswer, tokensUsed } = await groqComplete(
    userPrompt,
    synthSystemPrompt,
    GROQ_MODELS.LARGE
  );

  await tracer.recordStep({
    step_type: "draft_answer",
    input_summary: `Synthesize answer using Llama 3.3 70B (${topChunks.length} chunks)`,
    output_summary: `Generated ${draftAnswer.length} chars`,
    latency_ms: Date.now() - synthStart,
    tokens_used: tokensUsed,
  });

  // 8. Self-Verification Loop (Groq Llama 3.1 8B)
  const verifyStart = Date.now();
  onProgress?.("Running self-verification loop...");

  const verifyPrompt = `Draft Answer:
"""
${draftAnswer}
"""

Reference Chunks:
${contextBlocks}

Task: Verify if every factual claim made in the Draft Answer is explicitly backed by the Reference Chunks.
Return JSON:
{
  "all_supported": boolean,
  "unsupported_claims": ["claim 1", ...],
  "reasoning": "brief explanation"
}`;

  const verification = await groqJson<VerificationOutput>(
    verifyPrompt,
    "You are a rigorous factual auditor. Check every claim against the provided reference chunks.",
    GROQ_MODELS.FAST
  );

  const confidence: "verified" | "uncertain" = verification.all_supported ? "verified" : "uncertain";

  await tracer.recordStep({
    step_type: "verify",
    input_summary: `Audit draft answer against source chunks`,
    output_summary: `Confidence: ${confidence}. ${verification.reasoning}`,
    latency_ms: Date.now() - verifyStart,
    metadata: { verification },
  });

  // Build citations list
  const citations: Citation[] = topChunks.map((c) => ({
    chunk_id: c.id,
    document_id: c.document_id,
    filename: c.filename,
    page_number: c.page_number,
    snippet: c.content.slice(0, 280) + "...",
  }));

  // 9. Write-Through Semantic Cache on verified answers
  if (confidence === "verified" && citations.length > 0) {
    await writeSemanticCache(workspaceId, query, queryVector, draftAnswer, citations);
  }

  // 10. Update usage tokens
  await addTokensUsed(workspaceId, tokensUsed);

  // 11. Close Trace
  const totalLatency = Date.now() - startTime;
  await tracer.finish({ confidence, cacheHit: false });

  return {
    answer: draftAnswer,
    confidence,
    citations,
    cacheHit: false,
    planSummary,
    totalLatencyMs: totalLatency,
    traceId,
  };
}
