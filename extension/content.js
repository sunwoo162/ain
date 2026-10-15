// Capture only visible assistant answers after explicit opt-in.
// No prompt input, hidden chain of thought, cookies or internal network calls are read.
(() => {
  const SELECTOR = '[data-message-author-role="assistant"]';
  const seen = new WeakMap();
  const pending = new WeakMap();
  const timers = new Set();
  let active = false;
  let watcher = null;
  let lastUrl = location.href;
  let navigationPauseUntil = 0;

  function answerText(element) {
    const body = element.querySelector('.markdown') || element.querySelector('[data-testid="conversation-turn-content"]');
    return (body?.innerText || body?.textContent || '').trim().slice(0, 3000);
  }

  function visibleSources(element) {
    const candidates = element.querySelectorAll('a[href]');
    const sources = [];
    const unique = new Set();
    for (const link of candidates) {
      if (sources.length >= 16) break;
      try {
        const url = new URL(link.href);
        if (!['http:', 'https:'].includes(url.protocol)) continue;
        if (['chatgpt.com', 'chat.openai.com'].includes(url.hostname)) continue;
        if (!link.getClientRects().length) continue;
        const title = (link.innerText || link.getAttribute('aria-label') || url.hostname).trim().slice(0, 160);
        if (unique.has(link.href)) continue;
        unique.add(link.href);
        sources.push({ title, url: link.href });
      } catch { /* Unsupported URL */ }
    }
    return sources;
  }

  function markExisting() {
    for (const element of document.querySelectorAll(SELECTOR)) {
      const answer = answerText(element);
      seen.set(element, answer);
    }
  }

  function schedule(element) {
    if (!active || pending.has(element)) return;
    const timer = setTimeout(() => {
      pending.delete(element);
      timers.delete(timer);
      if (!active || Date.now() < navigationPauseUntil ||
          document.querySelector('[data-testid="stop-button"]')) return;
      const answer = answerText(element);
      if (!answer || answer === seen.get(element)) return;
      seen.set(element, answer);
      chrome.runtime.sendMessage({
        type: 'UISIM_CAPTURE_ANSWER',
        payload: { answer, sources: visibleSources(element) },
      }).catch(() => {});
    }, 3000);
    pending.set(element, timer);
    timers.add(timer);
  }

  function scan() {
    if (!active) return;
    // Do not backfill a previous conversation when the SPA navigates.
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      navigationPauseUntil = Date.now() + 3000;
      markExisting();
      return;
    }
    for (const element of document.querySelectorAll(SELECTOR)) {
      const answer = answerText(element);
      if (!seen.has(element)) {
        seen.set(element, '');
        schedule(element);
      } else if (answer && answer !== seen.get(element)) schedule(element);
    }
  }

  function stop() {
    active = false;
    watcher?.disconnect();
    watcher = null;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  }
  function start() {
    if (active) return;
    active = true;
    lastUrl = location.href;
    markExisting(); // Never upload historical messages simply by enabling capture.
    watcher = new MutationObserver(scan);
    watcher.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  }

  chrome.storage.local.get({ enabled: false }).then(({ enabled }) => {
    if (enabled) start();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.enabled) {
      if (changes.enabled.newValue) start();
      else stop();
    }
  });
})();
