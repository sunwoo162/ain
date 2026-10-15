import { buildTraceEvents } from './evidence.mjs';

// Token is kept in extension session storage, not sent into ChatGPT pages.
const ALLOWED_SENDERS = new Set(['https://chatgpt.com', 'https://chat.openai.com']);
const COLLECTOR_URL = 'http://127.0.0.1:4318/v1/events';

chrome.runtime.onStartup.addListener(() => {
  // Session credentials may be lost when Chrome restarts; never silently capture.
  chrome.storage.local.set({ enabled: false }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'UISIM_CAPTURE_ANSWER') return false;
  (async () => {
    const url = new URL(sender.url || sender.tab?.url || '');
    if (!sender.tab || !ALLOWED_SENDERS.has(url.origin)) {
      return { ok: false, error: 'untrusted_sender' };
    }
    const [{ enabled }, { token }] = await Promise.all([
      chrome.storage.local.get({ enabled: false }),
      chrome.storage.session.get('token'),
    ]);
    if (!enabled || typeof token !== 'string' || token.length < 12) {
      return { ok: false, error: 'not_paired' };
    }
    const batch = buildTraceEvents(message.payload);
    const response = await fetch(COLLECTOR_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
    });
    if (!response.ok) return { ok: false, error: 'collector_http_' + response.status };
    await chrome.storage.local.set({ lastCapture: new Date().toISOString(), lastError: '' });
    return { ok: true };
  })().then(sendResponse).catch(() => {
    chrome.storage.local.set({ lastError: 'Collector connection failed.' }).catch(() => {});
    sendResponse({ ok: false, error: 'collector_unavailable' });
  });
  return true;
});
