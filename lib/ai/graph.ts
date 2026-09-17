import { sqlClient } from "@/lib/db";
import { groqJson, GROQ_MODELS } from "./groq";

export interface ExtractedGraph {
  entities: Array<{ name: string; type: string }>;
  relationships: Array<{
    from: string;
    to: string;
    relationship: string;
    confidence: number;
  }>;
}

/**
 * Extracts entities and relationships from document chunks using Llama 3.1 8B.
 */
export async function extractGraphFromChunk(chunkText: string): Promise<ExtractedGraph> {
  const systemPrompt = `You are a knowledge graph information extractor.
Analyze the provided document text and extract:
1. "entities": Key concepts, policies, regulations, organizations, people, or technical terms. For each: { "name": string, "type": string }
2. "relationships": Explicit interactions, dependencies, conflicts, or hierarchies between extracted entities. For each: { "from": string, "to": string, "relationship": string, "confidence": number between 0 and 1 }

Relationships should use clear verbs (e.g. "overrides", "complies_with", "references", "supersedes", "requires", "conflicts_with").
Return JSON with { "entities": [...], "relationships": [...] }. Keep entity names concise.`;

  try {
    const result = await groqJson<ExtractedGraph>(
      chunkText.slice(0, 3000),
      systemPrompt,
      GROQ_MODELS.FAST
    );

    return {
      entities: Array.isArray(result.entities) ? result.entities : [],
      relationships: Array.isArray(result.relationships) ? result.relationships : [],
    };
  } catch (err) {
    console.warn("Entity/relation extraction warning:", err);
    return { entities: [], relationships: [] };
  }
}

export interface GraphTraversalResult {
  entityName: string;
  relationship: string | null;
  targetEntityName: string | null;
  sourceChunkId: string | null;
  depth: number;
}

/**
 * Walks the property graph up to 2 hops using a Postgres Recursive Common Table Expression (CTE).
 * Identifies cross-document relationships and returns connected source chunk IDs.
 */
export async function traverseGraph(
  workspaceId: string,
  queryEntities: string[]
): Promise<GraphTraversalResult[]> {
  if (queryEntities.length === 0) return [];

  const results: GraphTraversalResult[] = [];

  for (const entityName of queryEntities) {
    const searchPattern = `%${entityName.trim()}%`;

    const rawRows = await sqlClient(
      `WITH RECURSIVE graph_walk AS (
        -- Base case: find matching root entities
        SELECT 
          e.id AS current_id,
          e.name AS current_name,
          NULL::uuid AS edge_id,
          NULL::text AS relationship,
          NULL::text AS target_name,
          NULL::uuid AS source_chunk_id,
          0 AS depth
        FROM graph_entities e
        WHERE e.workspace_id = $1
          AND (
            LOWER(e.name) LIKE LOWER($2)
            OR similarity(e.name, $3) > 0.3
          )

        UNION

        -- Recursive step: traverse connected edges up to depth 2
        SELECT
          target.id AS current_id,
          target.name AS current_name,
          ed.id AS edge_id,
          ed.relationship AS relationship,
          gw.current_name AS target_name,
          ed.source_chunk_id AS source_chunk_id,
          gw.depth + 1 AS depth
        FROM graph_walk gw
        JOIN graph_edges ed ON (ed.from_entity_id = gw.current_id OR ed.to_entity_id = gw.current_id)
        JOIN graph_entities target ON (
          target.id = CASE WHEN ed.from_entity_id = gw.current_id THEN ed.to_entity_id ELSE ed.from_entity_id END
        )
        WHERE gw.depth < 2
      )
      SELECT DISTINCT
        gw.current_name as "entityName",
        gw.relationship as "relationship",
        gw.target_name as "targetEntityName",
        gw.source_chunk_id as "sourceChunkId",
        gw.depth as "depth"
      FROM graph_walk gw
      WHERE gw.source_chunk_id IS NOT NULL
      LIMIT 15;`,
      [workspaceId, searchPattern, entityName]
    );

    for (const r of rawRows) {
      results.push({
        entityName: r.entityName,
        relationship: r.relationship,
        targetEntityName: r.targetEntityName,
        sourceChunkId: r.sourceChunkId,
        depth: Number(r.depth),
      });
    }
  }

  return results;
}
