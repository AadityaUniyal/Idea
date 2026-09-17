import { sqlClient } from "@/lib/db";

// In-memory LRU cache for serverless execution context
const memoryLru = new Map<string, { answer: string; citations: any; timestamp: number }>();
const MAX_LRU_SIZE = 100;

export interface SemanticCacheHit {
  hit: boolean;
  answer?: string;
  citations?: any[];
  similarity?: number;
}

/**
 * Checks in-memory cache and pgvector semantic cache table.
 * Cosine distance `<=>` < 0.05 corresponds to cosine similarity > 0.95.
 */
export async function checkSemanticCache(
  workspaceId: string,
  queryText: string,
  queryEmbedding: number[]
): Promise<SemanticCacheHit> {
  const normalizedKey = `${workspaceId}:${queryText.trim().toLowerCase()}`;

  // 1. In-memory fast tier check
  if (memoryLru.has(normalizedKey)) {
    const memEntry = memoryLru.get(normalizedKey)!;
    return {
      hit: true,
      answer: memEntry.answer,
      citations: memEntry.citations,
      similarity: 1.0,
    };
  }

  // 2. Postgres pgvector semantic cache check
  const vectorStr = `[${queryEmbedding.join(",")}]`;
  const rows = await sqlClient(
    `SELECT 
       id,
       answer,
       citations,
       (query_embedding <=> $2::vector) as distance
     FROM query_cache
     WHERE workspace_id = $1
       AND (query_embedding <=> $2::vector) < 0.05
     ORDER BY distance ASC
     LIMIT 1;`,
    [workspaceId, vectorStr]
  );

  if (rows && rows.length > 0) {
    const hitRow = rows[0];
    const similarity = 1 - Number(hitRow.distance);

    // Increment hit count and update last_used_at
    await sqlClient(
      `UPDATE query_cache
       SET hit_count = hit_count + 1, last_used_at = NOW()
       WHERE id = $1;`,
      [hitRow.id]
    );

    // Populate in-memory LRU
    if (memoryLru.size >= MAX_LRU_SIZE) {
      const firstKey = memoryLru.keys().next().value;
      if (firstKey) memoryLru.delete(firstKey);
    }
    memoryLru.set(normalizedKey, {
      answer: hitRow.answer,
      citations: hitRow.citations,
      timestamp: Date.now(),
    });

    return {
      hit: true,
      answer: hitRow.answer,
      citations: hitRow.citations,
      similarity,
    };
  }

  return { hit: false };
}

/**
 * Writes a verified question and answer to the semantic cache.
 */
export async function writeSemanticCache(
  workspaceId: string,
  queryText: string,
  queryEmbedding: number[],
  answer: string,
  citations: any[]
): Promise<void> {
  const vectorStr = `[${queryEmbedding.join(",")}]`;

  try {
    await sqlClient(
      `INSERT INTO query_cache (workspace_id, query_embedding, query_text, answer, citations, hit_count, created_at, last_used_at)
       VALUES ($1, $2::vector, $3, $4, $5::jsonb, 1, NOW(), NOW());`,
      [workspaceId, vectorStr, queryText, answer, JSON.stringify(citations)]
    );

    const normalizedKey = `${workspaceId}:${queryText.trim().toLowerCase()}`;
    memoryLru.set(normalizedKey, {
      answer,
      citations,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.warn("Error writing to semantic cache:", err);
  }
}
