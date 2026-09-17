import { NextRequest, NextResponse } from "next/server";
import { getSessionWorkspaceId, getSession } from "@/lib/auth/session";
import { sqlClient, db } from "@/lib/db";
import { documents, ingestion_jobs } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const workspaceId = await getSessionWorkspaceId();
    const docs = await db
      .select()
      .from(documents)
      .where(eq(documents.workspace_id, workspaceId))
      .orderBy(desc(documents.created_at));

    return NextResponse.json({ documents: docs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    const workspaceId = session.workspace.id;
    const userId = session.user.id;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const rawContent = formData.get("content") as string | null;
    const customFilename = formData.get("filename") as string | null;

    if (!file && !rawContent) {
      return NextResponse.json({ error: "No file or text content provided" }, { status: 400 });
    }

    let filename = customFilename || "untitled.txt";
    let fileType: "pdf" | "docx" | "md" | "txt" = "txt";
    let fileData = "";

    if (file) {
      filename = file.name;
      const lower = filename.toLowerCase();
      if (lower.endsWith(".pdf")) fileType = "pdf";
      else if (lower.endsWith(".docx")) fileType = "docx";
      else if (lower.endsWith(".md")) fileType = "md";
      else fileType = "txt";

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      fileData = `data:application/octet-stream;base64,${buffer.toString("base64")}`;
    } else if (rawContent) {
      fileData = rawContent;
      fileType = filename.endsWith(".md") ? "md" : "txt";
    }

    // Insert Document
    const [doc] = await db
      .insert(documents)
      .values({
        workspace_id: workspaceId,
        uploaded_by: userId,
        filename,
        file_url: fileData,
        file_type: fileType,
        status: "pending",
      })
      .returning();

    // Insert queued ingestion job
    await db.insert(ingestion_jobs).values({
      document_id: doc.id,
      status: "queued",
    });

    return NextResponse.json({
      success: true,
      document: doc,
      message: "Document uploaded and queued for indexing",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
