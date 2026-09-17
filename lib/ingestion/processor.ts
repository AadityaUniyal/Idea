import { sqlClient, db } from "@/lib/db";
import { parseDocument } from "./parser";
import { chunkDocument } from "./chunker";
import { getEmbeddings } from "@/lib/ai/embeddings";
import { extractGraphFromChunk } from "@/lib/ai/graph";

/**
 * Process queued ingestion jobs using PostgreSQL row-level locking
 * (SELECT ... FOR UPDATE SKIP LOCKED) to allow safe concurrent workers.
 */
export async function processIngestionQueue(): Promise<{
  processed: number;
  documentId?: string;
  status: string;
}> {
  // 1. Atomically pick the oldest queued job with row locking
  const jobs = await sqlClient(
    `SELECT 
       j.id as job_id,
       j.document_id,
       j.attempts,
       d.workspace_id,
       d.filename,
       d.file_type,
       d.file_url
     FROM ingestion_jobs j
     JOIN documents d ON d.id = j.document_id
     WHERE j.status = 'queued'
     ORDER BY j.created_at ASC
     FOR UPDATE SKIP LOCKED
     LIMIT 1;`
  );

  if (!jobs || jobs.length === 0) {
    return { processed: 0, status: "idle" };
  }

  const job = jobs[0];
  const { job_id, document_id, workspace_id, filename, file_type, file_url } = job;

  // Mark processing
  await sqlClient(
    `UPDATE ingestion_jobs 
     SET status = 'processing', attempts = attempts + 1, updated_at = NOW()
     WHERE id = $1;`,
    [job_id]
  );
  await sqlClient(
    `UPDATE documents SET status = 'chunking' WHERE id = $1;`,
    [document_id]
  );

  try {
    // 2. Fetch or read file buffer
    let fileBuffer: Buffer;
    if (file_url.startsWith("data:")) {
      const base64Data = file_url.split(",")[1];
      fileBuffer = Buffer.from(base64Data, "base64");
    } else if (file_url.startsWith("http://") || file_url.startsWith("https://")) {
      const res = await fetch(file_url);
      const arrayBuf = await res.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuf);
    } else {
      fileBuffer = Buffer.from(file_url, "utf-8");
    }

    // 3. Parse Document
    const parsed = await parseDocument(fileBuffer, file_type);

    // 4. Chunk Document
    const rawChunks = chunkDocument(parsed.pages);
    await sqlClient(
      `UPDATE documents 
       SET status = 'embedding', page_count = $2, chunk_count = $3
       WHERE id = $1;`,
      [document_id, parsed.pages.length, rawChunks.length]
    );

    // 5. Batch Embed Chunks
    const embeddings = await getEmbeddings(rawChunks.map((c) => c.content));

    // 6. Insert Chunks
    for (let i = 0; i < rawChunks.length; i++) {
      const chunk = rawChunks[i];
      const vec = embeddings[i];
      const vecStr = `[${vec.join(",")}]`;

      const [insertedChunk] = await sqlClient(
        `INSERT INTO chunks (document_id, workspace_id, content, embedding, page_number, chunk_index)
         VALUES ($1, $2, $3, $4::vector, $5, $6)
         RETURNING id;`,
        [document_id, workspace_id, chunk.content, vecStr, chunk.pageNumber ?? 1, chunk.chunkIndex]
      );

      // 7. Extract Entities & Relationships for Knowledge Graph (Llama 3.1 8B)
      // Extract from chunk
      if (chunk.content.length > 50) {
        try {
          const graphData = await extractGraphFromChunk(chunk.content);

          const entityIdMap = new Map<string, string>();

          // Upsert Entities (deduplicate by name within workspace)
          for (const ent of graphData.entities) {
            const cleanName = ent.name.trim();
            if (!cleanName) continue;

            const existing = await sqlClient(
              `SELECT id, source_chunk_ids FROM graph_entities
               WHERE workspace_id = $1 AND LOWER(name) = LOWER($2)
               LIMIT 1;`,
              [workspace_id, cleanName]
            );

            let entityId: string;
            if (existing.length > 0) {
              entityId = existing[0].id;
              const sourceIds = Array.isArray(existing[0].source_chunk_ids) ? existing[0].source_chunk_ids : [];
              if (!sourceIds.includes(insertedChunk.id)) {
                sourceIds.push(insertedChunk.id);
                await sqlClient(
                  `UPDATE graph_entities SET source_chunk_ids = $2::jsonb WHERE id = $1;`,
                  [entityId, JSON.stringify(sourceIds)]
                );
              }
            } else {
              const [newEnt] = await sqlClient(
                `INSERT INTO graph_entities (workspace_id, name, type, source_chunk_ids)
                 VALUES ($1, $2, $3, $4::jsonb)
                 RETURNING id;`,
                [workspace_id, cleanName, ent.type || "concept", JSON.stringify([insertedChunk.id])]
              );
              entityId = newEnt.id;
            }
            entityIdMap.set(cleanName.toLowerCase(), entityId);
          }

          // Insert Edges
          for (const rel of graphData.relationships) {
            const fromId = entityIdMap.get(rel.from.toLowerCase());
            const toId = entityIdMap.get(rel.to.toLowerCase());

            if (fromId && toId && fromId !== toId) {
              await sqlClient(
                `INSERT INTO graph_edges (workspace_id, from_entity_id, to_entity_id, relationship, source_chunk_id, confidence)
                 VALUES ($1, $2, $3, $4, $5, $6);`,
                [workspace_id, fromId, toId, rel.relationship, insertedChunk.id, rel.confidence || 0.9]
              );
            }
          }
        } catch (graphErr) {
          console.warn("Graph extraction error on chunk:", graphErr);
        }
      }
    }

    // 8. Mark ready
    await sqlClient(
      `UPDATE documents SET status = 'ready' WHERE id = $1;`,
      [document_id]
    );
    await sqlClient(
      `UPDATE ingestion_jobs SET status = 'done', updated_at = NOW() WHERE id = $1;`,
      [job_id]
    );

    return { processed: 1, documentId: document_id, status: "completed" };
  } catch (err: any) {
    console.error("Ingestion processing error:", err);
    await sqlClient(
      `UPDATE documents SET status = 'failed', error_message = $2 WHERE id = $1;`,
      [document_id, err.message]
    );
    await sqlClient(
      `UPDATE ingestion_jobs SET status = 'failed', updated_at = NOW() WHERE id = $1;`,
      [job_id]
    );
    return { processed: 1, documentId: document_id, status: "failed" };
  }
}
