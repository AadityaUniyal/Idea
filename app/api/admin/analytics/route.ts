import { NextRequest, NextResponse } from "next/server";
import { getSessionWorkspaceId } from "@/lib/auth/session";
import { sqlClient } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const workspaceId = await getSessionWorkspaceId();

    // 1. Daily usage over last 14 days
    const dailyUsage = await sqlClient(
      `SELECT date, tokens_used, queries_count
       FROM usage_daily
       WHERE workspace_id = $1
       ORDER BY date DESC
       LIMIT 14;`,
      [workspaceId]
    );

    // 2. Aggregate stats
    const aggStats = await sqlClient(
      `SELECT 
         COUNT(*) as total_traces,
         COUNT(*) FILTER (WHERE cache_hit = true) as cache_hits,
         COUNT(*) FILTER (WHERE final_confidence = 'uncertain') as uncertain_count,
         AVG(total_latency_ms) as avg_latency_ms
       FROM traces
       WHERE workspace_id = $1;`,
      [workspaceId]
    );

    const totalTraces = Number(aggStats[0]?.total_traces || 0);
    const cacheHits = Number(aggStats[0]?.cache_hits || 0);
    const uncertainCount = Number(aggStats[0]?.uncertain_count || 0);
    const avgLatency = Math.round(Number(aggStats[0]?.avg_latency_ms || 0));

    const cacheHitRate = totalTraces > 0 ? ((cacheHits / totalTraces) * 100).toFixed(1) : "0.0";
    const uncertaintyRate = totalTraces > 0 ? ((uncertainCount / totalTraces) * 100).toFixed(1) : "0.0";

    // 3. Document count & readiness
    const docStats = await sqlClient(
      `SELECT 
         COUNT(*) as total_docs,
         COUNT(*) FILTER (WHERE status = 'ready') as ready_docs,
         COALESCE(SUM(chunk_count), 0) as total_chunks
       FROM documents
       WHERE workspace_id = $1;`,
      [workspaceId]
    );

    // 4. Latency breakdown per step type
    const stepBreakdown = await sqlClient(
      `SELECT 
         ts.step_type,
         ROUND(AVG(ts.latency_ms)) as avg_latency,
         COUNT(*) as count
       FROM trace_steps ts
       JOIN traces t ON t.id = ts.trace_id
       WHERE t.workspace_id = $1
       GROUP BY ts.step_type
       ORDER BY avg_latency DESC;`,
      [workspaceId]
    );

    return NextResponse.json({
      overview: {
        totalQueries: totalTraces,
        cacheHitRate: `${cacheHitRate}%`,
        uncertaintyRate: `${uncertaintyRate}%`,
        avgLatencyMs: avgLatency,
        totalDocs: Number(docStats[0]?.total_docs || 0),
        readyDocs: Number(docStats[0]?.ready_docs || 0),
        totalChunks: Number(docStats[0]?.total_chunks || 0),
        estimatedTokensSaved: cacheHits * 1800,
      },
      dailyUsage: dailyUsage.reverse(),
      stepBreakdown,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
