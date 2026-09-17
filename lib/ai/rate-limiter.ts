import { sqlClient } from "@/lib/db";

export interface RateLimitResult {
  allowed: boolean;
  tokensUsed: number;
  limit: number;
  remaining: number;
}

/**
 * Atomic token-bucket rate limiter implemented directly in PostgreSQL SQL.
 * Uses atomic INSERT ... ON CONFLICT (workspace_id, date) DO UPDATE ... RETURNING
 * to guarantee no race conditions under concurrent requests.
 */
export async function checkAndConsumeTokens(
  workspaceId: string,
  tokensToConsume: number = 0,
  dailyLimit: number = 50000
): Promise<RateLimitResult> {
  const today = new Date().toISOString().split("T")[0];

  const rows = await sqlClient(
    `INSERT INTO usage_daily (workspace_id, date, tokens_used, queries_count)
     VALUES ($1, $2::date, $3, 1)
     ON CONFLICT (workspace_id, date)
     DO UPDATE SET 
       tokens_used = usage_daily.tokens_used + $3,
       queries_count = usage_daily.queries_count + 1
     RETURNING tokens_used, queries_count;`,
    [workspaceId, today, tokensToConsume]
  );

  const currentUsed = Number(rows[0]?.tokens_used ?? 0);
  const allowed = currentUsed <= dailyLimit;
  const remaining = Math.max(0, dailyLimit - currentUsed);

  return {
    allowed,
    tokensUsed: currentUsed,
    limit: dailyLimit,
    remaining,
  };
}

/**
 * Increment tokens used for an ongoing query after synthesis completes
 */
export async function addTokensUsed(
  workspaceId: string,
  tokens: number
): Promise<void> {
  if (tokens <= 0) return;
  const today = new Date().toISOString().split("T")[0];

  await sqlClient(
    `UPDATE usage_daily
     SET tokens_used = tokens_used + $3
     WHERE workspace_id = $1 AND date = $2::date;`,
    [workspaceId, today, tokens]
  );
}
