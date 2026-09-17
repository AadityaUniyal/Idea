import { NextRequest, NextResponse } from "next/server";
import { getSessionWorkspaceId } from "@/lib/auth/session";
import { sqlClient } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const workspaceId = await getSessionWorkspaceId();

    const entities = await sqlClient(
      `SELECT id, name, type, source_chunk_ids, created_at
       FROM graph_entities
       WHERE workspace_id = $1
       LIMIT 200;`,
      [workspaceId]
    );

    const edges = await sqlClient(
      `SELECT 
         e.id,
         e.from_entity_id as "source",
         e.to_entity_id as "target",
         e.relationship,
         e.confidence,
         e.source_chunk_id
       FROM graph_edges e
       WHERE e.workspace_id = $1
       LIMIT 400;`,
      [workspaceId]
    );

    return NextResponse.json({
      nodes: entities.map((n) => ({
        id: n.id,
        name: n.name,
        type: n.type,
      })),
      links: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        relationship: e.relationship,
        confidence: e.confidence,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
