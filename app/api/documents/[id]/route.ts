import { NextRequest, NextResponse } from "next/server";
import { getSessionWorkspaceId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const workspaceId = await getSessionWorkspaceId();
    const doc = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, params.id), eq(documents.workspace_id, workspaceId)))
      .limit(1);

    if (!doc || doc.length === 0) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    return NextResponse.json({ document: doc[0] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const workspaceId = await getSessionWorkspaceId();
    await db
      .delete(documents)
      .where(and(eq(documents.id, params.id), eq(documents.workspace_id, workspaceId)));

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
