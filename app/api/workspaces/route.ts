import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { workspaces, users, workspace_members } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    return NextResponse.json({
      workspace: session.workspace,
      user: session.user,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    const { name, slug } = await req.json();

    if (!name || !slug) {
      return NextResponse.json({ error: "Name and slug are required" }, { status: 400 });
    }

    const [ws] = await db
      .insert(workspaces)
      .values({
        name,
        slug: slug.toLowerCase().replace(/[^\w-]/g, "-"),
        plan: "free",
        daily_token_limit: 50000,
      })
      .returning();

    // Add user as admin
    await db.insert(workspace_members).values({
      workspace_id: ws.id,
      user_id: session.user.id,
      role: "admin",
      joined_at: new Date(),
    });

    return NextResponse.json({ workspace: ws });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
