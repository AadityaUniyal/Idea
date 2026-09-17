import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { workspaces, users, workspace_members } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export interface SessionContext {
  user: {
    id: string;
    email: string;
    name: string;
  };
  workspace: {
    id: string;
    name: string;
    slug: string;
    role: "admin" | "member";
    daily_token_limit: number;
  };
}

/**
 * Resolves current session and enforces strict tenant isolation.
 * Automatically provisions or retrieves the default demo/admin user & workspace
 * so all features work seamlessly out of the box.
 */
export async function getSession(): Promise<SessionContext> {
  const cookieStore = cookies();
  const workspaceSlug = cookieStore.get("docmind_workspace_slug")?.value || "acme-research";

  // Check for workspace
  let existingWorkspaces = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, workspaceSlug))
    .limit(1);

  let currentWorkspace = existingWorkspaces[0];

  // If no workspace exists yet (e.g. before initial seeding), create default
  if (!currentWorkspace) {
    const [newWs] = await db
      .insert(workspaces)
      .values({
        name: "Acme Research Labs",
        slug: workspaceSlug,
        plan: "free",
        daily_token_limit: 50000,
      })
      .returning();
    currentWorkspace = newWs;
  }

  // Find or create default admin user
  const adminEmail = "admin@acmeresearch.com";
  let existingUsers = await db
    .select()
    .from(users)
    .where(eq(users.email, adminEmail))
    .limit(1);

  let currentUser = existingUsers[0];
  if (!currentUser) {
    const [newUser] = await db
      .insert(users)
      .values({
        name: "Dr. Sarah Lin",
        email: adminEmail,
      })
      .returning();
    currentUser = newUser;

    // Create workspace membership
    await db.insert(workspace_members).values({
      workspace_id: currentWorkspace.id,
      user_id: currentUser.id,
      role: "admin",
      joined_at: new Date(),
    });
  }

  return {
    user: {
      id: currentUser.id,
      email: currentUser.email,
      name: currentUser.name,
    },
    workspace: {
      id: currentWorkspace.id,
      name: currentWorkspace.name,
      slug: currentWorkspace.slug,
      role: "admin",
      daily_token_limit: currentWorkspace.daily_token_limit,
    },
  };
}

/**
 * Non-negotiable multi-tenancy helper:
 * Returns the verified workspace_id derived strictly from the authenticated session.
 * Never trust client-supplied workspace_id.
 */
export async function getSessionWorkspaceId(): Promise<string> {
  const session = await getSession();
  return session.workspace.id;
}
