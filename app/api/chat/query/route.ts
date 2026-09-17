import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { executeAgentQuery } from "@/lib/ai/agent";
import { db } from "@/lib/db";
import { conversations, messages } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export const maxDuration = 60; // Up to 60s for agentic multi-hop retrieval and verification

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    const workspaceId = session.workspace.id;
    const userId = session.user.id;

    const body = await req.json();
    const { conversationId: rawConvId, message } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message text is required" }, { status: 400 });
    }

    let conversationId = rawConvId;

    // Ensure conversation exists or create one
    if (!conversationId) {
      const title = message.slice(0, 45) + (message.length > 45 ? "..." : "");
      const [newConv] = await db
        .insert(conversations)
        .values({
          workspace_id: workspaceId,
          user_id: userId,
          title,
        })
        .returning();
      conversationId = newConv.id;
    }

    // Save user message to database
    await db.insert(messages).values({
      conversation_id: conversationId,
      role: "user",
      content: message,
      token_count: Math.ceil(message.length / 4),
    });

    // Setup streaming response using TransformStream (SSE)
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    const sendEvent = async (type: string, payload: any) => {
      const data = `data: ${JSON.stringify({ type, payload })}\n\n`;
      await writer.write(encoder.encode(data));
    };

    // Run agent pipeline asynchronously streaming progress
    (async () => {
      try {
        const result = await executeAgentQuery({
          workspaceId,
          conversationId,
          query: message,
          onProgress: async (statusText, extraData) => {
            if (extraData?.strategy) {
              await sendEvent("plan", {
                summary: statusText,
                strategy: extraData.strategy,
                subquestions: extraData.subquestions,
              });
            } else {
              await sendEvent("status", { text: statusText });
            }
          },
        });

        // Send citations
        await sendEvent("citations", { citations: result.citations });

        // Stream answer tokens progressively
        const words = result.answer.split(" ");
        for (let i = 0; i < words.length; i += 3) {
          const chunk = words.slice(i, i + 3).join(" ") + " ";
          await sendEvent("token", { text: chunk });
        }

        // Save assistant message to database
        const [savedMsg] = await db
          .insert(messages)
          .values({
            conversation_id: conversationId,
            role: "assistant",
            content: result.answer,
            citations: result.citations,
            confidence: result.confidence,
            token_count: Math.ceil(result.answer.length / 4),
          })
          .returning();

        // Send completion payload
        await sendEvent("done", {
          conversationId,
          messageId: savedMsg.id,
          confidence: result.confidence,
          cacheHit: result.cacheHit,
          totalLatencyMs: result.totalLatencyMs,
          traceId: result.traceId,
        });
      } catch (agentErr: any) {
        console.error("Agent execution error:", agentErr);
        await sendEvent("error", { message: agentErr.message });
      } finally {
        await writer.close();
      }
    })();

    return new Response(stream.readable, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
