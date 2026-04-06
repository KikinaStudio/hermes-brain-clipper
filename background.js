const HERMES_URL = "http://localhost:8642/v1/chat/completions";
const HEALTH_URL = "http://localhost:8642/health";
const NOTCH_TOAST_URL = "http://localhost:19944/clip";
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

// --- NotchNotch toast notification (non-blocking) ---

async function notifyNotch(title, url) {
  try {
    await fetch(NOTCH_TOAST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, url })
    });
  } catch {
    // NotchNotch not running — silently ignore
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

  await sendToHermes(prompt);
  await notifyNotch(result.title, result.url);
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

  await sendToHermes(prompt);
  await notifyNotch(tab.title, tab.url);
}

// --- Badge feedback ---

function showBadge(tabId, success) {
  chrome.action.setBadgeText({ text: success ? "\u2713" : "\u2717", tabId });
  chrome.action.setBadgeBackgroundColor({ color: success ? "#22c55e" : "#ef4444", tabId });
  setTimeout(() => chrome.action.setBadgeText({ text: "", tabId }), 3000);
}

// --- In-page toast (injected into the tab) ---

function showToast(tabId, success, errorMsg) {
  chrome.scripting.executeScript({
    target: { tabId },
    func: (ok, err) => {
      // ok === null = in progress, true = success, false = error
      // Remove existing toast if any
      document.getElementById("__notchnotch-toast")?.remove();

      const toast = document.createElement("div");
      toast.id = "__notchnotch-toast";
      toast.innerHTML = `
        <svg width="10" height="10" viewBox="0 0 5 5" xmlns="http://www.w3.org/2000/svg"
          ${ok === null ? 'style="animation:__nn-pulse 1s ease-in-out infinite"' : ''}>
          <path d="M3.52734 0C4.34057 0.000230008 4.99977 0.659433 5 1.47266V5H0V4.99902H1V3.99902H0V2.99902H1V1.99902H0V1.47266C0.000230008 0.659433 0.659433 0.000230008 1.47266 0H3.52734ZM2 3.99902V4.99902H3V3.99902H2ZM1 2.99902V3.99902H2V2.99902H1Z"
            fill="${ok === null ? '#C099FF' : ok ? '#22c55e' : '#ef4444'}"/>
        </svg>
        <span>${ok === null ? "notchnotching..." : ok ? "notchnotched" : "clip failed"}</span>
        ${ok === false && err ? `<span style="color:#ef4444;opacity:0.7;margin-left:6px">${err}</span>` : ""}
      `;
      Object.assign(toast.style, {
        position: "fixed",
        bottom: "20px",
        right: "20px",
        zIndex: "2147483647",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px 14px",
        background: "#000",
        border: "1px solid #222",
        borderRadius: "6px",
        fontFamily: '"SF Mono","Menlo","Monaco","Consolas",monospace',
        fontSize: "12px",
        color: ok === null ? "#C099FF" : ok ? "#888" : "#666",
        boxShadow: "0 4px 20px rgba(0,0,0,0.6)",
        transition: "opacity 0.3s",
      });
      // Add pulse animation
      if (!document.getElementById("__notchnotch-style")) {
        const style = document.createElement("style");
        style.id = "__notchnotch-style";
        style.textContent = "@keyframes __nn-pulse{0%,100%{opacity:1}50%{opacity:0.2}}";
        document.head.appendChild(style);
      }
      document.body.appendChild(toast);
      // Auto-dismiss on success/error, not while in progress
      if (ok !== null) {
        setTimeout(() => {
          toast.style.opacity = "0";
          setTimeout(() => toast.remove(), 300);
        }, ok ? 1500 : 4000);
      }
    },
    args: [success, errorMsg]
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

  showToast(tab.id, null); // show "notchnotching..." state
  clipSelection(tab, info.selectionText)
    .then(() => showToast(tab.id, true))
    .catch(err => showToast(tab.id, false, err.message));
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
