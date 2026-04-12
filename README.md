# NotchNotch Clipper

Your AI agent lives in your MacBook's notch. It reads your emails, manages your calendar, searches the web, writes code, remembers everything you tell it. But until now, it couldn't see what *you* were seeing.

**NotchNotch Clipper** is its eyes on the web.

One click — any page you're reading gets sent to your agent's brain. An article, a thread, a doc behind a login wall, a recipe, a spec. Your agent reads it, extracts what matters, and remembers it. No copy-paste. No switching windows. No "hey can you look at this link" — it already knows.

Select a paragraph, right-click, **NotchNotch it**. Done.

## Setup

**Prerequisites:** [NotchNotch](https://github.com/KikinaStudio/NotchNotch) running with the Hermes API server enabled (`API_SERVER_ENABLED=true` in `~/.hermes/.env`).

1. Clone or download this repo
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked** → select this folder
5. Pin the extension to your toolbar

That's it. Click the icon on any page.

## How it works

```
You click the NotchNotch icon
  → Extension extracts the page as clean markdown
  → Sends it to your Hermes agent at localhost:8642
  → Agent reads, summarizes, stores in memory
  → "notchnotched" ✓
```

The agent decides what's important. You just point at things.

## Features

**Full page clip** — Click the icon or press `Alt+Shift+B`. The page is extracted via Readability.js, converted to markdown, stripped of link URLs and images (to save tokens), and sent to your agent. Popup shows status and auto-closes.

**Selection clip** — Select text on any page, right-click → **NotchNotch it**. The selected text plus surrounding context (up to 2000 chars) is sent to your agent. A toast confirms in the corner of the page.

**Works everywhere** — Behind logins, paywalls, SPAs. If you can see it in your browser, NotchNotch Clipper can grab it. Runs in the page context after authentication — no proxies, no server-side fetching.

**Same brain, everywhere** — Clips share the same memory context as NotchNotch and Telegram via the `X-Hermes-Session-Id` header. Ask your agent about something you clipped from any interface.

**50K character limit** — Consistent with NotchNotch's document handling. Long pages are truncated with a marker.

## Stack

```
manifest.json     Chrome MV3, no build step
background.js     Service worker — API calls, context menu, toasts
content.js        Readability.js + Turndown.js → clean markdown
popup.html/js     Auto-clips on open, terminal-style status
lib/              Readability.js (Mozilla), Turndown.js (MIT)
```

Plain JavaScript. No framework. No npm. No build. Load unpacked and go.

---

Part of the [NotchNotch](https://github.com/KikinaStudio/NotchNotch) ecosystem — giving your MacBook a voice, a brain, and now, eyes.
