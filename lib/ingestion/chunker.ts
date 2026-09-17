export interface TextChunk {
  content: string;
  pageNumber?: number;
  chunkIndex: number;
}

/**
 * Semantic chunker splitting on headings and double newlines,
 * then enforcing max ~500 tokens with ~50 token overlap.
 */
export function chunkDocument(
  pages: Array<{ pageNumber: number; text: string }>,
  targetTokens = 450,
  overlapTokens = 50
): TextChunk[] {
  const chunks: TextChunk[] = [];
  let chunkIndex = 0;

  for (const page of pages) {
    // Split on headings (# Heading) or double newlines (\n\n)
    const paragraphs = page.text
      .split(/(?:\r?\n){2,}|(?=^#{1,3}\s)/m)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    let currentTokens: string[] = [];
    let currentText = "";

    for (const para of paragraphs) {
      const paraWords = para.split(/\s+/);

      // If adding this paragraph exceeds targetTokens, emit chunk
      if (currentTokens.length + paraWords.length > targetTokens && currentTokens.length > 0) {
        chunks.push({
          content: currentTokens.join(" "),
          pageNumber: page.pageNumber,
          chunkIndex: chunkIndex++,
        });

        // Retain overlap tokens from the end
        currentTokens = currentTokens.slice(-overlapTokens);
      }

      currentTokens.push(...paraWords);
    }

    if (currentTokens.length > 0) {
      chunks.push({
        content: currentTokens.join(" "),
        pageNumber: page.pageNumber,
        chunkIndex: chunkIndex++,
      });
    }
  }

  return chunks;
}
