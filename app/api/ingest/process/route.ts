import { NextRequest, NextResponse } from "next/server";
import { processIngestionQueue } from "@/lib/ingestion/processor";

export const maxDuration = 60; // 60s max execution for Vercel Hobby

export async function POST(req: NextRequest) {
  // Check authorization header if configured
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // In dev mode or from admin UI, allow if no bearer or if matches
    const isLocal = req.headers.get("host")?.includes("localhost");
    if (!isLocal && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized cron invocation" }, { status: 401 });
    }
  }

  try {
    const result = await processIngestionQueue();
    return NextResponse.json({ success: true, result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
