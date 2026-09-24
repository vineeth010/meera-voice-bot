# Meera's Voice Bot

A Telegram bot: Meera sends a raw note as a text message, the bot sends it to Gemini
along with her voice instructions, and replies in the same chat with a drafted post.

## How it works

```
Meera (Telegram) --> Telegram webhook --> /api/telegram (Vercel function)
                                                |
                                                v
                                      Gemini API (generateContent)
                                                |
                                                v
                                     draft sent back to Meera
```

- [`api/telegram.ts`](api/telegram.ts) — the webhook endpoint Telegram calls on every message.
- [`lib/gemini.ts`](lib/gemini.ts) — calls the Gemini API with the note + voice instructions.
- [`lib/telegram.ts`](lib/telegram.ts) — sends messages back via the Telegram Bot API.
- [`lib/voice.ts`](lib/voice.ts) — loads [`voice-instructions.md`](voice-instructions.md).
- [`voice-instructions.md`](voice-instructions.md) — placeholder for Meera's writing style. Fill
  this in with real instructions and example posts, then redeploy (or edit directly in
  the Vercel dashboard / git repo).

## 1. Create the Telegram bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram.
2. Send `/newbot` and follow the prompts.
3. Save the bot token it gives you (looks like `123456:ABC-DEF...`).

## 2. Get a Gemini API key

Create one at [Google AI Studio](https://aistudio.google.com/apikey).

## 3. Deploy to Vercel

```bash
npm install -g vercel   # if you don't have it
vercel link             # from inside this project folder
```

Then set environment variables (Project Settings → Environment Variables in the
Vercel dashboard, or via CLI):

```bash
vercel env add TELEGRAM_BOT_TOKEN
vercel env add TELEGRAM_WEBHOOK_SECRET
vercel env add ALLOWED_CHAT_ID
vercel env add GEMINI_API_KEY
vercel env add GEMINI_MODEL
```

- `TELEGRAM_BOT_TOKEN` — from step 1.
- `TELEGRAM_WEBHOOK_SECRET` — any random string you make up (e.g. `openssl rand -hex 20`).
  Keeps randoms from POSTing fake Telegram updates to your endpoint.
- `ALLOWED_CHAT_ID` — Meera's personal chat id (see step 5 below). Leave unset only while
  testing; without it, anyone who finds the bot's username can use it.
- `GEMINI_API_KEY` — from step 2.
- `GEMINI_MODEL` — optional, defaults to `gemini-3.6-flash`.

Deploy:

```bash
vercel --prod
```

Note the deployment URL, e.g. `https://meera-voice-bot.vercel.app`.

## 4. Point Telegram at your deployment

Register the webhook (replace `<BOT_TOKEN>`, `<YOUR_URL>`, `<WEBHOOK_SECRET>`):

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=<YOUR_URL>/api/telegram" \
  -d "secret_token=<WEBHOOK_SECRET>"
```

You should get back `{"ok":true,"result":true,...}`.

## 5. Find Meera's chat id (for `ALLOWED_CHAT_ID`)

Easiest way: have Meera message the bot once, then visit (in a browser, replacing
`<BOT_TOKEN>`):

```
https://api.telegram.org/bot<BOT_TOKEN>/getUpdates
```

Look for `"message":{"chat":{"id": ...}}` in the response — that number is her chat id.
Set it as `ALLOWED_CHAT_ID` in Vercel and redeploy (or `vercel env add` + `vercel --prod`
again).

## 6. Add Meera's voice instructions

Edit [`voice-instructions.md`](voice-instructions.md) with her actual tone, formatting
habits, and a couple of example posts. Commit and redeploy — no code changes needed.

## 7. Test it

Message the bot with a rough note. It should reply "typing…" briefly, then send back a
drafted post.

## Local development

```bash
npm install
vercel dev
```

Use a tool like [ngrok](https://ngrok.com) to tunnel `vercel dev`'s local port and
temporarily point the Telegram webhook at the tunnel URL if you want to test end-to-end
locally.

## Notes

- The function returns `200 OK` to Telegram only after the Gemini call finishes, so a
  slow Gemini response can take a few seconds — `vercel.json` sets `maxDuration: 30` for
  this function. Increase it if needed (check your Vercel plan's limits).
- Long drafts are automatically split into multiple Telegram messages (4096 char limit).
- If `TELEGRAM_WEBHOOK_SECRET` or `ALLOWED_CHAT_ID` are unset, those checks are skipped —
  set both before sharing the bot's username with anyone.
