import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { sqlClient } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    const workspaceId = session.workspace.id;
    const limit = session.workspace.daily_token_limit;

    const today = new Date().toISOString().split("T")[0];
    const rows = await sqlClient(
      `SELECT tokens_used, queries_count
       FROM usage_daily
       WHERE workspace_id = $1 AND date = $2::date;`,
      [workspaceId, today]
    );

    const tokensUsed = Number(rows[0]?.tokens_used || 0);
    const queriesCount = Number(rows[0]?.queries_count || 0);

    return NextResponse.json({
      today,
      tokensUsed,
      dailyLimit: limit,
      queriesCount,
      percentage: Math.min(100, Math.round((tokensUsed / limit) * 100)),
      remaining: Math.max(0, limit - tokensUsed),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
