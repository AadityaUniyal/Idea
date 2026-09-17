"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Zap,
  Clock,
  HelpCircle,
  Database,
  ArrowUpRight,
  ShieldCheck,
  BarChart3,
  Layers,
} from "lucide-react";

interface AnalyticsData {
  overview: {
    totalQueries: number;
    cacheHitRate: string;
    uncertaintyRate: string;
    avgLatencyMs: number;
    totalDocs: number;
    readyDocs: number;
    totalChunks: number;
    estimatedTokensSaved: number;
  };
  dailyUsage: Array<{
    date: string;
    tokens_used: number;
    queries_count: number;
  }>;
  stepBreakdown: Array<{
    step_type: string;
    avg_latency: number;
    count: number;
  }>;
}

interface UsageData {
  today: string;
  tokensUsed: number;
  dailyLimit: number;
  queriesCount: number;
  percentage: number;
  remaining: number;
}

export default function AdminDashboardPage() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [aRes, uRes] = await Promise.all([
          fetch("/api/admin/analytics"),
          fetch("/api/admin/usage"),
        ]);

        if (aRes.ok) setAnalytics(await aRes.json());
        if (uRes.ok) setUsage(await uRes.json());
      } catch (err) {
        console.error("Failed to load admin metrics:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="p-12 text-center font-mono text-xs text-ink/60">
        Loading workspace metrics...
      </div>
    );
  }

  const overview = analytics?.overview;

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl text-ink font-normal">
            Workspace Overview & Health
          </h1>
          <p className="text-sm text-ink/70 font-sans mt-1">
            Telemetry across agent planning, pgvector semantic cache, and multi-hop reasoning.
          </p>
        </div>
        <Link
          href="/chat"
          className="inline-flex items-center gap-1 text-xs font-mono text-paper bg-ink px-4 py-2 rounded hover:bg-index-red transition-colors"
        >
          <span>Open Chat Agent</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Inquiries */}
        <div className="bg-paper-dim border border-rule p-4 rounded-lg space-y-1">
          <span className="text-xs font-mono text-ink/60 uppercase tracking-wider block">
            Total Inquiries
          </span>
          <div className="text-3xl font-mono font-bold text-ink">
            {overview?.totalQueries ?? 0}
          </div>
          <span className="text-[11px] font-mono text-ink/50 block">
            Avg Latency: {overview?.avgLatencyMs ?? 0}ms
          </span>
        </div>

        {/* Semantic Cache Hit Rate */}
        <div className="bg-paper-dim border border-rule p-4 rounded-lg space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-ink/60 uppercase tracking-wider">
              Cache Hit Rate
            </span>
            <Zap className="w-3.5 h-3.5 text-folder-green" />
          </div>
          <div className="text-3xl font-mono font-bold text-folder-green">
            {overview?.cacheHitRate ?? "0.0%"}
          </div>
          <span className="text-[11px] font-mono text-ink/50 block">
            ~{overview?.estimatedTokensSaved ?? 0} tokens saved
          </span>
        </div>

        {/* Uncertainty Rate */}
        <div className="bg-paper-dim border border-rule p-4 rounded-lg space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-ink/60 uppercase tracking-wider">
              Uncertainty Rate
            </span>
            <HelpCircle className="w-3.5 h-3.5 text-index-red" />
          </div>
          <div className="text-3xl font-mono font-bold text-ink">
            {overview?.uncertaintyRate ?? "0.0%"}
          </div>
          <span className="text-[11px] font-mono text-ink/50 block">
            Signals knowledge base gaps
          </span>
        </div>

        {/* Indexed Records */}
        <div className="bg-paper-dim border border-rule p-4 rounded-lg space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-ink/60 uppercase tracking-wider">
              Indexed Library
            </span>
            <Database className="w-3.5 h-3.5 text-ink/60" />
          </div>
          <div className="text-3xl font-mono font-bold text-ink">
            {overview?.readyDocs ?? 0} / {overview?.totalDocs ?? 0}
          </div>
          <span className="text-[11px] font-mono text-ink/50 block">
            {overview?.totalChunks ?? 0} vectorized chunks
          </span>
        </div>
      </div>

      {/* Daily Token Limit Progress Bar */}
      {usage && (
        <div className="bg-paper-dim border border-rule p-5 rounded-lg space-y-3">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="font-semibold text-ink uppercase tracking-wider">
              Daily Token-Bucket Usage ({usage.today})
            </span>
            <span className="text-ink/70">
              <strong>{usage.tokensUsed.toLocaleString()}</strong> /{" "}
              {usage.dailyLimit.toLocaleString()} tokens ({usage.percentage}%)
            </span>
          </div>
          <div className="w-full bg-paper h-2.5 rounded-full overflow-hidden border border-rule">
            <div
              className={`h-full transition-all duration-500 ${
                usage.percentage > 85 ? "bg-index-red" : "bg-folder-green"
              }`}
              style={{ width: `${Math.min(usage.percentage, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] font-mono text-ink/50">
            <span>Queries Today: {usage.queriesCount}</span>
            <span>Remaining: {usage.remaining.toLocaleString()} tokens</span>
          </div>
        </div>
      )}

      {/* Step Latency Breakdown Table (Section 11) */}
      <div className="bg-paper border border-rule rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-rule pb-3">
          <div>
            <h2 className="font-serif text-lg font-bold text-ink">
              Agent Execution Step Latency Breakdown
            </h2>
            <p className="text-xs font-mono text-ink/60">
              Aggregated across real traces to identify retrieval vs synthesis bottlenecks
            </p>
          </div>
          <Link
            href="/admin/traces"
            className="text-xs font-mono text-index-red hover:underline"
          >
            View All Traces →
          </Link>
        </div>

        {analytics?.stepBreakdown && analytics.stepBreakdown.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-rule text-ink/60">
                  <th className="py-2">Pipeline Step</th>
                  <th className="py-2">Average Latency</th>
                  <th className="py-2">Execution Count</th>
                  <th className="py-2">Share of Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule/60">
                {analytics.stepBreakdown.map((step) => {
                  const maxLat = Math.max(...analytics.stepBreakdown.map((s) => s.avg_latency), 1);
                  const pct = Math.round((step.avg_latency / maxLat) * 100);

                  return (
                    <tr key={step.step_type} className="hover:bg-paper-dim">
                      <td className="py-2.5 font-semibold text-ink uppercase">
                        {step.step_type.replace("_", " ")}
                      </td>
                      <td className="py-2.5 text-ink">{step.avg_latency} ms</td>
                      <td className="py-2.5 text-ink/70">{step.count}</td>
                      <td className="py-2.5 w-48">
                        <div className="w-full bg-paper-dim border border-rule h-2 rounded overflow-hidden">
                          <div
                            className="bg-ink h-full rounded"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-xs font-mono text-ink/50">
            No query traces logged yet. Ask questions in the chat to populate telemetry.
          </div>
        )}
      </div>
    </div>
  );
}
