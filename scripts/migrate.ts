import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const sql = neon(databaseUrl);

async function runMigration() {
  console.log("Starting Neon database schema migration for DocMind...");

  const queries = [
    // Extensions
    `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`,
    `CREATE EXTENSION IF NOT EXISTS vector;`,
    `CREATE EXTENSION IF NOT EXISTS pg_trgm;`,

    // 1. Workspaces
    `CREATE TABLE IF NOT EXISTS workspaces (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      plan TEXT NOT NULL DEFAULT 'free',
      daily_token_limit INTEGER NOT NULL DEFAULT 50000,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
    );`,

    // 2. Users
    `CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
    );`,

    // 3. Workspace Members
    `CREATE TABLE IF NOT EXISTS workspace_members (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',
      invited_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
      joined_at TIMESTAMP WITHOUT TIME ZONE
    );`,

    // 4. Documents
    `CREATE TABLE IF NOT EXISTS documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
      filename TEXT NOT NULL,
      file_url TEXT NOT NULL,
      file_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      page_count INTEGER,
      chunk_count INTEGER,
      error_message TEXT,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
    );`,

    // 5. Chunks
    `CREATE TABLE IF NOT EXISTS chunks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      embedding VECTOR(1024),
      page_number INTEGER,
      chunk_index INTEGER NOT NULL,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
    );`,

    // 6. Conversations
    `CREATE TABLE IF NOT EXISTS conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
    );`,

    // 7. Messages
    `CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      citations JSONB,
      confidence TEXT,
      feedback TEXT,
      token_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
    );`,

    // 8. Ingestion Jobs
    `CREATE TABLE IF NOT EXISTS ingestion_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'queued',
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
    );`,

    // 9. Usage Daily
    `CREATE TABLE IF NOT EXISTS usage_daily (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      tokens_used INTEGER NOT NULL DEFAULT 0,
      queries_count INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT usage_daily_unique_workspace_date UNIQUE (workspace_id, date)
    );`,

    // 10. Knowledge Graph Entities
    `CREATE TABLE IF NOT EXISTS graph_entities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      source_chunk_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
    );`,

    // 11. Knowledge Graph Edges
    `CREATE TABLE IF NOT EXISTS graph_edges (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      from_entity_id UUID NOT NULL REFERENCES graph_entities(id) ON DELETE CASCADE,
      to_entity_id UUID NOT NULL REFERENCES graph_entities(id) ON DELETE CASCADE,
      relationship TEXT NOT NULL,
      source_chunk_id UUID REFERENCES chunks(id) ON DELETE SET NULL,
      confidence DOUBLE PRECISION NOT NULL DEFAULT 1.0,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
    );`,

    // 12. Query Semantic Cache
    `CREATE TABLE IF NOT EXISTS query_cache (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      query_embedding VECTOR(1024) NOT NULL,
      query_text TEXT NOT NULL,
      answer TEXT NOT NULL,
      citations JSONB,
      hit_count INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
    );`,

    // 13. Observability Traces
    `CREATE TABLE IF NOT EXISTS traces (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
      message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
      query_text TEXT NOT NULL DEFAULT '',
      total_latency_ms INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      cache_hit BOOLEAN NOT NULL DEFAULT FALSE,
      final_confidence TEXT,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
    );`,

    // 14. Observability Trace Steps
    `CREATE TABLE IF NOT EXISTS trace_steps (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      trace_id UUID NOT NULL REFERENCES traces(id) ON DELETE CASCADE,
      step_index INTEGER NOT NULL,
      step_type TEXT NOT NULL,
      input_summary TEXT NOT NULL,
      output_summary TEXT NOT NULL,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      tokens_used INTEGER,
      metadata JSONB,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
    );`,

    // Indexes
    `CREATE INDEX IF NOT EXISTS chunks_workspace_idx ON chunks (workspace_id);`,
    `CREATE INDEX IF NOT EXISTS chunks_document_idx ON chunks (document_id);`,
    `CREATE INDEX IF NOT EXISTS chunks_content_fts_idx ON chunks USING gin (to_tsvector('english', content));`,
    `CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_idx ON chunks USING hnsw (embedding vector_cosine_ops);`,
    `CREATE INDEX IF NOT EXISTS query_cache_embedding_hnsw_idx ON query_cache USING hnsw (query_embedding vector_cosine_ops);`,
    `CREATE INDEX IF NOT EXISTS graph_entities_name_trgm_idx ON graph_entities USING gin (name gin_trgm_ops);`,
    `CREATE INDEX IF NOT EXISTS graph_edges_workspace_idx ON graph_edges (workspace_id);`,
    `CREATE INDEX IF NOT EXISTS graph_edges_traversal_idx ON graph_edges (from_entity_id, to_entity_id);`,
    `CREATE INDEX IF NOT EXISTS traces_workspace_idx ON traces (workspace_id);`,
    `CREATE INDEX IF NOT EXISTS trace_steps_trace_idx ON trace_steps (trace_id);`
  ];

  for (const q of queries) {
    try {
      await sql(q);
    } catch (err: any) {
      console.error("Migration error executing query:", q.slice(0, 60), "Error:", err.message);
      throw err;
    }
  }

  console.log("All DocMind database tables and indexes migrated successfully!");
}

runMigration().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
