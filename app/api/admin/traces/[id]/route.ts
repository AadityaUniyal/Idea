import { NextRequest, NextResponse } from "next/server";
import { getSessionWorkspaceId } from "@/lib/auth/session";
import { sqlClient } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const workspaceId = await getSessionWorkspaceId();

    const traceRows = await sqlClient(
      `SELECT * FROM traces WHERE id = $1 AND workspace_id = $2 LIMIT 1;`,
      [params.id, workspaceId]
    );

    if (!traceRows || traceRows.length === 0) {
      return NextResponse.json({ error: "Trace not found" }, { status: 404 });
    }

    const steps = await sqlClient(
      `SELECT * FROM trace_steps WHERE trace_id = $1 ORDER BY step_index ASC;`,
      [params.id]
    );

    return NextResponse.json({
      trace: traceRows[0],
      steps,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
