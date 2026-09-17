import pdf from "pdf-parse";
import mammoth from "mammoth";

export interface ParsedDocument {
  text: string;
  pages: Array<{ pageNumber: number; text: string }>;
}

/**
 * Parses raw file buffer into text and per-page structures.
 */
export async function parseDocument(
  fileBuffer: Buffer,
  fileType: "pdf" | "docx" | "md" | "txt"
): Promise<ParsedDocument> {
  switch (fileType) {
    case "pdf": {
      const parsed = await pdf(fileBuffer);
      // approximate pages from page markers if present or split evenly
      const rawText = parsed.text;
      const pageTexts = rawText.split(/\f|\n(?=Page\s+\d+)/i);

      const pages = pageTexts.map((txt, idx) => ({
        pageNumber: idx + 1,
        text: txt.trim(),
      })).filter((p) => p.text.length > 0);

      return {
        text: rawText,
        pages: pages.length > 0 ? pages : [{ pageNumber: 1, text: rawText }],
      };
    }

    case "docx": {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      return {
        text: result.value,
        pages: [{ pageNumber: 1, text: result.value }],
      };
    }

    case "md":
    case "txt":
    default: {
      const text = fileBuffer.toString("utf-8");
      return {
        text,
        pages: [{ pageNumber: 1, text }],
      };
    }
  }
}
