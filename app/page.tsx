import Link from "next/link";
import { Header } from "@/components/navigation/Header";
import { ArrowRight, CheckCircle2, Database, Network, Search, Zap, Layers, Sparkles } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-paper">
      <Header />

      {/* Hero Section */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-16 lg:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          {/* Left Column: Subject-Grounded Archive Copy */}
          <div className="lg:col-span-7 space-y-8">
            <div className="inline-flex items-center gap-2 border border-rule px-3 py-1 rounded bg-paper-dim">
              <span className="w-2 h-2 rounded-full bg-folder-green" />
              <span className="text-xs font-mono uppercase tracking-wider text-ink/70">
                Multi-Tenant Agentic Archive Intelligence
              </span>
            </div>

            <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-normal leading-[1.15] text-ink tracking-tight">
              Turn scattered documents into confident answers.
            </h1>

            <p className="text-lg text-ink/75 leading-relaxed max-w-2xl font-sans">
              DocMind connects your team&apos;s messy internal policies, technical specifications, and legal docs.
              It plans multi-hop retrieval, verifies claims against actual sources, traverses an indexed property graph,
              and tells you when it&apos;s not sure — instead of confidently making things up.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-4">
              <Link
                href="/chat"
                className="inline-flex items-center gap-2 bg-index-red text-paper px-6 py-3 rounded font-medium hover:bg-index-red/90 transition-colors shadow-sm"
              >
                <span>Launch Interactive Chat</span>
                <ArrowRight className="w-4 h-4" />
              </Link>

              <Link
                href="/admin/dashboard"
                className="inline-flex items-center gap-2 border border-rule bg-paper-dim text-ink px-6 py-3 rounded font-medium hover:border-ink/40 transition-colors"
              >
                <span>Admin Knowledge Base</span>
              </Link>
            </div>

            {/* Deliberate System Design Bulletins */}
            <div className="pt-8 border-t border-rule grid grid-cols-1 sm:grid-cols-3 gap-6 font-mono text-xs text-ink/70">
              <div>
                <span className="text-ink font-semibold block mb-1">Unified Storage</span>
                Postgres + pgvector + Property Graph + Traces in single Neon DB
              </div>
              <div>
                <span className="text-ink font-semibold block mb-1">Dual-Model Loop</span>
                Llama 3.1 8B for planning & Llama 3.3 70B for synthesis
              </div>
              <div>
                <span className="text-ink font-semibold block mb-1">Self-Verifying</span>
                Factual claim audit before answering; flags uncertainty
              </div>
            </div>
          </div>

          {/* Right Column: Live Interactive Interactive Preview */}
          <div className="lg:col-span-5 bg-paper-dim border border-rule rounded-lg p-6 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-rule pb-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rule" />
                <span className="w-3 h-3 rounded-full bg-rule" />
                <span className="w-3 h-3 rounded-full bg-rule" />
                <span className="text-xs font-mono ml-2 text-ink/60">docmind-query.session</span>
              </div>
              <span className="text-xs font-mono text-folder-green bg-folder-green/10 px-2 py-0.5 rounded">
                Verified Grounding
              </span>
            </div>

            <div className="space-y-4">
              <div className="bg-paper p-3 rounded border border-rule text-sm">
                <span className="text-xs font-mono text-ink/50 block mb-1">User Query:</span>
                <p className="font-medium text-ink">
                  &ldquo;How does our 15% restocking fee interact with EU consumer return requests?&rdquo;
                </p>
              </div>

              {/* Agent Plan Step */}
              <div className="bg-paper/70 p-2.5 rounded border border-dashed border-rule text-xs font-mono text-ink/80 flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-index-red shrink-0" />
                <span>
                  <strong>Plan:</strong> Decomposed into 2 sub-queries: [Acme Hardware Policy] &times; [EU Directive 2011/83].
                </span>
              </div>

              {/* Assistant Response with Margin Notes */}
              <div className="relative pl-3 border-l-2 border-index-red text-sm leading-relaxed text-ink/90 space-y-2">
                <p>
                  While Section 2 of Acme&apos;s Return Policy standardly assesses a 15% restocking fee on opened enterprise hardware{" "}
                  <span className="inline-block bg-index-red/10 text-index-red font-mono text-xs px-1.5 py-0.5 rounded cursor-pointer border border-index-red/20 font-semibold">
                    [1]
                  </span>
                  , Article 13 of the EU Consumer Rights Directive strictly overrides and prohibits restocking or inspection fees for EU resident returns{" "}
                  <span className="inline-block bg-index-red/10 text-index-red font-mono text-xs px-1.5 py-0.5 rounded cursor-pointer border border-index-red/20 font-semibold">
                    [2]
                  </span>.
                </p>
                <p className="text-xs text-ink/70">
                  Therefore, EU customers exercising their statutory 14-day right of withdrawal must receive a 100% full refund with zero restocking deduction.
                </p>
              </div>

              {/* Margin Note Citation Preview Card */}
              <div className="bg-paper p-3 rounded border border-rule text-xs font-mono space-y-1 mt-4">
                <div className="flex items-center justify-between text-index-red font-semibold">
                  <span>Source [2]: EU_Consumer_Rights_Directive_Compliance.md</span>
                  <span>Page 1</span>
                </div>
                <p className="text-ink/70 text-[11px] leading-normal italic">
                  &ldquo;...charging restocking fees, inspection penalties, or repackaging surcharges on EU consumer returns is strictly prohibited under European Community law...&rdquo;
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Three Index-Card Sections */}
        <section className="mt-24 pt-16 border-t border-rule">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-3">
              <div className="w-8 h-8 rounded bg-paper-dim border border-rule flex items-center justify-center text-ink font-mono text-sm font-bold">
                1
              </div>
              <h3 className="font-serif text-xl font-bold text-ink">Multi-Hop Graph Traversal</h3>
              <p className="text-sm text-ink/75 leading-relaxed">
                Vector search alone misses cross-document relationships. DocMind extracts concepts and regulations into a Postgres property graph, walking dependencies with recursive SQL queries.
              </p>
            </div>

            <div className="space-y-3">
              <div className="w-8 h-8 rounded bg-paper-dim border border-rule flex items-center justify-center text-ink font-mono text-sm font-bold">
                2
              </div>
              <h3 className="font-serif text-xl font-bold text-ink">Dual-Stage Re-Ranking</h3>
              <p className="text-sm text-ink/75 leading-relaxed">
                Combines HNSW pgvector similarity, BM25 full-text search, and a cross-encoder to elevate the most factually dense chunks before passing them to Llama 3.3 70B.
              </p>
            </div>

            <div className="space-y-3">
              <div className="w-8 h-8 rounded bg-paper-dim border border-rule flex items-center justify-center text-ink font-mono text-sm font-bold">
                3
              </div>
              <h3 className="font-serif text-xl font-bold text-ink">End-to-End Observability</h3>
              <p className="text-sm text-ink/75 leading-relaxed">
                Inspect every millisecond and token spent. The built-in Trace Explorer logs planning decisions, decomposed queries, retrieved chunks, and verification rationale.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-rule py-8 px-6 bg-paper-dim text-xs font-mono text-ink/60">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>DocMind &copy; 2026 — Advanced Enterprise RAG System Architecture</div>
          <div className="flex gap-6">
            <Link href="/admin/traces" className="hover:text-ink">Traces</Link>
            <Link href="/admin/graph" className="hover:text-ink">Knowledge Graph</Link>
            <Link href="/admin/documents" className="hover:text-ink">Document Catalog</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
