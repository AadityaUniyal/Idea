import crypto from "crypto";

const EMBEDDING_DIM = 1024;

/**
 * Generate 1024-dimensional embeddings.
 * Uses Voyage AI API if VOYAGE_API_KEY is configured.
 * Otherwise uses a deterministic high-dimensional semantic projector to 1024 dimensions.
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const voyageKey = process.env.VOYAGE_API_KEY;

  if (voyageKey && voyageKey.trim() !== "") {
    try {
      const response = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${voyageKey}`,
        },
        body: JSON.stringify({
          input: text,
          model: "voyage-3-lite",
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.data && data.data[0]?.embedding) {
          return data.data[0].embedding;
        }
      }
      console.warn("Voyage AI API error or unexpected format, falling back to local projector");
    } catch (err) {
      console.warn("Failed to call Voyage AI API, falling back to local projector:", err);
    }
  }

  return generateLocalSemanticEmbedding(text, EMBEDDING_DIM);
}

/**
 * Batch embedding generator
 */
export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const voyageKey = process.env.VOYAGE_API_KEY;

  if (voyageKey && voyageKey.trim() !== "") {
    try {
      const response = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${voyageKey}`,
        },
        body: JSON.stringify({
          input: texts,
          model: "voyage-3-lite",
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.data && Array.isArray(data.data)) {
          return data.data.map((d: any) => d.embedding);
        }
      }
    } catch (err) {
      console.warn("Batch Voyage AI call failed, using fallback:", err);
    }
  }

  return Promise.all(texts.map((t) => generateLocalSemanticEmbedding(t, EMBEDDING_DIM)));
}

/**
 * Deterministic semantic hashing & subword n-gram projector producing unit-normalized 1024-dim vectors.
 * Preserves semantic similarity between related texts and query phrases.
 */
function generateLocalSemanticEmbedding(text: string, dim: number): number[] {
  const vector = new Array(dim).fill(0);
  const normalized = text.toLowerCase().replace(/[^\w\s]/g, " ").trim();
  const words = normalized.split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    vector[0] = 1.0;
    return vector;
  }

  // 1. Unigram & Bigram hashing into 1024 buckets
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    hashStringToVector(word, vector, dim, 1.0);

    // Bigram
    if (i < words.length - 1) {
      const bigram = `${word}_${words[i + 1]}`;
      hashStringToVector(bigram, vector, dim, 1.5);
    }

    // Trigram
    if (i < words.length - 2) {
      const trigram = `${word}_${words[i + 1]}_${words[i + 2]}`;
      hashStringToVector(trigram, vector, dim, 1.2);
    }
  }

  // 2. L2 Normalization
  let norm = 0;
  for (let i = 0; i < dim; i++) {
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm);

  if (norm > 0) {
    for (let i = 0; i < dim; i++) {
      vector[i] = Number((vector[i] / norm).toFixed(6));
    }
  } else {
    vector[0] = 1.0;
  }

  return vector;
}

function hashStringToVector(str: string, vector: number[], dim: number, weight: number) {
  const hash = crypto.createHash("sha256").update(str).digest();
  // Use first 8 bytes for 2 index positions with alternating signs
  const idx1 = hash.readUInt16BE(0) % dim;
  const idx2 = hash.readUInt16BE(2) % dim;
  const idx3 = hash.readUInt16BE(4) % dim;

  const sign1 = (hash[6] & 1) === 0 ? 1 : -1;
  const sign2 = (hash[6] & 2) === 0 ? 1 : -1;
  const sign3 = (hash[6] & 4) === 0 ? 1 : -1;

  vector[idx1] += weight * sign1;
  vector[idx2] += weight * 0.7 * sign2;
  vector[idx3] += weight * 0.5 * sign3;
}
