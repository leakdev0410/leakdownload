// leakdownload Catcher — Chrome Extension Background Service Worker

const APP_PORT = 19876;
const BASE_URL = `http://127.0.0.1:${APP_PORT}`;

const sentUrls = new Set();
function markSent(url) {
  sentUrls.add(url);
  setTimeout(() => sentUrls.delete(url), 60000);
}

async function pingApp() {
  try { const r = await fetch(`${BASE_URL}/ping`); return r.ok; } catch { return false; }
}

async function sendToApp(url, filename) {
  try {
    const resp = await fetch(`${BASE_URL}/catch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, filename: filename || "" }),
    });
    return resp.ok;
  } catch { return false; }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "ping") { pingApp().then(ok => sendResponse({ ok })); return true; }
});

chrome.downloads.onCreated.addListener(async (item) => {
  if (!item.url || !item.url.startsWith("http")) return;

  // Only intercept if app is actually running
  const appAlive = await pingApp();
  if (!appAlive) return;

  // Dedup (in-memory Set)
  if (sentUrls.has(item.url)) return;
  markSent(item.url);

  const sent = await sendToApp(item.url, item.filename || "");
  if (sent) {
    try { await chrome.downloads.cancel(item.id); } catch (_) {}
    setTimeout(() => chrome.downloads.erase({ id: item.id }).catch(() => {}), 500);
  }
});

console.log("leakdownload Catcher v3 — port", APP_PORT);
