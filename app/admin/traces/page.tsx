"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Terminal,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Zap,
  ChevronRight,
  Layers,
} from "lucide-react";

interface TraceSummary {
  id: string;
  conversation_id: string | null;
  query_text: string;
  total_latency_ms: number;
  total_tokens: number;
  cache_hit: boolean;
  final_confidence: "verified" | "uncertain" | null;
  created_at: string;
}

export default function TraceExplorerPage() {
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTraces();
  }, [search]);

  const fetchTraces = async () => {
    try {
      setLoading(true);
      const url = search ? `/api/admin/traces?search=${encodeURIComponent(search)}` : "/api/admin/traces";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setTraces(data.traces || []);
      }
    } catch (err) {
      console.error("Failed to load traces:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-rule pb-4">
        <div>
          <h1 className="font-serif text-3xl text-ink font-normal">
            Agent Trace Explorer
          </h1>
          <p className="text-sm text-ink/70 font-sans mt-0.5">
            Full execution observability: inspect plan decisions, CTE graph walks, cross-encoder scores, and self-audits.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-ink/40 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search queries..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-paper-dim border border-rule rounded text-xs font-mono focus:outline-none focus:border-index-red text-ink"
          />
        </div>
      </div>

      {/* Traces List */}
      {loading ? (
        <div className="py-12 text-center text-xs font-mono text-ink/60">
          Loading trace records...
        </div>
      ) : traces.length === 0 ? (
        <div className="bg-paper-dim border border-rule border-dashed p-12 text-center rounded-lg space-y-2">
          <Terminal className="w-8 h-8 text-ink/40 mx-auto" />
          <p className="font-serif text-base font-bold text-ink">
            No execution traces found
          </p>
          <p className="text-xs font-mono text-ink/50">
            Submit queries in the chat interface to generate real-time execution telemetry.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-rule border border-rule rounded-lg bg-paper overflow-hidden shadow-2xs">
          {traces.map((t) => (
            <Link
              key={t.id}
              href={`/admin/traces/${t.id}`}
              className="p-4 hover:bg-paper-dim/70 transition-colors flex items-center justify-between gap-4 block group font-mono text-xs"
            >
              {/* Query & ID */}
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-ink text-sm font-sans group-hover:text-index-red transition-colors truncate">
                    &ldquo;{t.query_text || "Query"}&rdquo;
                  </span>
                  {t.cache_hit && (
                    <span className="text-folder-green bg-folder-green/10 border border-folder-green/20 px-1.5 py-0.2 rounded text-[10px] font-bold">
                      ⚡ Cache Hit
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-ink/50 flex items-center gap-3">
                  <span>ID: {t.id.slice(0, 8)}</span>
                  <span>{new Date(t.created_at).toLocaleTimeString()}</span>
                </div>
              </div>

              {/* Metrics & Confidence */}
              <div className="flex items-center gap-6 shrink-0">
                <div className="text-right">
                  <span className="text-ink font-semibold block">
                    {t.total_latency_ms} ms
                  </span>
                  <span className="text-[10px] text-ink/50">
                    {t.total_tokens} tokens
                  </span>
                </div>

                <div>
                  {t.final_confidence === "verified" ? (
                    <span className="inline-flex items-center gap-1 text-folder-green bg-folder-green/10 border border-folder-green/20 px-2 py-0.5 rounded text-[11px] font-semibold">
                      <CheckCircle2 className="w-3 h-3" />
                      Verified
                    </span>
                  ) : t.final_confidence === "uncertain" ? (
                    <span className="inline-flex items-center gap-1 text-ink/70 bg-paper-dim border border-rule px-2 py-0.5 rounded text-[11px]">
                      <AlertCircle className="w-3 h-3" />
                      Uncertain
                    </span>
                  ) : (
                    <span className="text-[11px] text-ink/40">—</span>
                  )}
                </div>

                <ChevronRight className="w-4 h-4 text-ink/30 group-hover:text-index-red group-hover:translate-x-0.5 transition-all" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
