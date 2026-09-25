import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sendMessage, sendChatAction } from "../lib/telegram";
import { generateDraft } from "../lib/gemini";
import { getVoiceInstructions } from "../lib/voice";
import { scoreNote } from "../lib/scoring";

const SCORE_THRESHOLD = 6;

const WELCOME_MESSAGE =
  "Hi! Send me a note and I'll turn it into a draft post in your voice.";

interface TelegramMessage {
  chat?: { id?: number | string };
  text?: string;
}

interface TelegramUpdate {
  message?: TelegramMessage;
  channel_post?: TelegramMessage;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(200).json({ ok: true });
    return;
  }

  // If a webhook secret is configured, require Telegram to echo it back.
  // https://core.telegram.org/bots/api#setwebhook (secret_token)
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret) {
    const providedSecret = req.headers["x-telegram-bot-api-secret-token"];
    if (providedSecret !== expectedSecret) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
  }

  const update = req.body as TelegramUpdate;
  const incoming = update?.message ?? update?.channel_post;
  const chatId = incoming?.chat?.id;
  const text = incoming?.text;

  if (!chatId || !text) {
    res.status(200).json({ ok: true });
    return;
  }

  // Optional allowlist so only Meera's chat can trigger the bot.
  const allowedChatId = process.env.ALLOWED_CHAT_ID;
  if (allowedChatId && String(chatId) !== String(allowedChatId)) {
    console.warn(`Ignored message from unauthorized chat id: ${chatId}`);
    res.status(200).json({ ok: true });
    return;
  }

  if (text.trim() === "/start") {
    await sendMessage(chatId, WELCOME_MESSAGE);
    res.status(200).json({ ok: true });
    return;
  }

  try {
    await sendChatAction(chatId, "typing");

    const { score, reason } = await scoreNote(text);
    if (score < SCORE_THRESHOLD) {
      await sendMessage(chatId, `Skipping this one — score ${score}/10. ${reason}`);
      res.status(200).json({ ok: true });
      return;
    }

    const voiceInstructions = getVoiceInstructions();
    const draft = await generateDraft(text, voiceInstructions);
    await sendMessage(chatId, draft);
  } catch (err) {
    console.error("Failed to process note:", err);
    await sendMessage(
      chatId,
      "Sorry, something went wrong generating that draft. Please try again in a moment."
    ).catch(() => {});
  }

  res.status(200).json({ ok: true });
}
