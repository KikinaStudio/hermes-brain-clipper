const body = document.body;
const message = document.getElementById("message");
const detail = document.getElementById("detail");

// Auto-clip immediately on popup open
chrome.runtime.sendMessage({ type: "CLIP" }, (res) => {
  if (res?.ok) {
    body.className = "ok";
    message.textContent = "Page clipped in NotchNotch!";
    setTimeout(() => window.close(), 1500);
  } else {
    body.className = "err";
    message.textContent = "Clip failed";
    detail.textContent = res?.error || "Unknown error";
  }
});
