export interface RerankCandidate {
  id: string;
  document_id: string;
  filename: string;
  page_number?: number;
  content: string;
  score?: number;
}

/**
 * Re-ranks candidates against a query using BAAI/bge-reranker-base via HF Inference API
 * or fallbacks to exact/semantic token cross-scoring.
 */
export async function rerankCandidates(
  query: string,
  candidates: RerankCandidate[],
  topK: number = 6
): Promise<RerankCandidate[]> {
  if (candidates.length <= topK) {
    return candidates;
  }

  const hfKey = process.env.HUGGINGFACE_API_KEY;

  if (hfKey) {
    try {
      const response = await fetch(
        "https://api-inference.huggingface.co/models/BAAI/bge-reranker-base",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${hfKey}`,
          },
          body: JSON.stringify({
            inputs: {
              source_sentence: query,
              sentences: candidates.map((c) => c.content.slice(0, 1000)),
            },
          }),
        }
      );

      if (response.ok) {
        const scores: number[] = await response.json();
        if (Array.isArray(scores) && scores.length === candidates.length) {
          const scored = candidates.map((c, i) => ({
            ...c,
            score: scores[i],
          }));
          scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
          return scored.slice(0, topK);
        }
      }
    } catch (err) {
      console.warn("Hugging Face reranker call failed, using fallback scorer:", err);
    }
  }

  // Cross-scoring fallback: BM25-style term frequency + exact phrase + proximity boost
  const queryTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const scored = candidates.map((c) => {
    const text = c.content.toLowerCase();
    let score = 0;

    // Exact query phrase boost
    if (text.includes(query.toLowerCase())) {
      score += 10.0;
    }

    // Individual term frequency & density
    for (const term of queryTerms) {
      const occurrences = text.split(term).length - 1;
      score += Math.min(occurrences, 5) * 1.5;
    }

    // Title / filename match
    for (const term of queryTerms) {
      if (c.filename.toLowerCase().includes(term)) {
        score += 2.0;
      }
    }

    return { ...c, score };
  });

  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return scored.slice(0, topK);
}
