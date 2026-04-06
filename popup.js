const body = document.body;
const message = document.getElementById("message");
const detail = document.getElementById("detail");

chrome.runtime.sendMessage({ type: "CLIP" }, (res) => {
  if (res?.ok) {
    body.className = "ok";
    message.textContent = "clipped to notchnotch";
    setTimeout(() => window.close(), 1200);
  } else {
    body.className = "err";
    message.textContent = "clip failed";
    detail.textContent = res?.error || "unknown error";
  }
});
