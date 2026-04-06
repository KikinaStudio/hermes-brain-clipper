const HERMES_URL = "http://localhost:8642/v1/chat/completions";
const HEALTH_URL = "http://localhost:8642/health";
const TIMEOUT_MS = 60000;

// Session ID: must be notchnotch-<telegram_user_id>
// Same format as NotchNotch's SessionStore.swift
const SESSION_ID = "notchnotch-7921106232";

// --- Context menu setup ---

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "notchnotch-it",
    title: "NotchNotch it",
    contexts: ["selection"]
  });
});

// --- Health check ---

async function checkHealth() {
  try {
    const res = await fetch(HEALTH_URL);
    return res.ok;
  } catch {
    return false;
  }
}

// --- Shared Hermes API call (matches ChatViewModel.saveToBrain + HermesClient.sendCompletion) ---

async function sendToHermes(prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(HERMES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hermes-Session-Id": SESSION_ID
      },
      body: JSON.stringify({
        model: "hermes-agent",
        messages: [{ role: "user", content: prompt }],
        stream: false
      }),
      signal: controller.signal
    });

    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`Failed: ${res.status}`);
    }

    // Fire-and-forget: check 200, discard body (per CLAUDE.md)
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") throw new Error("Request timed out (60s)");
    if (err.message.startsWith("Failed:")) throw err;
    throw new Error("Hermes is offline — is the API server enabled? (API_SERVER_ENABLED=true in ~/.hermes/.env)");
  }
}

// --- Full-page clip ---
// Matches NotchNotch ChatViewModel.saveToBrain() prompt format exactly:
// "Please save the following content to your memory. File: <source>\n\n<content>"

async function clipTab(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    files: ["lib/readability.js", "lib/turndown.js", "content.js"]
  });

  const result = results[0]?.result;
  if (!result || result.error) {
    throw new Error(result?.error || "Cannot access this page");
  }

  const source = `${result.title} (${result.url})`;
  const prompt = `Please save the following content to your memory. File: ${source}\n\n${result.markdown}`;

  return sendToHermes(prompt);
}

// --- Selection clip (context menu) ---
// Same saveToBrain pattern but with [selection] marker

async function clipSelection(tab, selectionText) {
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const sel = window.getSelection();
      if (!sel.rangeCount) return "";
      const parent = sel.getRangeAt(0).commonAncestorContainer;
      const el = parent.nodeType === Node.ELEMENT_NODE ? parent : parent.parentElement;
      if (!el) return "";
      const text = el.textContent || "";
      return text.length > 2000 ? text.substring(0, 2000) + "..." : text;
    }
  });

  const context = results[0]?.result || "";
  const source = `${tab.title} (${tab.url}) [selection]`;
  const content = context ? `${selectionText}\n\nSurrounding context:\n${context}` : selectionText;
  const prompt = `Please save the following content to your memory. File: ${source}\n\n${content}`;

  return sendToHermes(prompt);
}

// --- Badge feedback ---

function showBadge(tabId, success) {
  chrome.action.setBadgeText({ text: success ? "\u2713" : "\u2717", tabId });
  chrome.action.setBadgeBackgroundColor({ color: success ? "#22c55e" : "#ef4444", tabId });
  setTimeout(() => chrome.action.setBadgeText({ text: "", tabId }), 3000);
}

// --- Notification feedback ---

function notify(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/128.png",
    title,
    message
  });
}

// --- Event listeners ---

// Popup sends CLIP message
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "CLIP") return;

  chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
    if (!tab || tab.url?.startsWith("chrome://")) {
      sendResponse({ error: "Cannot clip browser internal pages" });
      return;
    }

    const online = await checkHealth();
    if (!online) {
      sendResponse({ error: "Hermes is offline — start the API server first" });
      return;
    }

    clipTab(tab.id)
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ error: err.message }));
  });

  return true; // keep message channel open for async response
});

// Context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "notchnotch-it") return;

  clipSelection(tab, info.selectionText)
    .then(() => {
      showBadge(tab.id, true);
      notify("Clipped to brain", "Selection saved successfully");
    })
    .catch(err => {
      showBadge(tab.id, false);
      notify("Clip failed", err.message);
    });
});

// Keyboard shortcut (Alt+Shift+B) -- fires when popup is not shown
chrome.commands.onCommand.addListener((command) => {
  if (command !== "_execute_action") return;

  chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    if (!tab || tab.url?.startsWith("chrome://")) return;

    clipTab(tab.id)
      .then(() => showBadge(tab.id, true))
      .catch(() => showBadge(tab.id, false));
  });
});
