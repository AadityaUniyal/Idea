import { neon, neonConfig } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import { getEmbedding } from "../lib/ai/embeddings";
import { chunkDocument } from "../lib/ingestion/chunker";

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("\n❌ DATABASE_URL is not set.");
  console.error("Please ensure DATABASE_URL is set in your .env file locally, or in GitHub Secrets (Settings > Secrets and variables > Actions) if running in CI.\n");
  process.exit(1);
}

neonConfig.fetchEndpoint = (host: string) => `https://${host}/sql`;
const sql = neon(databaseUrl);

async function seed() {
  console.log("Seeding DocMind database with realistic multi-hop enterprise documents...");

  // 1. Workspace
  const [workspace] = await sql`
    INSERT INTO workspaces (name, slug, plan, daily_token_limit)
    VALUES ('Acme Research Labs', 'acme-research', 'pro', 50000)
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id;
  `;
  const workspaceId = workspace.id;

  // 2. Admin User
  const [user] = await sql`
    INSERT INTO users (email, name)
    VALUES ('admin@acmeresearch.com', 'Dr. Sarah Lin')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
    RETURNING id;
  `;
  const userId = user.id;

  // 3. Workspace Member
  await sql`
    INSERT INTO workspace_members (workspace_id, user_id, role, joined_at)
    VALUES (${workspaceId}, ${userId}, 'admin', NOW())
    ON CONFLICT DO NOTHING;
  `;

  // 4. Seed Documents
  const seedDocs = [
    {
      filename: "Company_Refund_and_Return_Policy_2026.md",
      file_type: "md",
      content: `# Acme Enterprise Refund and Return Policy (v4.2 — 2026)

## 1. Standard Return Window
Acme Corporation offers customers a standard thirty (30) day return window starting from the documented date of physical delivery. Products must be returned in their original packaging with all accompanying accessories and documentation.

## 2. Restocking Fees on Opened Hardware
For all opened enterprise hardware units, laboratory test kits, and custom compute rigs, Acme assesses a mandatory fifteen percent (15%) restocking fee to cover inspection, testing, and repackaging. This fee is automatically deducted from the final refunded amount.

## 3. Digital Licenses and SaaS Subscriptions
All digital license keys, cloud compute credits, and bespoke API tokens are strictly non-refundable once activated or redeemed by the client organization.

## 4. Return Escalation and Exceptions
In cases of verified manufacturing defects or transit damage reported within forty-eight (48) hours of arrival, the restocking fee is waived, and expedited replacement units are dispatched via overnight freight.`
    },
    {
      filename: "EU_Consumer_Rights_Directive_Compliance.md",
      file_type: "md",
      content: `# European Union Consumer Rights Directive (Directive 2011/83/EU Compliance Addendum)

## 1. Statutory Right of Withdrawal
Under Directive 2011/83/EU, consumers residing within the European Union possess an unconditional statutory right of withdrawal for distance and off-premises contracts. The withdrawal period expires fourteen (14) calendar days from the day on which the consumer acquires physical possession of the goods.

## 2. Prohibition of Restocking and Processing Fees
In accordance with Article 13 of the Directive, when a consumer exercises their statutory right of withdrawal, the trader must reimburse all payments received from the consumer, including costs of initial standard delivery. Charging restocking fees, inspection penalties, or repackaging surcharges on EU consumer returns is strictly prohibited under European Community law and unenforceable against EU residents.

## 3. Precedence Over Standard Corporate Policy
Where any provision of the general Acme Corporation Return Policy conflicts with the EU Consumer Rights Directive, European Union statutory law supersedes and overrides standard corporate terms for all qualifying transactions originating within EU member states.

## 4. Refund Timeline Obligation
Reimbursement must be executed without undue delay and in any event not later than fourteen (14) days from the day Acme is informed of the consumer's decision to withdraw.`
    },
    {
      filename: "Enterprise_Cloud_SLA_and_Incident_Response.md",
      file_type: "md",
      content: `# Enterprise Cloud Infrastructure SLA and Incident Matrix

## 1. Service Availability Guarantee
Acme Cloud commits to delivering 99.95% monthly service uptime for core storage, database cluster instances, and vector indexing services.

## 2. Incident Severity Definitions
- Severity 1 (Critical Outage): Complete loss of access to primary vector retrieval or tenant database cluster affecting more than 20% of active workloads. Response time SLA: Under fifteen (15) minutes.
- Severity 2 (Major Degradation): Significant latency spikes (p99 > 2500ms) or background ingestion pipeline failure. Response time SLA: Under one (1) hour.
- Severity 3 (Minor Advisory): Non-breaking UI cosmetic defects or documentation ambiguities. Response time SLA: Within twenty-four (24) hours.

## 3. Service Credit Compensation Matrix
If uptime falls below guaranteed thresholds in a billing cycle:
- 99.0% to 99.94% uptime: Ten percent (10%) invoice credit.
- 95.0% to 98.99% uptime: Twenty-five percent (25%) invoice credit.
- Below 95.0% uptime: Fifty percent (50%) invoice credit.
Service credits must be claimed in writing within thirty (30) days of the impacted calendar month.

## 4. Maintenance Windows
Scheduled system maintenance requires a minimum notification period of seven (7) business days and must occur during designated low-traffic hours (02:00–06:00 UTC).`
    }
  ];

  const insertedChunkRecords: Array<{ id: string; content: string; filename: string }> = [];

  for (const doc of seedDocs) {
    const [docRow] = await sql`
      INSERT INTO documents (workspace_id, uploaded_by, filename, file_url, file_type, status, page_count, chunk_count)
      VALUES (${workspaceId}, ${userId}, ${doc.filename}, ${doc.content}, ${doc.file_type}, 'ready', 1, 3)
      RETURNING id;
    `;

    const rawChunks = chunkDocument([{ pageNumber: 1, text: doc.content }], 200, 30);

    for (let i = 0; i < rawChunks.length; i++) {
      const c = rawChunks[i];
      const embedding = await getEmbedding(c.content);
      const vecStr = `[${embedding.join(",")}]`;

      const [chunkRow] = await sql`
        INSERT INTO chunks (document_id, workspace_id, content, embedding, page_number, chunk_index)
        VALUES (${docRow.id}, ${workspaceId}, ${c.content}, ${vecStr}::vector, 1, ${i})
        RETURNING id;
      `;

      insertedChunkRecords.push({
        id: chunkRow.id,
        content: c.content,
        filename: doc.filename,
      });
    }
  }

  // 5. Seed Knowledge Graph Entities
  console.log("Seeding Knowledge Graph entities and edges...");
  const entities = [
    { name: "Company Refund Policy", type: "policy" },
    { name: "EU Consumer Rights Directive", type: "regulation" },
    { name: "Restocking Fee", type: "condition" },
    { name: "Statutory Right of Withdrawal", type: "legal_right" },
    { name: "Cloud SLA", type: "agreement" },
    { name: "Severity 1 Outage", type: "incident_type" },
    { name: "Service Credit Matrix", type: "compensation" }
  ];

  const entityMap = new Map<string, string>();

  for (const ent of entities) {
    const [entRow] = await sql`
      INSERT INTO graph_entities (workspace_id, name, type, source_chunk_ids)
      VALUES (${workspaceId}, ${ent.name}, ${ent.type}, '[]'::jsonb)
      RETURNING id;
    `;
    entityMap.set(ent.name, entRow.id);
  }

  // 6. Seed Knowledge Graph Edges (with source chunk evidence)
  const edges = [
    {
      from: "EU Consumer Rights Directive",
      to: "Company Refund Policy",
      rel: "overrides",
      chunkMatch: "Prohibition of Restocking",
      conf: 0.98,
    },
    {
      from: "Company Refund Policy",
      to: "Restocking Fee",
      rel: "mandates",
      chunkMatch: "Restocking Fees on Opened Hardware",
      conf: 0.95,
    },
    {
      from: "EU Consumer Rights Directive",
      to: "Statutory Right of Withdrawal",
      rel: "guarantees",
      chunkMatch: "Statutory Right of Withdrawal",
      conf: 0.99,
    },
    {
      from: "EU Consumer Rights Directive",
      to: "Restocking Fee",
      rel: "strictly_prohibits",
      chunkMatch: "Charging restocking fees",
      conf: 0.97,
    },
    {
      from: "Cloud SLA",
      to: "Severity 1 Outage",
      rel: "classifies",
      chunkMatch: "Severity 1 (Critical Outage)",
      conf: 0.96,
    },
    {
      from: "Severity 1 Outage",
      to: "Service Credit Matrix",
      rel: "triggers",
      chunkMatch: "Service Credit Compensation Matrix",
      conf: 0.94,
    },
  ];

  for (const edge of edges) {
    const fromId = entityMap.get(edge.from);
    const toId = entityMap.get(edge.to);
    const matchedChunk = insertedChunkRecords.find((c) => c.content.includes(edge.chunkMatch));

    if (fromId && toId) {
      await sql`
        INSERT INTO graph_edges (workspace_id, from_entity_id, to_entity_id, relationship, source_chunk_id, confidence)
        VALUES (${workspaceId}, ${fromId}, ${toId}, ${edge.rel}, ${matchedChunk ? matchedChunk.id : null}, ${edge.conf});
      `;
    }
  }

  // 7. Seed Semantic Query Cache
  console.log("Seeding Semantic Cache entry for instant repeat testing...");
  const cachedQuery = "What is the standard return window under company policy?";
  const cachedAnswer = "Under Section 1 of the Acme Enterprise Refund and Return Policy (v4.2), the standard return window is thirty (30) days from the documented date of physical delivery [1]. Goods must be returned in original packaging.";
  const cachedEmbedding = await getEmbedding(cachedQuery);
  const cacheVecStr = `[${cachedEmbedding.join(",")}]`;

  await sql`
    INSERT INTO query_cache (workspace_id, query_embedding, query_text, answer, citations, hit_count)
    VALUES (
      ${workspaceId},
      ${cacheVecStr}::vector,
      ${cachedQuery},
      ${cachedAnswer},
      ${JSON.stringify([{ filename: "Company_Refund_and_Return_Policy_2026.md", page_number: 1, snippet: "Acme Corporation offers customers a standard thirty (30) day return window..." }])}::jsonb,
      3
    );
  `;

  console.log("Seed completed successfully!");
  console.log(`Workspace: Acme Research Labs (${workspaceId})`);
  console.log(`Documents Seeded: ${seedDocs.length}`);
  console.log(`Chunks Seeded: ${insertedChunkRecords.length}`);
  console.log(`Graph Entities Seeded: ${entities.length}`);
  console.log(`Graph Edges Seeded: ${edges.length}`);
}

seed().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
