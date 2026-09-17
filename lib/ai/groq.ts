import Groq from "groq-sdk";

export const GROQ_MODELS = {
  LARGE: "openai/gpt-oss-120b", // High-capability model for final synthesis
  FAST: "openai/gpt-oss-20b",    // Fast model for plan, decompose, graph extraction, and verification
};

let groqInstance: Groq | null = null;

export function getGroqClient(): Groq {
  if (!groqInstance) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error("GROQ_API_KEY environment variable is not set");
    }
    groqInstance = new Groq({ apiKey });
  }
  return groqInstance;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Robust JSON completion with rate-limit backoff and fallback extraction
 */
export async function groqJson<T>(
  prompt: string,
  systemPrompt: string,
  model = GROQ_MODELS.FAST,
  maxRetries = 3
): Promise<T> {
  const groq = getGroqClient();

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await groq.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content: `${systemPrompt}\nIMPORTANT: Respond ONLY with valid JSON. Do not enclose in markdown code fences.`,
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content || "{}";

      // Parse JSON, handling potential markdown code fences if model included them
      let cleaned = content.trim();
      if (cleaned.startsWith("```json")) {
        cleaned = cleaned.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
      } else if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```\s*/, "").replace(/```\s*$/, "").trim();
      }

      // If text contains JSON object inside, extract first {...}
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        cleaned = match[0];
      }

      return JSON.parse(cleaned) as T;
    } catch (err: any) {
      const isRateLimit =
        err?.status === 429 ||
        err?.message?.includes("rate limit") ||
        err?.code === "rate_limit_exceeded" ||
        err?.code === "json_validate_failed";

      if (attempt < maxRetries) {
        const waitMs = isRateLimit ? 3500 * attempt : 1500 * attempt;
        console.warn(`Groq retry ${attempt}/${maxRetries} after ${waitMs}ms... Reason:`, err?.message?.slice(0, 80));
        await sleep(waitMs);
        continue;
      }

      console.error("Groq JSON call failed after retries:", err?.message);
      // Return safe empty object rather than crashing pipeline
      return {} as T;
    }
  }

  return {} as T;
}

/**
 * Call Groq with plain text output and retry backoff
 */
export async function groqComplete(
  prompt: string,
  systemPrompt: string,
  model = GROQ_MODELS.LARGE,
  maxRetries = 3
): Promise<{ text: string; tokensUsed: number }> {
  const groq = getGroqClient();

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await groq.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
      });

      const text = response.choices[0]?.message?.content || "";
      const tokensUsed = response.usage?.total_tokens || 0;
      return { text, tokensUsed };
    } catch (err: any) {
      const isRateLimit = err?.status === 429 || err?.message?.includes("rate limit");
      if (attempt < maxRetries) {
        const waitMs = isRateLimit ? 3500 * attempt : 1500 * attempt;
        console.warn(`Groq complete retry ${attempt}/${maxRetries} after ${waitMs}ms...`);
        await sleep(waitMs);
        continue;
      }
      throw err;
    }
  }

  return { text: "Unable to complete response due to inference timeout.", tokensUsed: 0 };
}
