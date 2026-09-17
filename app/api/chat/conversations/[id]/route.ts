import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { conversations, messages } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    const conv = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.id, params.id),
          eq(conversations.workspace_id, session.workspace.id)
        )
      )
      .limit(1);

    if (!conv || conv.length === 0) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const msgList = await db
      .select()
      .from(messages)
      .where(eq(messages.conversation_id, params.id))
      .orderBy(asc(messages.created_at));

    return NextResponse.json({
      conversation: conv[0],
      messages: msgList,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    await db
      .delete(conversations)
      .where(
        and(
          eq(conversations.id, params.id),
          eq(conversations.workspace_id, session.workspace.id)
        )
      );

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
