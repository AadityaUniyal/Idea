import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users, workspace_members } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (session.workspace.role !== "admin") {
      return NextResponse.json({ error: "Only admins can invite members" }, { status: 403 });
    }

    const { email, role = "member" } = await req.json();
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Find or create user
    let existingUsers = await db.select().from(users).where(eq(users.email, email)).limit(1);
    let targetUser = existingUsers[0];

    if (!targetUser) {
      const [newUser] = await db
        .insert(users)
        .values({
          email,
          name: email.split("@")[0],
        })
        .returning();
      targetUser = newUser;
    }

    // Insert workspace membership
    const [membership] = await db
      .insert(workspace_members)
      .values({
        workspace_id: params.id,
        user_id: targetUser.id,
        role: role as "admin" | "member",
        invited_at: new Date(),
      })
      .returning();

    return NextResponse.json({ success: true, member: membership });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
