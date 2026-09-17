"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Header } from "@/components/navigation/Header";
import {
  Send,
  PlusCircle,
  ThumbsUp,
  ThumbsDown,
  BookOpen,
  Sparkles,
  Layers,
  CheckCircle2,
  AlertCircle,
  FileText,
  Clock,
  Zap,
  ArrowRight,
} from "lucide-react";

interface Citation {
  chunk_id: string;
  document_id: string;
  filename: string;
  page_number?: number;
  snippet: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  confidence?: "verified" | "uncertain";
  feedback?: "up" | "down";
  planSummary?: string;
  cacheHit?: boolean;
  totalLatencyMs?: number;
  traceId?: string | null;
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputQuery, setInputQuery] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load conversations on mount
  useEffect(() => {
    fetchConversations();
  }, []);

  // Load messages when conversation changes
  useEffect(() => {
    if (activeConvId) {
      fetchMessages(activeConvId);
    } else {
      setMessages([]);
    }
  }, [activeConvId]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentPlan]);

  const fetchConversations = async () => {
    try {
      const res = await fetch("/api/chat/conversations");
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
        if (data.conversations && data.conversations.length > 0 && !activeConvId) {
          setActiveConvId(data.conversations[0].id);
        }
      }
    } catch (err) {
      console.error("Error loading conversations:", err);
    }
  };

  const fetchMessages = async (convId: string) => {
    try {
      const res = await fetch(`/api/chat/conversations/${convId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error("Error loading messages:", err);
    }
  };

  const startNewConversation = () => {
    setActiveConvId(null);
    setMessages([]);
    setCurrentPlan(null);
    setActiveCitation(null);
  };

  const handleSend = async (queryToSend?: string) => {
    const query = queryToSend || inputQuery;
    if (!query.trim() || isStreaming) return;

    setInputQuery("");
    setIsStreaming(true);
    setCurrentPlan(null);

    const tempUserMsg: Message = {
      id: "temp-" + Date.now(),
      role: "user",
      content: query,
    };

    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const response = await fetch("/api/chat/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConvId,
          message: query,
        }),
      });

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let assistantMsg: Message = {
        id: "msg-" + Date.now(),
        role: "assistant",
        content: "",
        citations: [],
      };

      setMessages((prev) => [...prev, assistantMsg]);

      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === "plan") {
                setCurrentPlan(event.payload.summary);
              } else if (event.type === "citations") {
                assistantMsg.citations = event.payload.citations;
                setMessages((prev) =>
                  prev.map((m, idx) =>
                    idx === prev.length - 1 ? { ...assistantMsg } : m
                  )
                );
              } else if (event.type === "token") {
                assistantMsg.content += event.payload.text;
                setMessages((prev) =>
                  prev.map((m, idx) =>
                    idx === prev.length - 1 ? { ...assistantMsg } : m
                  )
                );
              } else if (event.type === "done") {
                assistantMsg.id = event.payload.messageId;
                assistantMsg.confidence = event.payload.confidence;
                assistantMsg.cacheHit = event.payload.cacheHit;
                assistantMsg.totalLatencyMs = event.payload.totalLatencyMs;
                assistantMsg.traceId = event.payload.traceId;

                setMessages((prev) =>
                  prev.map((m, idx) =>
                    idx === prev.length - 1 ? { ...assistantMsg } : m
                  )
                );

                if (event.payload.conversationId && event.payload.conversationId !== activeConvId) {
                  setActiveConvId(event.payload.conversationId);
                  fetchConversations();
                }
              }
            } catch (e) {
              console.warn("Error parsing stream event:", e);
            }
          }
        }
      }
    } catch (err: any) {
      console.error("Chat error:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: "err-" + Date.now(),
          role: "assistant",
          content: `An error occurred: ${err.message}`,
          confidence: "uncertain",
        },
      ]);
    } finally {
      setIsStreaming(false);
      setCurrentPlan(null);
    }
  };

  const handleFeedback = async (messageId: string, feedback: "up" | "down") => {
    try {
      await fetch("/api/chat/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, feedback }),
      });

      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, feedback } : m))
      );
    } catch (e) {
      console.error("Failed to record feedback:", e);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-paper">
      <Header />

      <div className="flex-1 max-w-7xl w-full mx-auto flex overflow-hidden">
        {/* Left Sidebar: Conversations Archive */}
        <aside className="w-72 border-r border-rule bg-paper-dim flex flex-col shrink-0 p-4">
          <div className="flex items-center justify-between pb-4 border-b border-rule mb-4">
            <span className="font-serif text-base font-bold text-ink flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-index-red" />
              Inquiries
            </span>
            <button
              onClick={startNewConversation}
              className="p-1.5 hover:bg-paper rounded border border-rule text-ink hover:text-index-red transition-colors"
              title="New Inquiry"
            >
              <PlusCircle className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            {conversations.length === 0 ? (
              <div className="text-xs text-ink/60 italic p-3 text-center">
                No past inquiries yet.
              </div>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setActiveConvId(conv.id)}
                  className={`w-full text-left p-2.5 rounded text-xs font-mono truncate transition-colors border ${
                    activeConvId === conv.id
                      ? "bg-paper border-index-red/40 text-index-red font-semibold shadow-2xs"
                      : "border-transparent text-ink/75 hover:bg-paper hover:text-ink"
                  }`}
                >
                  {conv.title}
                </button>
              ))
            )}
          </div>

          <div className="pt-4 border-t border-rule text-xs font-mono text-ink/50 flex items-center justify-between">
            <span>Tenant: Acme Labs</span>
            <span className="text-folder-green">● Connected</span>
          </div>
        </aside>

        {/* Center Main Chat Column */}
        <main className="flex-1 flex flex-col min-w-0 bg-paper">
          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col justify-center items-start max-w-2xl mx-auto py-12 space-y-6">
                <div className="space-y-2">
                  <span className="text-xs font-mono text-index-red uppercase tracking-widest font-semibold">
                    Document Archive Agent
                  </span>
                  <h2 className="font-serif text-3xl font-normal text-ink">
                    Ask anything about Acme Research Labs&apos; docs
                  </h2>
                  <p className="text-sm text-ink/70 leading-relaxed font-sans">
                    Ask questions across refund terms, EU regulations, and Cloud SLAs.
                    Answers are synthesized with recursive graph reasoning and backed by verified source citations.
                  </p>
                </div>

                {/* Example Questions from Actual Seeded Docs */}
                <div className="w-full space-y-2 pt-4">
                  <span className="text-xs font-mono text-ink/50 uppercase tracking-wider">
                    Suggested Inquiries:
                  </span>
                  {[
                    "How does our 15% restocking fee interact with EU consumer return requests?",
                    "What is our standard return window and exception process under company policy?",
                    "What are the response time SLAs and service credits for a Severity 1 outage?",
                  ].map((example, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(example)}
                      className="w-full text-left p-3 rounded bg-paper-dim border border-rule hover:border-index-red/50 hover:bg-paper text-sm text-ink/90 flex items-center justify-between group transition-all"
                    >
                      <span className="font-mono text-xs text-ink/80">&ldquo;{example}&rdquo;</span>
                      <ArrowRight className="w-4 h-4 text-ink/30 group-hover:text-index-red transition-colors shrink-0 ml-3" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, index) => (
                <div
                  key={msg.id || index}
                  className={`flex flex-col ${
                    msg.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <div className="text-[11px] font-mono text-ink/40 mb-1 px-1 flex items-center gap-2">
                    <span>{msg.role === "user" ? "You" : "DocMind Agent"}</span>
                    {msg.cacheHit && (
                      <span className="text-folder-green bg-folder-green/10 px-1.5 py-0.2 rounded font-bold">
                        ⚡ Semantic Cache Hit
                      </span>
                    )}
                    {msg.totalLatencyMs && (
                      <span>{(msg.totalLatencyMs / 1000).toFixed(2)}s</span>
                    )}
                  </div>

                  <div
                    className={`rounded-lg p-4 max-w-2xl text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-paper-dim border border-rule text-ink font-medium"
                        : "bg-paper border border-rule text-ink shadow-2xs space-y-3"
                    }`}
                  >
                    {/* Assistant Message Content */}
                    <div className="whitespace-pre-wrap font-sans text-ink/90">
                      {msg.content}
                    </div>

                    {/* Confidence & Trace Banner for Assistant */}
                    {msg.role === "assistant" && (
                      <div className="pt-2 border-t border-rule/60 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          {msg.confidence === "verified" ? (
                            <span className="inline-flex items-center gap-1 text-folder-green font-mono text-[11px] font-semibold bg-folder-green/10 px-2 py-0.5 rounded">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Verified Grounding
                            </span>
                          ) : msg.confidence === "uncertain" ? (
                            <span className="inline-flex items-center gap-1 text-ink/60 font-mono text-[11px] bg-paper-dim px-2 py-0.5 rounded border border-rule">
                              <AlertCircle className="w-3.5 h-3.5" />
                              Uncertain / Partial Support
                            </span>
                          ) : null}

                          {msg.traceId && (
                            <Link
                              href={`/admin/traces/${msg.traceId}`}
                              className="font-mono text-[11px] text-ink/50 hover:text-index-red underline"
                            >
                              Inspect Trace
                            </Link>
                          )}
                        </div>

                        {/* Thumbs Feedback */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleFeedback(msg.id, "up")}
                            className={`p-1 rounded hover:bg-paper-dim ${
                              msg.feedback === "up" ? "text-folder-green" : "text-ink/40"
                            }`}
                            title="Helpful"
                          >
                            <ThumbsUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleFeedback(msg.id, "down")}
                            className={`p-1 rounded hover:bg-paper-dim ${
                              msg.feedback === "down" ? "text-index-red" : "text-ink/40"
                            }`}
                            title="Not accurate"
                          >
                            <ThumbsDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Progressive Margin Note Citation Tabs (Section 2 & 9) */}
                  {msg.role === "assistant" && msg.citations && msg.citations.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5 max-w-2xl pl-1">
                      <span className="text-[11px] font-mono text-ink/50 self-center mr-1">
                        Sources:
                      </span>
                      {msg.citations.map((cit, cIdx) => (
                        <button
                          key={cit.chunk_id || cIdx}
                          onClick={() => setActiveCitation(cit)}
                          className="inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded bg-paper-dim hover:bg-paper border border-rule hover:border-index-red text-ink/80 hover:text-index-red transition-all cursor-pointer shadow-2xs"
                        >
                          <FileText className="w-3 h-3 text-index-red" />
                          <span className="truncate max-w-[150px]">{cit.filename}</span>
                          <span className="text-index-red font-semibold">[{cIdx + 1}]</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}

            {/* Current Plan Indicator Banner */}
            {isStreaming && currentPlan && (
              <div className="flex items-center gap-2 p-3 bg-paper-dim rounded border border-dashed border-index-red/40 text-xs font-mono text-ink/80 animate-pulse">
                <Layers className="w-4 h-4 text-index-red shrink-0" />
                <span>{currentPlan}</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Bottom Chat Input */}
          <div className="p-4 border-t border-rule bg-paper">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-3 max-w-4xl mx-auto"
            >
              <input
                type="text"
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                placeholder="Ask about policies, regulations, SLA terms, or multi-hop logic..."
                disabled={isStreaming}
                className="flex-1 bg-paper-dim border border-rule rounded-md px-4 py-3 text-sm text-ink placeholder:text-ink/40 focus:outline-none focus:border-index-red font-sans"
              />
              <button
                type="submit"
                disabled={!inputQuery.trim() || isStreaming}
                className="bg-index-red text-paper px-5 py-3 rounded-md font-medium text-sm hover:bg-index-red/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 shadow-sm"
              >
                <span>Ask</span>
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </main>

        {/* Right Margin Note Drawer: Inspect Active Citation */}
        {activeCitation && (
          <aside className="w-80 border-l border-rule bg-paper-dim p-4 flex flex-col shrink-0">
            <div className="flex items-center justify-between pb-3 border-b border-rule mb-3">
              <span className="text-xs font-mono uppercase tracking-wider text-index-red font-bold">
                Source Document
              </span>
              <button
                onClick={() => setActiveCitation(null)}
                className="text-xs font-mono text-ink/60 hover:text-ink"
              >
                ✕ Close
              </button>
            </div>

            <div className="space-y-3 overflow-y-auto flex-1">
              <div>
                <span className="text-[11px] font-mono text-ink/50 block">File:</span>
                <p className="text-xs font-mono font-semibold text-ink break-words">
                  {activeCitation.filename}
                </p>
              </div>

              <div>
                <span className="text-[11px] font-mono text-ink/50 block">Location:</span>
                <p className="text-xs font-mono text-ink">
                  Page {activeCitation.page_number ?? 1}
                </p>
              </div>

              <div className="pt-2 border-t border-rule">
                <span className="text-[11px] font-mono text-ink/50 block mb-1">
                  Extracted Context Chunk:
                </span>
                <div className="bg-paper p-3 rounded border border-rule text-xs font-mono leading-relaxed text-ink/85 whitespace-pre-wrap">
                  {activeCitation.snippet}
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
