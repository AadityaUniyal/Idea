# DocMind — Advanced Multi-Tenant Agentic RAG Platform (v2.0)

> **DocMind** lets any team upload their messy internal knowledge (policies, contracts, PDFs, tickets, wikis) and interact with an agent that plans multi-hop reasoning, traverses a property graph, verifies its own claims before answering, caches semantically to stay fast and cheap, and logs a full trace of every decision made — on unified Neon PostgreSQL infrastructure with Groq inference.

---

## 🏛️ System Architecture

DocMind intentionally consolidates vector search, property graph storage, semantic caching, and execution tracing into a **single serverless PostgreSQL database (Neon)** rather than introducing four disjoint cloud vendors.

```
                         ┌─────────────────────────┐
                         │        Browser          │
                         │ (Next.js 14 App Router) │
                         └────────────┬────────────┘
                                      │ HTTPS
                         ┌────────────▼────────────┐
                         │   Next.js on Vercel     │
                         │ ┌─────────────────────┐ │
                         │ │ Margin-Note Chat UI │ │
                         │ ├─────────────────────┤ │
                         │ │ Admin Dashboard     │ │
                         │ ├─────────────────────┤ │
                         │ │ Trace Explorer      │ │
                         │ ├─────────────────────┤ │
                         │ │ Knowledge Graph View│ │
                         │ └──────────┬──────────┘ │
                         └────────────┼────────────┘
                                      │
               ┌──────────────────────┴──────────────────────┐
               ▼                                             ▼
   ┌─────────────────────────────┐               ┌─────────────────────────┐
   │   Neon Postgres (Single DB) │               │   Groq LPU Inference    │
   │  ┌─────────────────────────┐│               │  - Llama 3.3 70B        │
   │  │ Relational Multi-Tenancy││               │    (Answer Synthesis)   │
   │  │ (workspaces, users, docs││               │  - Llama 3.1 8B         │
   │  ├─────────────────────────┤│               │    (Plan, Decompose,    │
   │  │ pgvector Chunks (HNSW)  ││               │     Graph, Self-Verify) │
   │  ├─────────────────────────┤│               └─────────────────────────┘
   │  │ Property Graph Entities ││
   │  │ & Edges (Recursive CTE) ││
   │  ├─────────────────────────┤│
   │  │ Semantic Query Cache    ││
   │  ├─────────────────────────┤│
   │  │ Ingestion Job Queue     ││
   │  │ (FOR UPDATE SKIP LOCKED)││
   │  ├─────────────────────────┤│
   │  │ Observability Traces    ││
   │  └─────────────────────────┘│
   └─────────────────────────────┘
```

---

## ⚡ 12-Stage Agentic Query Pipeline

1. **Token-Bucket Rate Check**: Atomic SQL `UPDATE usage_daily SET tokens_used = tokens_used + $1 WHERE ... RETURNING` prevents race conditions under high concurrency.
2. **Query Vectorization**: 1024-dimensional dense semantic embedding.
3. **Semantic Cache Lookup**: Pgvector cosine distance search (`query_embedding <=> query_vec < 0.05`, > 0.95 similarity) against `query_cache`. Returns instant answer on hit with zero LLM token spend.
4. **Agentic Planning (Llama 3.1 8B)**: Classifies query complexity into `direct` single-fact lookup or `decompose` multi-hop synthesis.
5. **Query Decomposition**: Breaks cross-policy questions into targeted sub-questions.
6. **Hybrid Retrieval**:
   - **Vector Search**: pgvector HNSW cosine similarity across `chunks` (filtered by workspace).
   - **Full-Text Search**: PostgreSQL `to_tsvector` keyword search.
7. **Multi-Hop Knowledge Graph Traversal**: Walks 1-2 hops via **PostgreSQL Recursive CTE** across `graph_entities` and `graph_edges`, extracting relationship evidence.
8. **Cross-Encoder Re-Ranking**: Reranks merged candidates using `BAAI/bge-reranker-base` / cross-scorer to select top 6 factually dense chunks.
9. **Synthesis (Llama 3.3 70B)**: Streams answer while attributing each factual claim to indexed source markers `[1]`, `[2]`.
10. **Self-Verification Audit Loop (Llama 3.1 8B)**: Audits the generated answer against reference chunks, classifying confidence as `verified` or `uncertain`.
11. **Write-Through Semantic Cache**: Automatically stores verified Q&A pairs for subsequent hits.
12. **Full Observability Trace**: Commits structured latency, step types, tokens, and metadata to `traces` and `trace_steps`.

---

## 🎨 Design System: The Archive Aesthetic

DocMind avoids generic purple-gradient AI styling in favor of an **archive and physical indexing aesthetic**:

- `--ink` (`#1C1B19`): Deep warm text
- `--paper` (`#FAF8F4`): Warm uncoated paper background
- `--paper-dim` (`#F0ECE3`): Secondary card and panel surfaces
- `--rule` (`#D8D2C4`): Hairline dividers and borders
- `--index-red` (`#A8402F`): Accent color reserved exclusively for active states and citation tags
- `--folder-green` (`#4B5D45`): Secondary accent for verified states
- **Typography**: Fraunces (editorial serif headings), Inter (clean UI body), and IBM Plex Mono (citations, tags, timestamps).
- **Margin-Note Pattern**: Citations appear as interactive tabs sliding in on the right margin, expandable to display raw source chunks with page numbers.

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js 18+ or 20+
- Neon PostgreSQL Database (pgvector & pg_trgm enabled)
- Groq API Key

### 2. Environment Configuration
Create a `.env` file with:
```env
DATABASE_URL="postgresql://user:password@endpoint-pooler.neon.tech/neondb?sslmode=require"
GROQ_API_KEY="gsk_..."
CRON_SECRET="your_cron_secret"
NEXTAUTH_SECRET="your_nextauth_secret"
NEXTAUTH_URL="http://localhost:3000"
```

### 3. Database Migration & Seeding
```bash
# Run PostgreSQL schema migrations (creates all 14 tables and HNSW vector indexes)
npm run db:migrate

# Seed multi-hop enterprise documents, knowledge graph relations, and cache entries
npm run db:seed
```

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

### 5. Automated Evaluation Harness
```bash
npm run eval
```
Evaluates retrieval recall, LLM-as-judge faithfulness, and latency across 15+ benchmark test cases, outputting markdown reports to `eval/results/`.

---

## 💼 System Design Interview Talking Points

1. **Why one Postgres database instead of four separate vendors?**
   Consolidates relational tenancy, vector similarity (`pgvector` with HNSW), knowledge graphs (`graph_entities` + recursive CTEs), and traces into one database connection pool, drastically simplifying operations and eliminating cross-vendor failure points.
2. **Dual-Model Routing**:
   Sub-tasks (planning, query decomposition, graph extraction, and claim verification) run on the ultra-low-latency, low-cost Llama 3.1 8B, reserving Llama 3.3 70B exclusively for final answer synthesis.
3. **Queue Concurrency with `FOR UPDATE SKIP LOCKED`**:
   Background ingestion workers process documents without double-processing or distributed lock contention, completely eliminating the need for external SQS/Redis infrastructure on free-tier deployments.
4. **Self-Verification Loop**:
   Before delivering responses, the agent audits each factual assertion against the retrieved chunks. If evidence is missing, it explicitly marks confidence as `uncertain` rather than hallucinating.
