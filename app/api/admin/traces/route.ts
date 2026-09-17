import { NextRequest, NextResponse } from "next/server";
import { getSessionWorkspaceId } from "@/lib/auth/session";
import { sqlClient } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const workspaceId = await getSessionWorkspaceId();
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";

    let query = `
      SELECT 
        id,
        conversation_id,
        message_id,
        query_text,
        total_latency_ms,
        total_tokens,
        cache_hit,
        final_confidence,
        created_at
      FROM traces
      WHERE workspace_id = $1
    `;
    const params: any[] = [workspaceId];

    if (search.trim()) {
      query += ` AND query_text ILIKE $2`;
      params.push(`%${search.trim()}%`);
    }

    query += ` ORDER BY created_at DESC LIMIT 50;`;

    const traceList = await sqlClient(query, params);

    return NextResponse.json({ traces: traceList });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
