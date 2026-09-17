import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  date,
  boolean,
  doublePrecision,
  jsonb,
  customType,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Custom pgvector type for 1024-dimension embeddings
export const vector1024 = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(1024)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    if (typeof value === "string") {
      const clean = value.replace(/[\[\]]/g, "").trim();
      if (!clean) return [];
      return clean.split(",").map(Number);
    }
    return value as unknown as number[];
  },
});

// 1. Workspaces
export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: text("plan", { enum: ["free", "pro"] }).default("free").notNull(),
  daily_token_limit: integer("daily_token_limit").default(50000).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

// 2. Users
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

// 3. Workspace Members
export const workspace_members = pgTable("workspace_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspace_id: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["admin", "member"] }).default("member").notNull(),
  invited_at: timestamp("invited_at").defaultNow().notNull(),
  joined_at: timestamp("joined_at"),
});

// 4. Documents
export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspace_id: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  uploaded_by: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  filename: text("filename").notNull(),
  file_url: text("file_url").notNull(),
  file_type: text("file_type", { enum: ["pdf", "docx", "md", "txt"] }).notNull(),
  status: text("status", { enum: ["pending", "chunking", "embedding", "ready", "failed"] }).default("pending").notNull(),
  page_count: integer("page_count"),
  chunk_count: integer("chunk_count"),
  error_message: text("error_message"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

// 5. Chunks
export const chunks = pgTable("chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  document_id: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  workspace_id: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  embedding: vector1024("embedding"),
  page_number: integer("page_number"),
  chunk_index: integer("chunk_index").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

// 6. Conversations
export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspace_id: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  user_id: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

// 7. Messages
export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversation_id: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  citations: jsonb("citations").$type<Array<{ chunk_id: string; document_id: string; filename: string; page_number?: number; snippet: string }>>(),
  confidence: text("confidence", { enum: ["verified", "uncertain"] }),
  feedback: text("feedback", { enum: ["up", "down"] }),
  token_count: integer("token_count").default(0).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

// 8. Ingestion Jobs
export const ingestion_jobs = pgTable("ingestion_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  document_id: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["queued", "processing", "done", "failed"] }).default("queued").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

// 9. Usage Daily
export const usage_daily = pgTable("usage_daily", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspace_id: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  tokens_used: integer("tokens_used").default(0).notNull(),
  queries_count: integer("queries_count").default(0).notNull(),
});

// 10. Knowledge Graph Entities
export const graph_entities = pgTable("graph_entities", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspace_id: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull(),
  source_chunk_ids: jsonb("source_chunk_ids").$type<string[]>().default([]).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

// 11. Knowledge Graph Edges
export const graph_edges = pgTable("graph_edges", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspace_id: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  from_entity_id: uuid("from_entity_id").notNull().references(() => graph_entities.id, { onDelete: "cascade" }),
  to_entity_id: uuid("to_entity_id").notNull().references(() => graph_entities.id, { onDelete: "cascade" }),
  relationship: text("relationship").notNull(),
  source_chunk_id: uuid("source_chunk_id").references(() => chunks.id, { onDelete: "set null" }),
  confidence: doublePrecision("confidence").default(1.0).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

// 12. Query Semantic Cache
export const query_cache = pgTable("query_cache", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspace_id: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  query_embedding: vector1024("query_embedding").notNull(),
  query_text: text("query_text").notNull(),
  answer: text("answer").notNull(),
  citations: jsonb("citations").$type<Array<{ chunk_id: string; document_id: string; filename: string; page_number?: number; snippet: string }>>(),
  hit_count: integer("hit_count").default(1).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  last_used_at: timestamp("last_used_at").defaultNow().notNull(),
});

// 13. Observability Traces
export const traces = pgTable("traces", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspace_id: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  conversation_id: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }),
  message_id: uuid("message_id").references(() => messages.id, { onDelete: "set null" }),
  query_text: text("query_text").notNull().default(""),
  total_latency_ms: integer("total_latency_ms").default(0).notNull(),
  total_tokens: integer("total_tokens").default(0).notNull(),
  cache_hit: boolean("cache_hit").default(false).notNull(),
  final_confidence: text("final_confidence", { enum: ["verified", "uncertain"] }),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

// 14. Observability Trace Steps
export const trace_steps = pgTable("trace_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  trace_id: uuid("trace_id").notNull().references(() => traces.id, { onDelete: "cascade" }),
  step_index: integer("step_index").notNull(),
  step_type: text("step_type", {
    enum: [
      "plan",
      "decompose",
      "vector_retrieve",
      "keyword_retrieve",
      "graph_retrieve",
      "rerank",
      "draft_answer",
      "verify",
      "tool_call",
      "cache_check",
      "embed"
    ],
  }).notNull(),
  input_summary: text("input_summary").notNull(),
  output_summary: text("output_summary").notNull(),
  latency_ms: integer("latency_ms").default(0).notNull(),
  tokens_used: integer("tokens_used"),
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});
