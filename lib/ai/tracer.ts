import { db } from "@/lib/db";
import { traces, trace_steps } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export interface StepRecord {
  step_type:
    | "plan"
    | "decompose"
    | "vector_retrieve"
    | "keyword_retrieve"
    | "graph_retrieve"
    | "rerank"
    | "draft_answer"
    | "verify"
    | "tool_call"
    | "cache_check"
    | "embed";
  input_summary: string;
  output_summary: string;
  latency_ms: number;
  tokens_used?: number;
  metadata?: Record<string, any>;
}

export class ExecutionTracer {
  private traceId: string | null = null;
  private workspaceId: string;
  private conversationId?: string;
  private queryText: string;
  private startTime: number;
  private stepCounter = 0;
  private totalTokens = 0;

  constructor(workspaceId: string, queryText: string, conversationId?: string) {
    this.workspaceId = workspaceId;
    this.queryText = queryText;
    this.conversationId = conversationId;
    this.startTime = Date.now();
  }

  async start(): Promise<string> {
    const [record] = await db
      .insert(traces)
      .values({
        workspace_id: this.workspaceId,
        conversation_id: this.conversationId || null,
        query_text: this.queryText,
        total_latency_ms: 0,
        total_tokens: 0,
        cache_hit: false,
      })
      .returning();

    this.traceId = record.id;
    return this.traceId;
  }

  async recordStep(step: StepRecord): Promise<void> {
    if (!this.traceId) return;

    this.stepCounter++;
    if (step.tokens_used) {
      this.totalTokens += step.tokens_used;
    }

    try {
      await db.insert(trace_steps).values({
        trace_id: this.traceId,
        step_index: this.stepCounter,
        step_type: step.step_type,
        input_summary: step.input_summary,
        output_summary: step.output_summary,
        latency_ms: step.latency_ms,
        tokens_used: step.tokens_used || null,
        metadata: step.metadata || {},
      });
    } catch (err) {
      console.warn("Failed to write trace step:", err);
    }
  }

  async finish(params: {
    messageId?: string;
    cacheHit?: boolean;
    confidence?: "verified" | "uncertain";
  }): Promise<void> {
    if (!this.traceId) return;

    const totalLatency = Date.now() - this.startTime;

    try {
      await db
        .update(traces)
        .set({
          message_id: params.messageId || null,
          total_latency_ms: totalLatency,
          total_tokens: this.totalTokens,
          cache_hit: params.cacheHit ?? false,
          final_confidence: params.confidence || "verified",
        })
        .where(eq(traces.id, this.traceId));
    } catch (err) {
      console.warn("Failed to close trace:", err);
    }
  }

  getTraceId(): string | null {
    return this.traceId;
  }
}
