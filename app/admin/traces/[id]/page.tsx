"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  Zap,
  Terminal,
  Database,
  Network,
  Scale,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface TraceStep {
  id: string;
  step_index: number;
  step_type: string;
  input_summary: string;
  output_summary: string;
  latency_ms: number;
  tokens_used: number | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

interface TraceDetail {
  id: string;
  query_text: string;
  total_latency_ms: number;
  total_tokens: number;
  cache_hit: boolean;
  final_confidence: "verified" | "uncertain" | null;
  created_at: string;
}

export default function TraceDetailPage() {
  const params = useParams();
  const traceId = params.id as string;

  const [trace, setTrace] = useState<TraceDetail | null>(null);
  const [steps, setSteps] = useState<TraceStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  useEffect(() => {
    async function loadTrace() {
      try {
        const res = await fetch(`/api/admin/traces/${traceId}`);
        if (res.ok) {
          const data = await res.json();
          setTrace(data.trace);
          setSteps(data.steps || []);
        }
      } catch (e) {
        console.error("Failed to load trace detail:", e);
      } finally {
        setLoading(false);
      }
    }
    loadTrace();
  }, [traceId]);

  if (loading) {
    return (
      <div className="py-12 text-center text-xs font-mono text-ink/60">
        Loading trace telemetry...
      </div>
    );
  }

  if (!trace) {
    return (
      <div className="py-12 text-center text-xs font-mono text-ink/60">
        Trace record not found.
      </div>
    );
  }

  const getStepIcon = (type: string) => {
    switch (type) {
      case "plan":
        return <Layers className="w-4 h-4 text-index-red" />;
      case "cache_check":
        return <Zap className="w-4 h-4 text-folder-green" />;
      case "vector_retrieve":
      case "keyword_retrieve":
        return <Database className="w-4 h-4 text-ink" />;
      case "graph_retrieve":
        return <Network className="w-4 h-4 text-index-red" />;
      case "rerank":
        return <Scale className="w-4 h-4 text-ink" />;
      case "verify":
        return <ShieldCheck className="w-4 h-4 text-folder-green" />;
      default:
        return <Terminal className="w-4 h-4 text-ink/70" />;
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Back button */}
      <div>
        <Link
          href="/admin/traces"
          className="inline-flex items-center gap-1.5 text-xs font-mono text-ink/60 hover:text-index-red"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Trace Explorer</span>
        </Link>
      </div>

      {/* Query Banner */}
      <div className="bg-paper-dim border border-rule rounded-lg p-6 space-y-4 shadow-2xs">
        <div className="flex items-center justify-between border-b border-rule pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-ink/50">Trace ID:</span>
            <span className="text-xs font-mono font-bold text-ink">{trace.id}</span>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            {trace.cache_hit && (
              <span className="text-folder-green bg-folder-green/10 border border-folder-green/20 px-2 py-0.5 rounded font-bold">
                ⚡ Cache Hit
              </span>
            )}
            <span className="text-ink">Total Latency: <strong>{trace.total_latency_ms} ms</strong></span>
            <span className="text-ink">Tokens: <strong>{trace.total_tokens}</strong></span>
          </div>
        </div>

        <div>
          <span className="text-[11px] font-mono text-ink/50 uppercase block mb-1">
            Audited User Query:
          </span>
          <h1 className="font-serif text-2xl text-ink font-normal">
            &ldquo;{trace.query_text}&rdquo;
          </h1>
        </div>
      </div>

      {/* Timeline Steps */}
      <div className="space-y-4">
        <h2 className="font-serif text-lg font-bold text-ink flex items-center justify-between">
          <span>Step-by-Step Decision Pipeline ({steps.length} steps)</span>
          <span className="text-xs font-mono font-normal text-ink/50">
            Chronological order
          </span>
        </h2>

        <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-3 before:bottom-3 before:w-0.5 before:bg-rule">
          {steps.map((step) => {
            const isExpanded = expandedStep === step.id;

            return (
              <div
                key={step.id}
                className="relative bg-paper border border-rule rounded-lg p-4 shadow-2xs hover:border-ink/30 transition-all font-mono text-xs"
              >
                {/* Node Bullet */}
                <div className="absolute -left-6 top-4 -translate-x-1/2 w-4 h-4 rounded-full bg-paper border-2 border-index-red flex items-center justify-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-index-red" />
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded bg-paper-dim border border-rule flex items-center justify-center">
                      {getStepIcon(step.step_type)}
                    </div>
                    <div>
                      <span className="font-bold text-ink text-sm block uppercase tracking-wider">
                        #{step.step_index}: {step.step_type.replace("_", " ")}
                      </span>
                      <span className="text-[11px] text-ink/60">
                        {step.input_summary}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="text-ink font-semibold">{step.latency_ms} ms</span>
                    {step.tokens_used ? (
                      <span className="text-ink/60">{step.tokens_used} tokens</span>
                    ) : null}

                    {step.metadata && (
                      <button
                        onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                        className="p-1 rounded hover:bg-paper-dim text-ink/50 hover:text-ink transition-colors"
                        title="Toggle raw payload"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Output summary */}
                <div className="mt-3 pt-3 border-t border-rule/60 text-ink/80 font-sans text-xs bg-paper-dim p-2.5 rounded">
                  <span className="font-mono text-[10px] text-ink/50 uppercase block mb-0.5">
                    Step Output:
                  </span>
                  {step.output_summary}
                </div>

                {/* Expandable JSON Metadata */}
                {isExpanded && step.metadata && (
                  <div className="mt-3 p-3 bg-ink text-paper rounded text-[11px] font-mono overflow-x-auto">
                    <span className="text-paper/40 block mb-1 uppercase tracking-wider text-[9px]">
                      Raw Metadata:
                    </span>
                    <pre>{JSON.stringify(step.metadata, null, 2)}</pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
