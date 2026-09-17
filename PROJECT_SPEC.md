# DocMind — Advanced Multi-Tenant Agentic RAG Platform
### Full Product & Engineering Specification (v2.0 — Advanced Edition)

> **Purpose of this document:** This is a complete build spec for an AI coding assistant to generate a full-stack, production-shaped web application from scratch. Follow every section in order. Where a decision is left open, make one and note it — do not leave placeholders.

---

## 1. What This Product Actually Is

**One-line pitch:** DocMind lets any team upload their messy internal knowledge (docs, PDFs, tickets, wikis) and get a chat agent that answers questions correctly — and tells you when it's not sure, instead of confidently making things up.

**The real problem it solves:** Every company has knowledge scattered across Notion pages, PDFs, Slack exports, and old tickets. Naive "ChatGPT over your docs" tools retrieve the wrong context, fail on multi-hop questions ("how does our refund policy interact with the EU return law doc?"), and answer confidently anyway. DocMind is an **agentic RAG platform**: it plans how to answer, retrieves via both vector similarity and a knowledge graph, re-ranks with a real cross-encoder, verifies its own claims before answering, caches semantically to stay fast and cheap, and logs a full trace of every decision it made — all on entirely free-tier infrastructure.

This v2.0 spec is written for an **advanced-level build**. It assumes the builder wants real system-design depth: multi-layer caching, background job orchestration, a graph store, an eval harness, and observability — not just a working chatbot. Every "advanced" addition below is scoped to work within free tiers; none require a credit card.

**Who uses it:**
- **Admins (workspace owners):** upload/manage the knowledge base, invite team members, see usage analytics, configure the agent's behavior.
- **End users (team members):** ask questions in a chat interface, see sourced answers, give feedback (thumbs up/down) that improves retrieval over time.

This is a **multi-tenant SaaS**: multiple companies ("workspaces"), each with isolated data, users, and usage limits.

---

## 2. Design Direction (do not default to generic AI-app styling)

Explicitly avoid: neon gradients, purple-to-blue hero gradients, glassmorphism, generic "SaaS card kit" with identical rounded shadows, tracked-out ALL-CAPS eyebrow labels, and the cream-background/terracotta-accent look that has become the default "AI product" cliché.

**Subject-grounded direction:** DocMind is about *turning scattered documents into confident answers*. Lean into the visual language of **archives, indexing, and paper systems** — not futuristic AI. Think: a well-run research library or a physical filing system, reinterpreted digitally. This gives the product a grounded, trustworthy feel instead of a generic "AI startup" feel.

### Token system

**Color palette (named, not decorative):**
- `--ink` `#1C1B19` — primary text, near-black but warm, not pure black
- `--paper` `#FAF8F4` — background, warm off-white (like uncoated paper stock)
- `--paper-dim` `#F0ECE3` — secondary surface (cards, panels)
- `--rule` `#D8D2C4` — hairline borders/dividers, muted tan-grey
- `--index-red` `#A8402F` — single accent color, a muted brick/index-card red (used ONLY for: active states, the "ask" action, and citation markers — nowhere else)
- `--folder-green` `#4B5D45` — secondary accent for admin/system states (success, "verified" badges) — used sparingly, never alongside index-red in the same component

**Typography:**
- Headings/display: **Fraunces** (a serif with real personality, warm and slightly editorial — evokes printed archive material) at weights 400/600
- Body/UI: **Inter** — clean, functional, for chat text, forms, tables
- Data/citations/source tags: **IBM Plex Mono** at small size — used specifically for citation markers, file names, and timestamps, reinforcing the "indexed record" feel

**Layout concept:**
- Left-aligned, document-like rhythm rather than centered marketing blocks. Line length capped at ~72 characters for body/chat text.
- The chat interface uses a **margin note** pattern: citations don't appear as inline superscript numbers only — they appear as small tabs in a right-hand margin (like sticky notes on a physical document), which the user can click to expand the source. This is the one distinctive/bold interaction in the product; everything else stays quiet.
- Admin dashboard uses a **card catalog / index card** metaphor for the document library: each uploaded doc is shown as a horizontal record row (title, type, ingestion status, chunk count) rather than a generic file-icon grid.

```
Landing page wireframe (ASCII):
┌────────────────────────────────────────┐
│ DocMind          [Sign in] [Get started]│
├────────────────────────────────────────┤
│  Fraunces headline, left aligned,       │
│  ~60% width. Real product copy, not     │
│  "Unlock the power of AI."              │
│                                          │
│  [ Live embedded chat demo, real ]      │
│  [ sample workspace, answers with ]     │
│  [ margin-note citations visible  ]     │
├────────────────────────────────────────┤
│  Three short sections, left-aligned,    │
│  index-card dividers (hairline rules)   │
│  not numbered 01/02/03 unless truly     │
│  sequential (ingestion IS sequential,   │
│  so THAT section can use step markers)  │
└────────────────────────────────────────┘
```

**Motion:** One deliberate moment only — when a chat answer streams in, the margin citation tabs slide in from the right edge as they're referenced, in sync with the text. No fade-slide-up on scroll, no hover-lift on every card.

**Copy voice:** Plain, active, specific. "Upload your docs" not "Unlock your knowledge." Empty states say what to do next ("No documents yet — upload a PDF or connect a folder to get started"), not generic filler.

---

## 3. Tech Stack (all free-tier viable, Vercel-deployable)

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 14 (App Router)** | API routes = serverless functions, deploys natively on Vercel |
| Language | TypeScript throughout, strict mode | type safety across frontend/backend boundary, catches contract drift between API and UI |
| Styling | Tailwind CSS + CSS variables for the token system above | fast, but tokens prevent "default Tailwind look" |
| Database | **Neon (serverless Postgres)** | free tier, scales to zero, branching for preview environments (see Section 15), works natively with Vercel's serverless model via pooled connections |
| ORM | **Drizzle ORM** | lightweight, type-safe, generates SQL close to the metal (matters once you're writing hybrid vector+graph+FTS queries by hand) |
| Vector storage | **Postgres `pgvector` (HNSW index)** on the same Neon database | one database for relational + vector + graph data — avoids a second vendor, and HNSW indexing keeps ANN search fast even as chunk count grows |
| Graph storage | **Postgres tables modeling a property graph** (`graph_entities`, `graph_edges`) — no separate graph DB vendor | recursive CTEs in Postgres can do multi-hop traversal; avoids adding Neo4j/a paid graph vendor just for this feature |
| Auth | **Auth.js (NextAuth v5)** with email magic link + Google OAuth | free, no separate vendor needed |
| LLM inference (reasoning/planning) | **Groq API** (Llama 3.3 70B) | free tier, extremely low latency — critical since the agentic loop makes multiple LLM calls per query and latency compounds |
| LLM inference (fast/cheap sub-tasks) | **Groq API** (Llama 3.1 8B) for query decomposition, re-ranking prompts, and cache-similarity judgments | using a small model for cheap sub-steps and a large model only for final synthesis is itself a system-design decision worth stating explicitly |
| Embeddings | **Voyage AI free tier** (voyage-3-lite) | hosted, no local model needed in a serverless function |
| Re-ranking | **Cross-encoder via Hugging Face free Inference API** (`BAAI/bge-reranker-base`) | a real second-stage re-ranker, not just a weighted score blend — meaningfully improves precision on the top-k passed to the LLM |
| File storage | **Vercel Blob** (free tier) | original uploaded PDFs/docs |
| Background jobs / orchestration | **Vercel Cron + a Postgres-backed job queue with row-level locking (`FOR UPDATE SKIP LOCKED`)** | this is the "advanced" version of a job queue — safe for concurrent workers without a Redis/SQS vendor, and `SKIP LOCKED` is a genuine production Postgres pattern worth explaining in interviews |
| Caching | **Two-tier cache**: (1) in-memory LRU cache inside each serverless function's execution context for the current request's repeated sub-calls, (2) a **Postgres semantic cache table** (`query_cache`) storing query embedding + answer, checked via pgvector similarity before any LLM call | avoids needing Redis/Upstash for caching while still getting the real latency/cost benefit |
| Observability / tracing | **Custom trace table in Postgres** (`traces`, `trace_steps`) + a simple admin UI to view them | replaces a paid tool like LangSmith/Helicone with a self-built equivalent — free, and demonstrates you understand *what* observability needs to capture, not just that you bolted on a vendor SDK |
| Eval harness | **A TypeScript script run via `tsx`, stored in `/eval`, executed manually or via a free GitHub Actions workflow** on push | free CI, no vendor needed |
| Rate limiting | Postgres table (`usage_daily`) + **token-bucket algorithm implemented in SQL** (atomic `UPDATE ... RETURNING` to avoid race conditions under concurrent requests) | correct under concurrency without Redis |
| Deployment | **Vercel** (Hobby/free tier) | as specified; note Hobby tier's cron minimum interval and function timeout limits are respected in the design (see Section 14) |

---

## 4. High-Level Architecture

```
                         ┌─────────────────────────┐
                         │        Browser           │
                         │  (Next.js client, React) │
                         └────────────┬─────────────┘
                                      │ HTTPS
                         ┌────────────▼─────────────┐
                         │   Next.js on Vercel       │
                         │  ┌─────────────────────┐  │
                         │  │ App Router pages     │  │
                         │  │ (admin + user UI)    │  │
                         │  └─────────────────────┘  │
                         │  ┌─────────────────────┐  │
                         │  │ API routes           │  │
                         │  │ /api/auth/*          │  │
                         │  │ /api/documents/*     │  │
                         │  │ /api/chat/*  (agentic)│  │
                         │  │ /api/ingest/*        │  │
                         │  │ /api/admin/*         │  │
                         │  │ /api/traces/*        │  │
                         │  └───┬─────────┬─────────┘  │
                         └──────┼─────────┼─────────────┘
                                │         │
              ┌─────────────────┘         └────────────────┐
              ▼                                             ▼
  ┌─────────────────────────────┐               ┌─────────────────────────┐
  │   Neon Postgres (single DB)  │               │  External APIs           │
  │  ┌─────────────────────────┐│               │  - Groq (LLM: 70B + 8B)  │
  │  │ relational tables        ││               │  - Voyage AI (embeddings)│
  │  │ (users, workspaces,      ││               │  - HF Inference API      │
  │  │  documents, chats)       ││               │    (cross-encoder)       │
  │  └─────────────────────────┘│               │  - Vercel Blob (files)   │
  │  ┌─────────────────────────┐│               └─────────────────────────┘
  │  │ pgvector table           ││
  │  │ (chunks + HNSW index)    ││
  │  └─────────────────────────┘│
  │  ┌─────────────────────────┐│
  │  │ graph_entities/edges     ││   ← multi-hop reasoning via recursive CTE
  │  └─────────────────────────┘│
  │  ┌─────────────────────────┐│
  │  │ query_cache              ││   ← semantic cache, checked before any LLM call
  │  │ (embedding + answer)     ││
  │  └─────────────────────────┘│
  │  ┌─────────────────────────┐│
  │  │ traces / trace_steps     ││   ← full observability of every agent decision
  │  └─────────────────────────┘│
  │  ┌─────────────────────────┐│
  │  │ ingestion_jobs           ││   ← Postgres queue, FOR UPDATE SKIP LOCKED,
  │  │ (queue, row-locked)      ││     polled by Vercel Cron every 1 min
  │  └─────────────────────────┘│
  └──────────────────────────────┘
```

**Everything lives in one Postgres database (Neon).** This is a deliberate architectural choice: instead of separate vendors for vector search, graph storage, caching, and observability, all four live as tables in the same Postgres instance — one connection pool, one free tier, one backup story, and genuinely how a lean, cost-conscious production system is built. The "advanced" part isn't more vendors — it's using one database well enough that you don't need more vendors. This is the single strongest system-design talking point in the whole project.

---

## 5. Data Model (Neon / Postgres via Drizzle)

```
workspaces
  id (uuid, pk)
  name (text)
  slug (text, unique)
  plan (enum: free, pro)               -- for future billing, unused logic in MVP
  daily_token_limit (int, default 50000)
  created_at (timestamp)

users
  id (uuid, pk)
  email (text, unique)
  name (text)
  created_at (timestamp)

workspace_members
  id (uuid, pk)
  workspace_id (fk → workspaces.id)
  user_id (fk → users.id)
  role (enum: admin, member)
  invited_at (timestamp)
  joined_at (timestamp, nullable)      -- null = invite pending

documents
  id (uuid, pk)
  workspace_id (fk → workspaces.id)
  uploaded_by (fk → users.id)
  filename (text)
  file_url (text)                       -- Vercel Blob URL
  file_type (enum: pdf, docx, md, txt)
  status (enum: pending, chunking, embedding, ready, failed)
  page_count (int, nullable)
  chunk_count (int, nullable)
  error_message (text, nullable)
  created_at (timestamp)

chunks
  id (uuid, pk)
  document_id (fk → documents.id)
  workspace_id (fk → workspaces.id)     -- denormalized for fast tenant filtering
  content (text)
  embedding (vector(1024))              -- pgvector column, dim matches Voyage model
  page_number (int, nullable)
  chunk_index (int)
  created_at (timestamp)

conversations
  id (uuid, pk)
  workspace_id (fk → workspaces.id)
  user_id (fk → users.id)
  title (text)                          -- auto-generated from first message
  created_at (timestamp)

messages
  id (uuid, pk)
  conversation_id (fk → conversations.id)
  role (enum: user, assistant)
  content (text)
  citations (jsonb, nullable)           -- array of {chunk_id, document_id, snippet}
  confidence (enum: verified, uncertain, nullable)  -- output of self-correction loop
  feedback (enum: up, down, nullable)   -- user feedback for future tuning
  token_count (int)
  created_at (timestamp)

ingestion_jobs
  id (uuid, pk)
  document_id (fk → documents.id)
  status (enum: queued, processing, done, failed)
  attempts (int, default 0)
  created_at (timestamp)
  updated_at (timestamp)

usage_daily
  id (uuid, pk)
  workspace_id (fk → workspaces.id)
  date (date)
  tokens_used (int, default 0)
  queries_count (int, default 0)
  UNIQUE(workspace_id, date)

-- ADVANCED ADDITIONS BELOW --

graph_entities
  id (uuid, pk)
  workspace_id (fk → workspaces.id)
  name (text)                           -- e.g. "Refund Policy", "EU Return Law"
  type (text)                           -- e.g. "policy", "regulation", "person", "product"
  source_chunk_ids (uuid[])             -- which chunks this entity was extracted from
  created_at (timestamp)

graph_edges
  id (uuid, pk)
  workspace_id (fk → workspaces.id)
  from_entity_id (fk → graph_entities.id)
  to_entity_id (fk → graph_entities.id)
  relationship (text)                   -- e.g. "overrides", "references", "conflicts_with"
  source_chunk_id (fk → chunks.id)      -- evidence for why this edge exists
  confidence (float)                    -- extraction confidence, 0-1
  created_at (timestamp)

query_cache
  id (uuid, pk)
  workspace_id (fk → workspaces.id)
  query_embedding (vector(1024))
  query_text (text)                     -- stored for debugging/admin visibility
  answer (text)
  citations (jsonb)
  hit_count (int, default 1)            -- how many times this cache entry has served
  created_at (timestamp)
  last_used_at (timestamp)

traces
  id (uuid, pk)
  workspace_id (fk → workspaces.id)
  conversation_id (fk → conversations.id)
  message_id (fk → messages.id, nullable until final answer is saved)
  total_latency_ms (int)
  total_tokens (int)
  cache_hit (boolean, default false)
  final_confidence (enum: verified, uncertain)
  created_at (timestamp)

trace_steps
  id (uuid, pk)
  trace_id (fk → traces.id)
  step_index (int)
  step_type (enum: plan, decompose, vector_retrieve, keyword_retrieve,
             graph_retrieve, rerank, draft_answer, verify, tool_call, cache_check)
  input_summary (text)                  -- short human-readable input description
  output_summary (text)                 -- short human-readable output description
  latency_ms (int)
  tokens_used (int, nullable)
  metadata (jsonb)                      -- raw scores, chunk IDs, model used, etc.
  created_at (timestamp)
```

**Multi-tenancy rule (critical, non-negotiable in the code):** Every single query against `documents`, `chunks`, `conversations`, `messages`, and `usage_daily` MUST filter by `workspace_id` derived from the authenticated session — never from a client-supplied parameter. Write this as a single shared helper (`getSessionWorkspaceId()`) used in every API route, not re-implemented per route.

---

## 6. Ingestion Pipeline (the "how a document becomes searchable" flow)

This is triggered when an admin uploads a file.

```
1. Admin uploads file via UI
      │
      ▼
2. POST /api/documents/upload
   - file streamed to Vercel Blob
   - row created in `documents` (status: pending)
   - row created in `ingestion_jobs` (status: queued)
   - respond immediately to UI (don't block on processing)
      │
      ▼
3. Vercel Cron (runs every 1 min) hits /api/ingest/process
   - picks oldest queued job
   - marks it processing
      │
      ▼
4. Parse file → raw text
   - PDF → pdf-parse or unpdf library
   - DOCX → mammoth
   - MD/TXT → read directly
      │
      ▼
5. Chunk text
   - semantic chunking: split on headings/paragraphs first,
     then enforce max ~500 tokens per chunk with ~50 token overlap
   - store page_number per chunk where available (for citation accuracy)
      │
      ▼
6. Embed chunks
   - batch call to Voyage AI embeddings API (batches of ~50 chunks)
   - store vectors in `chunks.embedding` (pgvector column)
   - build/refresh the HNSW index (Postgres handles this incrementally;
     for very large initial imports, index after the full batch insert
     rather than per-chunk, for speed)
      │
      ▼
7. EXTRACT ENTITIES & RELATIONSHIPS (advanced — builds the graph layer)
   - for each chunk (or small groups of adjacent chunks for better
     context), one small-model call (Llama 3.1 8B) extracts:
     { entities: [{name, type}], relationships: [{from, to, relation}] }
   - upsert into `graph_entities` (dedupe by name+workspace, fuzzy match
     on near-identical names using pg_trgm similarity to avoid
     duplicate nodes like "Refund Policy" vs "the refund policy")
   - insert edges into `graph_edges` with `source_chunk_id` as evidence
     and a confidence score from the extraction call
      │
      ▼
8. Update document status → ready
   - update ingestion_jobs → done
   - (on any failure at any step: status → failed, error_message stored,
     job retried up to 3 times via the row-locked queue before giving up)
```

**Why a Postgres-backed queue with `FOR UPDATE SKIP LOCKED` instead of Redis/SQS:** this SQL pattern lets multiple concurrent cron invocations safely grab different queued jobs without double-processing the same one — it's a genuine, well-known production pattern for building a lightweight job queue directly on Postgres, and it means zero extra vendors for background processing. Document this trade-off explicitly in the README as a deliberate, informed choice (not "we couldn't afford Redis").

---

## 7. The Agentic Query Pipeline (the core value proposition)

This is the advanced version: an agent that **plans**, chooses **which retrieval strategies to use**, checks a **semantic cache** before spending any tokens, **verifies its own claims**, and logs a **full trace** of the whole decision path. Every step below writes a `trace_steps` row — this pipeline IS the observability system, not something bolted on after.

```
1. User sends message in chat UI
      │
      ▼
2. POST /api/chat/query  { conversationId, message }
   - create a `traces` row (start timer)
   - token-bucket check against usage_daily (atomic SQL update); if
     over daily_token_limit → return a clear "usage limit reached"
     response immediately, log trace_step, stop here
      │
      ▼
3. EMBED the query (Voyage AI) → trace_step: embed
      │
      ▼
4. SEMANTIC CACHE CHECK  → trace_step: cache_check
   - pgvector similarity search against `query_cache` for this
     workspace; if similarity > 0.95 to a cached query:
       → return cached answer + citations immediately (no LLM call)
       → increment hit_count, update last_used_at
       → mark trace.cache_hit = true, close trace, DONE
   - else continue to step 5
      │
      ▼
5. PLAN  (Groq, small model — Llama 3.1 8B)  → trace_step: plan
   - ask the model: "Is this a single-fact lookup, or does it require
     comparing/combining multiple sources?"
   - output: { strategy: "direct" | "decompose", subquestions: [...] }
   - simple factual questions → strategy "direct", skip to step 7
   - complex/multi-hop questions → strategy "decompose", continue to 6
      │
      ▼
6. DECOMPOSE (only if strategy = "decompose")  → trace_step: decompose
   - break the question into 2-4 sub-questions
   - each sub-question runs steps 7-8 independently, results collected
      │
      ▼
7. HYBRID + GRAPH RETRIEVAL (per question or sub-question)
   a) Vector search: pgvector HNSW cosine similarity, top 20 chunks
      (workspace_id filtered) → trace_step: vector_retrieve
   b) Keyword search: Postgres full-text search (tsvector), top 20
      chunks → trace_step: keyword_retrieve
   c) Graph traversal: extract likely entity names from the question
      (small model call), look them up in `graph_entities`, walk 1-2
      hops via recursive CTE over `graph_edges`, pull the
      `source_chunk_id` of each relevant edge as extra context
      → trace_step: graph_retrieve (this is what answers "how does X
      relate to Y" questions that pure vector search misses)
   d) Merge all three result sets, deduplicate by chunk_id
      │
      ▼
8. RE-RANK  → trace_step: rerank
   - send the merged candidate list + query to the cross-encoder
     (HF Inference API, bge-reranker-base)
   - keep top 6 by cross-encoder score (meaningfully more precise
     than the v1 weighted-blend approach)
      │
      ▼
9. SYNTHESIZE  (Groq, large model — Llama 3.3 70B)  → trace_step: draft_answer
   - if decomposed: pass all sub-answers' evidence together and ask
     the model to synthesize one coherent final answer
   - if direct: single-pass answer from the top 6 chunks
   - system prompt requires citing which chunk backs each claim
      │
      ▼
10. SELF-VERIFICATION LOOP  → trace_step: verify
   - second Groq call (small model is fine here): given the draft
     answer + the chunks actually used, check EACH claim against the
     chunks and flag unsupported ones
   - if any claim unsupported:
       → one re-retrieval attempt with a reformulated query, OR
       → mark confidence = "uncertain" and say so explicitly to the
         user rather than hide it
   - if all claims check out: confidence = "verified"
      │
      ▼
11. STREAM response to client
   - stream text tokens
   - send citation metadata progressively so the margin-note UI
     populates in sync, and (advanced UX) stream the PLAN itself
     first so the user sees "Breaking this into 2 parts..." before
     the answer appears — turns a black-box wait into visible progress
      │
      ▼
12. WRITE-THROUGH CACHE + PERSIST
   - if confidence = "verified": write query embedding + answer to
     `query_cache` for future hits
   - save message + citations + confidence to `messages`
   - increment usage_daily.tokens_used and queries_count
   - close out the `traces` row with total latency/tokens
```

**Why this is the strongest part of the project to talk about:**
- The **plan/decompose step** is genuine agentic behavior (the system chooses its own strategy), not a fixed pipeline — this is what "agentic AI" means beyond the buzzword.
- The **graph layer** solves a real, demonstrable failure mode of vector-only RAG: relational/multi-hop questions.
- The **semantic cache** is a real latency/cost optimization with a measurable before/after (show cache hit rate in the admin dashboard).
- The **verify loop** is honesty-by-design: the system tells you when it isn't sure, instead of hiding it.
- The **trace log** means you can literally screen-share the admin trace explorer in an interview and show exactly what the agent did and why, step by step, with real latency numbers. This is the single best demo moment in the entire product.

---

## 8. Admin Perspective — Full Workflow

**Onboarding:**
1. Admin signs up (email magic link or Google) → creates a workspace (name + slug) → lands on empty dashboard.

**Document management:**
2. Admin uploads documents (drag-and-drop or file picker) → sees them appear immediately in the "index card" list with status `pending` → status updates live (polling every 5s, or Postgres LISTEN/NOTIFY if time allows) through `chunking` → `embedding` → `ready`.
3. Admin can delete a document → cascades delete of its chunks.
4. Admin can view a document's chunk count and a preview of how it was split (transparency feature — builds trust, and is a good demo moment).

**Team management:**
5. Admin invites teammates by email → creates a `workspace_members` row with `joined_at = null` → invitee gets a magic link → on first login, row is completed.
6. Admin can change a member's role or remove them.

**Analytics dashboard:**
7. Admin sees: daily query volume (chart), token usage vs. daily limit (progress bar), top-asked questions (grouped by embedding similarity clustering — a real use of the same vector infra already in place), percentage of answers marked "uncertain" (a genuinely useful metric — high uncertainty rate signals a knowledge gap in the uploaded docs), and **cache hit rate** (advanced metric — shows the semantic cache actually working, with a visible cost/latency savings estimate).
8. Admin sees thumbs up/down feedback aggregated per document (which sources are actually helping vs. never being useful).
9. **Trace Explorer (advanced, the standout admin feature):** a searchable list of every query run in the workspace, each expandable into its full `trace_steps` timeline — plan → retrieve → rerank → verify — with latency per step, tokens per step, which model was used, and the exact chunks/graph edges retrieved. This is effectively a self-built LangSmith/Helicone, scoped to exactly what this product needs, and it is the best possible thing to screen-share in an interview.
10. **Knowledge Graph Viewer (advanced, optional but strong):** a simple force-directed graph visualization (using a free client-side library) of `graph_entities`/`graph_edges` for the workspace, so an admin can visually see what relationships the system extracted from their docs — also doubles as a sanity-check tool for extraction quality.

**Settings:**
9. Admin can adjust the daily token limit (within free-tier ceiling), and toggle whether the "uncertain" confidence label is shown to end users or hidden (some teams prefer not to show it).

---

## 9. End User Perspective — Full Workflow

1. User receives invite → signs in via magic link → lands directly in the chat interface for their workspace (no admin clutter visible).
2. User sees a clean empty state on first visit: "Ask anything about [Workspace Name]'s docs" with 2–3 example questions generated from the actual uploaded content (not generic placeholders — pull real doc titles into the suggestions).
3. User types a question → sees streaming answer → margin-note citation tabs appear as claims are made → clicking a tab expands the exact source snippet and which document/page it came from.
4. If confidence is "uncertain," the UI shows a small, honest inline note ("This answer isn't fully backed by the uploaded docs — treat it as a starting point") — styled with `--folder-green` only when verified, a muted neutral tone (not alarming red) when uncertain.
5. User can thumbs up/down any answer.
6. User has a conversation history sidebar (their own conversations only — never other users' in the same workspace, unless the admin explicitly enables "shared team conversations" as a future toggle).

---

## 10. API Route Map

```
/api/auth/[...nextauth]        - Auth.js handlers
/api/workspaces                - POST create workspace
/api/workspaces/[id]/invite    - POST invite member
/api/documents                 - GET list, POST upload
/api/documents/[id]            - GET detail, DELETE
/api/ingest/process            - POST (called by Vercel Cron only, secured by secret header)
/api/chat/query                - POST send message, streams response
/api/chat/conversations        - GET list user's conversations
/api/chat/conversations/[id]   - GET messages, DELETE conversation
/api/chat/feedback             - POST { messageId, feedback }
/api/admin/analytics           - GET workspace-level stats (admin role only)
/api/admin/usage               - GET current usage vs limit
/api/admin/traces              - GET list traces for workspace (admin only)
/api/admin/traces/[id]         - GET full trace_steps timeline for one query
/api/admin/graph               - GET entities+edges for graph viewer (admin only)
```

Every route (except `/api/ingest/process`, which uses a shared secret) must:
1. Verify session exists.
2. Derive `workspaceId` from session/membership — never trust a client-passed workspace ID for data access without checking membership first.
3. Verify role where relevant (e.g., only `admin` can invite/delete/view analytics).

---

## 11. Observability & Evaluation Harness (what makes this "advanced" instead of "a demo")

**Observability is not optional instrumentation bolted on at the end — it's built into the pipeline from Section 7 by design.** Every trace step writes structured data as it happens. The value is in what you can *do* with it:

- **Latency breakdown per step type**, aggregated across all queries, surfaced as a simple bar chart in the admin dashboard ("retrieval avg 180ms, rerank avg 240ms, synthesis avg 900ms, verify avg 400ms") — lets you actually identify the bottleneck instead of guessing.
- **Confidence rate over time** — is "uncertain" trending up or down as more docs get added? This is a real product health metric.
- **Cache effectiveness** — hit rate, and estimated tokens/cost saved (compute this as `hit_count * avg_tokens_per_query` across `query_cache`).

**Eval harness (`/eval` directory, run via `npx tsx eval/run.ts`):**
1. Maintain a hand-written set of 30-50 `{question, expected_answer_facts, expected_source_doc}` pairs based on your actual seeded test documents.
2. The script runs each question through the real pipeline (not mocked) and scores:
   - **Retrieval recall**: did the expected source chunk appear in the top-6 retrieved chunks?
   - **Faithfulness**: send the final answer + expected facts to an LLM-as-judge call (Groq) asking "does this answer contain these facts, and does it avoid unsupported claims?" — score 0-1.
   - **Latency**: total time per question.
3. Output a simple markdown report (`eval/results/{timestamp}.md`) with pass/fail per question and aggregate scores.
4. Wire this into a **free GitHub Actions workflow** that runs on every push to `main`, so you have a genuine CI-based regression check on retrieval quality — a meaningfully advanced practice most portfolio projects never touch.

This eval harness is arguably the single highest-signal piece of the whole project for an interview: it proves you think about AI systems the way an ML/AI engineering team actually does — as something you measure, not just something you ship and hope works.

---

## 12. Performance & System-Design Decisions (for speed and UX at scale)

These are the concrete choices that make the app feel fast and behave well under load, framed as explicit trade-offs:

- **Streaming everywhere the user is waiting.** The plan step streams first ("Breaking this into 2 parts..."), then retrieval status, then the answer tokens themselves. Perceived latency matters more than raw latency — a user watching visible progress tolerates 3 seconds far better than a silent 1.5-second spinner.
- **Small model for cheap steps, large model only for final synthesis.** Plan/decompose/verify use Llama 3.1 8B (fast, cheap, sufficient for structured judgment tasks); only the final answer synthesis uses Llama 3.3 70B. This roughly halves average latency and token spend versus using the large model for every step — a real cost/performance trade-off to name explicitly.
- **Semantic cache checked before any retrieval, not just before generation.** Skipping vector search entirely on a cache hit (not just skipping the LLM call) saves a full round-trip on repeat/near-duplicate questions, which are common in team knowledge bases (many people ask slightly reworded versions of the same question).
- **HNSW index on `chunks.embedding`, not the default flat/IVFFlat index**, once chunk count grows past a few thousand — HNSW gives sub-linear query time and is the right default for a system expected to scale.
- **Denormalized `workspace_id` on `chunks`** (rather than always joining through `documents`) — a deliberate normalization trade-off for query speed on the hottest path in the app (every single chat query touches this table).
- **Row-level locking (`FOR UPDATE SKIP LOCKED`) on the ingestion queue** so multiple cron invocations never double-process a document — correctness under concurrency without adding infrastructure.
- **Token-bucket rate limiting via atomic SQL updates** (`UPDATE usage_daily SET tokens_used = tokens_used + $1 WHERE ... RETURNING tokens_used`) rather than read-then-write in application code — avoids a race condition where two concurrent requests both read "under limit" before either writes back.
- **Vercel Hobby tier constraints respected explicitly:** serverless function timeout (typically 10s on Hobby, up to 60s configurable on some plans) means the agentic loop must be designed to stream partial results well before any hard timeout, and the decompose step should cap sub-questions (e.g., max 4) to bound worst-case latency. Naming this constraint and designing around it (rather than hitting it in production and being surprised) is itself a system-design signal.
- **Neon database branching for a preview/staging environment** — Neon's free tier supports branching a Postgres database instantly; use a branch for a `preview` Vercel deployment so schema changes can be tested against real (seeded) data before merging to `main`, without touching production data. This is a genuinely advanced, free, and easy-to-demo practice.

---

## 13. Security & Multi-Tenancy Checklist (non-negotiable)

- Every DB query scoped by `workspace_id` from server-verified session, never from request body/query params directly.
- File uploads validated by type and size (cap at, say, 20MB) before hitting Blob storage.
- Rate limiting per workspace (via `usage_daily`) enforced server-side before calling Groq — never trust client to self-limit.
- Ingestion cron endpoint protected by a secret header (`CRON_SECRET` env var), not publicly callable.
- Environment variables (`GROQ_API_KEY`, `VOYAGE_API_KEY`, `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `NEXTAUTH_SECRET`, `CRON_SECRET`) never exposed to client bundle — verify none are prefixed `NEXT_PUBLIC_` by mistake.

---

## 14. Build Order (give this to the coding AI as literal sequence)

Build in this order — each phase should be working and demoable before moving to the next, so the project is never in a broken half-state for long:

**Phase A — Foundation**
1. **Scaffold** Next.js + TypeScript + Tailwind project; set up the design tokens (CSS variables) from Section 2 first, before any UI, so nothing defaults to generic Tailwind styling.
2. **Database**: set up Neon (including a `preview` branch), enable `pgvector` and `pg_trgm` extensions, write the full Drizzle schema from Section 5 (relational + vector + graph + cache + trace tables), run migrations.
3. **Auth**: Auth.js with magic link + Google, plus workspace creation on first login.

**Phase B — Ingestion**
4. **Admin UI shell + document upload** (upload to Blob, create DB rows) — no processing logic yet, just get files stored and listed with status badges.
5. **Core ingestion pipeline** (Section 6, steps 1-6) — parsing, chunking, embedding, the `FOR UPDATE SKIP LOCKED` cron-driven queue.
6. **Entity/relationship extraction** (Section 6, step 7) — populate `graph_entities`/`graph_edges` as an extra pass on already-ingested docs.

**Phase C — Baseline chat (get something answering before adding agentic complexity)**
7. **Chat UI shell** — conversation list, message thread, input box, streaming plumbing (dummy responses first, to get the UI right in isolation).
8. **Hybrid retrieval** (vector + keyword, Section 7 step 7a/b only, skip graph for now) — verify real chunks come back correctly.
9. **Basic synthesis** (Section 7 step 9, single-pass, no plan/decompose/verify yet) — get an end-to-end working RAG answer as your safety-net baseline.

**Phase D — Layer in the advanced pipeline, one piece at a time, testing after each**
10. **Semantic cache** (Section 7 step 4) — add the cache check/write; verify cache hits actually skip the LLM call.
11. **Plan/decompose step** (Section 7 steps 5-6) — add the agentic branching; test with both a simple and a genuinely multi-hop question.
12. **Graph retrieval** (Section 7 step 7c) — wire the recursive CTE traversal in for multi-hop questions specifically.
13. **Cross-encoder re-ranking** (Section 7 step 8) — swap in the real re-ranker call.
14. **Self-verification loop** (Section 7 step 10) — add last, since it needs a working draft-answer step to check against.
15. **Citations UI** (margin-note pattern) — wire real citation data into the distinctive interaction from Section 2; add the streamed "plan" UI ("Breaking this into 2 parts...").

**Phase E — Observability, eval, and polish**
16. **Tracing** — instrument every step above with `trace_steps` writes (retrofit if needed, but ideally build alongside Phase D).
17. **Trace Explorer + Knowledge Graph Viewer** admin UI.
18. **Eval harness** (`/eval`) with 30-50 seeded Q&A pairs, plus the GitHub Actions workflow.
19. **Admin analytics dashboard**, including cache hit rate and confidence-rate-over-time.
20. **Usage limiting (token-bucket), rate limiting, polish, empty states, error states.**
21. **Deploy to Vercel**, connect Neon + env vars, verify cron job runs, verify preview branch workflow.

---

## 15. What Makes This Worth Presenting in Interviews

Be ready to explain, unprompted:
- Why one Postgres database (vector + graph + cache + traces, all via `pgvector`/plain tables) instead of four separate vendors — cost, operational simplicity, and a real, legitimate production pattern.
- How the **plan/decompose step** makes this genuinely agentic rather than a fixed pipeline, and give a concrete example question where decomposition changed the answer quality.
- How the **graph layer** answers a class of question that pure vector search fails on — have a real example ready ("how does our refund policy interact with the EU return law doc" style).
- How the **semantic cache** measurably reduces latency/cost — pull the actual hit-rate number from your own admin dashboard when demoing.
- How the **self-verification loop** works and why naive RAG hallucinates without it.
- How **multi-tenancy** is enforced at the query layer, not just the UI layer.
- How you'd read your own **trace explorer** to debug a slow or wrong answer — walk through a real trace step by step.
- What your **eval harness** actually measures and why retrieval recall and faithfulness are scored separately (a retrieval bug and a generation bug look identical to a user but need different fixes).
- What you'd change to scale past free-tier limits (move pgvector to a dedicated vector DB at very large chunk counts, replace the Postgres queue with a managed queue like Inngest, move the semantic cache to Redis for lower latency, add proper billing/Stripe, move rate limiting to an edge-based solution).

Naming the free-tier shortcuts *as conscious, explained decisions* — not as things you'd have done differently if you had money — is a stronger signal than overclaiming production-readiness. The whole point of this project is demonstrating that you understand the trade-offs, not that you avoided all of them.
