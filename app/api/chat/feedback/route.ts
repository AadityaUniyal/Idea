import { NextRequest, NextResponse } from "next/server";
import { getSessionWorkspaceId } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const { messageId, feedback } = await req.json();

    if (!messageId || !["up", "down"].includes(feedback)) {
      return NextResponse.json({ error: "Invalid feedback payload" }, { status: 400 });
    }

    await db
      .update(messages)
      .set({ feedback })
      .where(eq(messages.id, messageId));

    return NextResponse.json({ success: true, feedback });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
