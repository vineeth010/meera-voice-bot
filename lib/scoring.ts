const DEFAULT_MODEL = "gemini-3.6-flash";

export interface ScoreResult {
  score: number;
  reason: string;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

const SYSTEM_INSTRUCTION = [
  "You evaluate a raw, unpolished personal note — a scratchpad idea for a LinkedIn post —",
  "to decide whether it contains a substantive, developable idea worth turning into a",
  "personal LinkedIn post.",
  "",
  "The note may be about any topic relevant to the author's perspective, including but not",
  "limited to: work and professional experiences, entrepreneurship, leadership, AI and",
  "technology, customers and products, learning, decision-making, creativity, observations",
  "about people or organizations, personal experiences that contain a useful insight, and",
  "lessons, questions, tensions, or opinions worth exploring. Do NOT require the topic to",
  "be related to startups, business, skincare, or entrepreneurship specifically.",
  "",
  "Score the note from 0 to 10:",
  "- 0-5: reject — a task, reminder, fragment, or excessively vague statement with no",
  "  substantive idea to develop.",
  "- 6-10: worth drafting — contains a clear point, observation, tension, insight, useful",
  "  question, experience, or perspective with enough substance to develop into a post.",
  "",
  "Do NOT require the note to already be well-written or polished. A rough personal",
  "observation can score 6 or higher even if it is not polished, as long as it has real",
  "substance.",
  "",
  "Respond with ONLY valid JSON matching this exact shape, nothing else:",
  '{"score": <integer 0-10>, "reason": "<one concise sentence>"}',
].join("\n");

function parseScoreResult(rawText: string): ScoreResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error("Gemini scoring response was not valid JSON");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Gemini scoring response was not a JSON object");
  }

  const obj = parsed as Record<string, unknown>;
  const rawScore = obj.score;
  const rawReason = obj.reason;

  if (typeof rawScore !== "number" || !Number.isFinite(rawScore)) {
    throw new Error("Gemini scoring response had a non-numeric score");
  }

  const score = Math.max(0, Math.min(10, Math.round(rawScore)));
  const reason =
    typeof rawReason === "string" && rawReason.trim() ? rawReason.trim() : "(no reason given)";

  return { score, reason };
}

export async function scoreNote(note: string): Promise<ScoreResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ role: "user", parts: [{ text: note }] }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            score: { type: "INTEGER" },
            reason: { type: "STRING" },
          },
          required: ["score", "reason"],
        },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini scoring API error (${res.status}): ${body}`);
  }

  const data = (await res.json()) as GeminiResponse;
  const rawText = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();

  if (!rawText) throw new Error("Gemini scoring returned an empty response");

  return parseScoreResult(rawText);
}
