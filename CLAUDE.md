# Hermes Brain Clipper — Claude Code Project Guide

## What is this

A Chrome extension (MV3) that clips web pages and text selections into your Hermes AI agent's memory. Companion to [NotchNotch](https://github.com/KikinaStudio/NotchNotch). Think "Obsidian Web Clipper" but for Hermes's brain.

## How it connects to Hermes

Hermes is a local AI agent running on `localhost:8642` with an OpenAI-compatible API. It has a built-in memory system (currently using the `hindsight` provider) that the agent manages via tool calls. The extension does **not** write to any database or file directly — it sends a chat message asking Hermes to memorize the content, and Hermes handles storage internally.

### The brain save pattern (from NotchNotch v0.9)

NotchNotch v0.9 established the "save to brain" pattern. The extension must use the **exact same approach**:

```
POST http://localhost:8642/v1/chat/completions
Content-Type: application/json
X-Hermes-Session-Id: notchnotch-<telegram_user_id>

{
  "model": "hermes-agent",
  "messages": [
    {
      "role": "user",
      "content": "Please save the following content to your memory. File: <source>\n\n<content>"
    }
  ],
  "stream": false
}
```

Key rules:
- **`stream: false`** — fire-and-forget, no SSE parsing needed. Check for HTTP 200, discard response body.
- **`X-Hermes-Session-Id`** header — must be `notchnotch-<telegram_user_id>` (e.g. `notchnotch-7921106232`). This ensures brain saves from the extension, NotchNotch, and Telegram all share the same Hermes memory context. The raw `user_id` alone collides with existing session IDs in Hermes's DB and causes hangs.
- **Content limit** — truncate to 50,000 characters (same as NotchNotch's `DocumentExtractor.maxCharacters`).
- **No local storage of content** — all persistence goes through Hermes. The extension may store settings (API URL, session ID) in `chrome.storage.local`, but never the clipped content itself.

### Session ID discovery

The session ID (`notchnotch-<user_id>`) comes from Hermes's SQLite DB:

```sql
SELECT user_id FROM sessions
WHERE source = 'telegram' AND user_id IS NOT NULL
ORDER BY started_at DESC LIMIT 1
```

DB path: `~/.hermes/state.db`

The extension cannot read local files. Options:
1. **Manual config** — user pastes their session ID in the popup/options page
2. **Health endpoint probe** — `GET http://localhost:8642/health` returns `{"status": "ok", "platform": "hermes-agent"}`. Use this to verify Hermes is running before clipping.
3. **NotchNotch shares it** — if NotchNotch is running, the session ID is stored in `UserDefaults` under key `hermesSessionId`. Not directly accessible from Chrome, so option 1 is the practical path.

## Two clipping modes

### 1. Full page clip (popup button or Alt+Shift+B)

- Extract page content using Readability.js → convert to Markdown with Turndown.js
- Strip link URLs and images to save tokens
- Truncate at 50,000 chars
- Send to Hermes with source = page title + URL:
  ```
  Please save the following content to your memory. Source: <title> (<url>)

  <markdown_content>
  ```

### 2. Selection clip (right-click context menu: "NotchNotch it")

- Grab `window.getSelection().toString()`
- Include surrounding context (up to 2000 chars) for relevance
- Send to Hermes with source = page title + URL + "selection":
  ```
  Please save the following content to your memory. Source: <title> (<url>) [selection]

  <selected_text>
  ```

## Architecture

```
manifest.json     — MV3 config, permissions (activeTab, scripting, contextMenus, notifications)
background.js     — Service worker: API calls to Hermes, context menu, badge/notification feedback
content.js        — Content script: DOM extraction via Readability.js + Turndown.js → Markdown
popup.html/js     — Auto-clips on open, shows status (sending/ok/err), auto-closes after 1.5s
lib/              — Readability.js, Turndown.js
icons/            — Extension icons (16, 48, 128)
```

### Data flow

```
User clicks clip (or Alt+Shift+B, or right-click selection)
  → background.js receives message
  → injects content.js into active tab
  → content.js extracts page/selection as Markdown
  → background.js sends POST to localhost:8642/v1/chat/completions
  → Hermes processes the message, stores in memory via hindsight provider
  → background.js shows badge ✓/✗ + notification
```

## Important gotchas

- **Session ID must be prefixed** — `notchnotch-<user_id>`, NOT the raw user_id. See "The brain save pattern" above.
- **Hermes may be offline** — always check health endpoint first, show clear error state.
- **Chrome blocks localhost in some configs** — `host_permissions` for `http://localhost:8642/*` is already in manifest.json.
- **No chrome:// pages** — `content.js` cannot run on browser internal pages. Guard against this.
- **50k char limit** — same as NotchNotch. Truncate with a `[...truncated at 50000 characters]` marker.
- **Readability.js can fail** — some pages (SPAs, paywalled) won't parse. Fall back to `document.body.innerText`.

## Hermes memory system context

Hermes config (`~/.hermes/config.yaml`) relevant settings:
- `memory.enabled: true`
- `memory.provider: hindsight` (one of 6 pluggable providers)
- `memory.char_limit: 2200` — Hermes's internal memory file limit (not our concern — Hermes manages compression)
- `memory.user_profile_char_limit: 1375`
- `memory.flush_min_turns: 6` — Hermes flushes memories after 6 turns

The extension just sends the content. Hermes decides what to extract, summarize, and persist. We don't need to pre-summarize or structure the data.

## Conventions

- Plain JavaScript (no build step, no framework)
- Chrome MV3 (service worker, not background page)
- Dark theme UI matching NotchNotch (black background, purple accent `#bf99ff`)
- Minimal dependencies: only Readability.js + Turndown.js in `lib/`
