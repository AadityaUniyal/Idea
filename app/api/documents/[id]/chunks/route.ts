import { NextRequest, NextResponse } from "next/server";
import { getSessionWorkspaceId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { chunks } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const workspaceId = await getSessionWorkspaceId();
    const docChunks = await db
      .select({
        id: chunks.id,
        content: chunks.content,
        page_number: chunks.page_number,
        chunk_index: chunks.chunk_index,
        created_at: chunks.created_at,
      })
      .from(chunks)
      .where(and(eq(chunks.document_id, params.id), eq(chunks.workspace_id, workspaceId)))
      .orderBy(asc(chunks.chunk_index));

    return NextResponse.json({ chunks: docChunks });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
