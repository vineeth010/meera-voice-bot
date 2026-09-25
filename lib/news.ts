const DEFAULT_MODEL = "gemini-3.6-flash";
const NEWS_FETCH_TIMEOUT_MS = 8000;

export interface NewsItem {
  headline: string;
  publication: string;
  date: string;
  summary: string;
  url: string;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

const KEYWORD_SYSTEM_INSTRUCTION = [
  "You extract search terms from a short personal note so it can be looked up against recent",
  "news coverage.",
  "",
  "Read the note and produce:",
  "- 3 to 5 useful search keywords or short phrases that capture its core topic.",
  "- One short search phrase (a few words, suitable as a news search query) combining the",
  "  most important terms.",
  "",
  "Respond with ONLY valid JSON matching this exact shape, nothing else:",
  '{"keywords": ["term1", "term2", "..."], "searchPhrase": "short search phrase"}',
].join("\n");

// Never throws — returns null on any failure so callers can fall back to drafting
// without a news item, rather than fabricating search terms.
async function extractSearchPhrase(note: string): Promise<string | null> {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;

    const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: KEYWORD_SYSTEM_INSTRUCTION }] },
        contents: [{ role: "user", parts: [{ text: note }] }],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              keywords: { type: "ARRAY", items: { type: "STRING" } },
              searchPhrase: { type: "STRING" },
            },
            required: ["keywords", "searchPhrase"],
          },
        },
      }),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as GeminiResponse;
    const rawText = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
    if (!rawText) return null;

    const parsed = JSON.parse(rawText) as { keywords?: unknown; searchPhrase?: unknown };
    const phrase = typeof parsed.searchPhrase === "string" ? parsed.searchPhrase.trim() : "";
    return phrase || null;
  } catch {
    return null;
  }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'");
}

function stripHtmlTags(text: string): string {
  return decodeHtmlEntities(text.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function extractTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!match) return null;
  let value = match[1].trim();
  const cdataMatch = value.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdataMatch) value = cdataMatch[1].trim();
  return value;
}

function formatPubDate(pubDate: string | null): string {
  if (!pubDate) return "(date unknown)";
  const parsed = new Date(pubDate);
  if (Number.isNaN(parsed.getTime())) return pubDate;
  return parsed.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// Google News RSS returns items in a predictable, simple shape; a small regex-based parser
// avoids pulling in an XML dependency for a single feed format. Returns null (never throws)
// if the feed is empty or a required field is missing — no field is ever fabricated.
function parseGoogleNewsRss(xml: string): NewsItem | null {
  const itemMatch = xml.match(/<item>([\s\S]*?)<\/item>/i);
  if (!itemMatch) return null;
  const itemXml = itemMatch[1];

  const rawTitle = extractTag(itemXml, "title");
  const rawLink = extractTag(itemXml, "link");
  const rawPubDate = extractTag(itemXml, "pubDate");
  const rawSource = extractTag(itemXml, "source");
  const rawDescription = extractTag(itemXml, "description");

  if (!rawTitle || !rawLink) return null;

  let headline = decodeHtmlEntities(rawTitle).trim();
  const publication = rawSource ? decodeHtmlEntities(rawSource).trim() : "(unknown source)";

  // Google News titles are often "Headline - Source Name"; strip the trailing source if present.
  if (publication && headline.endsWith(` - ${publication}`)) {
    headline = headline.slice(0, -(publication.length + 3)).trim();
  }

  const url = decodeHtmlEntities(rawLink).trim();
  const date = formatPubDate(rawPubDate);
  const strippedDescription = rawDescription ? stripHtmlTags(rawDescription) : "";
  const summary = strippedDescription && strippedDescription !== headline ? strippedDescription : headline;

  if (!headline || !url) return null;

  return { headline, publication, date, summary, url };
}

// Never throws — returns null on any failure (network error, timeout, bad response,
// no results, malformed feed) so callers can fall back to drafting without a news item.
async function searchGoogleNews(phrase: string): Promise<NewsItem | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NEWS_FETCH_TIMEOUT_MS);

  try {
    const searchUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(phrase)}&hl=en-US&gl=US&ceid=US:en`;
    const res = await fetch(searchUrl, { signal: controller.signal });
    if (!res.ok) return null;

    const xml = await res.text();
    return parseGoogleNewsRss(xml);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Orchestrates keyword extraction + Google News search. Never throws — always resolves to
// a NewsItem or null, so callers don't need special-case error handling for "no news found".
export async function getNewsAngle(note: string): Promise<NewsItem | null> {
  try {
    const phrase = await extractSearchPhrase(note);
    if (!phrase) return null;
    return await searchGoogleNews(phrase);
  } catch {
    return null;
  }
}
