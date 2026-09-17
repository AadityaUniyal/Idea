import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { conversations } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    const convs = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.workspace_id, session.workspace.id),
          eq(conversations.user_id, session.user.id)
        )
      )
      .orderBy(desc(conversations.created_at));

    return NextResponse.json({ conversations: convs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    const body = await req.json().catch(() => ({}));
    const title = body.title || "New Inquiry";

    const [conv] = await db
      .insert(conversations)
      .values({
        workspace_id: session.workspace.id,
        user_id: session.user.id,
        title,
      })
      .returning();

    return NextResponse.json({ conversation: conv });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
