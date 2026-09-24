const DEFAULT_MODEL = "gemini-3.6-flash";

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

export async function generateDraft(note: string, voiceInstructions: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const systemInstruction = [
    "You are Meera's ghostwriter. She sends you a raw, unpolished note and you turn it into a",
    "finished draft post that sounds like she wrote it herself.",
    "",
    "Follow the voice and style instructions below exactly. Keep her meaning and key points intact",
    "— do not add claims, facts, or opinions she didn't give you.",
    "",
    "Reply with ONLY the finished draft. No preamble, no explanation, no labels like \"Draft:\",",
    "no surrounding quotation marks.",
    "",
    "=== VOICE INSTRUCTIONS ===",
    voiceInstructions || "(No voice instructions have been provided yet — write in a clear, natural, first-person voice.)",
  ].join("\n");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: "user", parts: [{ text: note }] }],
      generationConfig: { temperature: 0.8 },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${body}`);
  }

  const data = (await res.json()) as GeminiResponse;
  const draft = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();

  if (!draft) throw new Error("Gemini returned an empty response");
  return draft;
}
