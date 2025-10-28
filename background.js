// ---- existing code ----
console.log('Background service worker loaded');

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Extension installed/updated:', details.reason);
  
  const defaultSettings = {
    enabled: true,
    filters: {
      email: true,
      phone: true,
      ssn: true,
      credit_card: true,
      address: true,
      password: true,
      api_key: true
    },
    // NEW: image moderation & lens defaults (safe additions)
    imageModeration: true,
    lensModeEnabled: false
  };
  
  await chrome.storage.sync.set(defaultSettings);
  console.log('Default settings initialized');
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-masking') {
    const result = await chrome.storage.sync.get(['enabled']);
    const newState = !(result.enabled !== false);
    
    await chrome.storage.sync.set({ enabled: newState });
    
    // Send message to all tabs
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'toggle',
          enabled: newState
        });
      } catch (error) {
        console.log(`Could not send message to tab ${tab.id}`);
      }
    }
    
    console.log('Masking toggled:', newState);
  }
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Existing: PII count -> badge
  if (request.type === 'pii_detected') {
    console.log(`PII detected:`, request.count);
    
    if (sender.tab?.id) {
      chrome.action.setBadgeText({
        tabId: sender.tab.id,
        text: request.count > 0 ? String(request.count) : ''
      });
      chrome.action.setBadgeBackgroundColor({
        tabId: sender.tab.id,
        color: '#4CAF50'
      });
    }
    sendResponse({ received: true });
    return true;
  }

  // ---------- NEW: Privacy Score badge (optional) ----------
  if (request.type === 'set_privacy_score' && sender.tab?.id) {
    const score = Number(request.score ?? 100);
    chrome.action.setBadgeText({
      tabId: sender.tab.id,
      text: isFinite(score) && score < 100 ? String(Math.max(0, Math.round(score))) : ''
    });
    chrome.action.setBadgeBackgroundColor({
      tabId: sender.tab.id,
      color: score >= 80 ? '#22c55e' : score >= 50 ? '#eab308' : '#ef4444'
    });
    sendResponse({ ok: true });
    return true;
  }

  // ---------- NEW: Capture visible tab (for Lens Mode / screenshot AI) ----------
  // Requires "tabCapture" permission in manifest.
  if (request.type === 'CAPTURE_VISIBLE') {
    (async () => {
      try {
        const windowId = sender.tab?.windowId ?? (await chrome.windows.getCurrent()).id;
        const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
        sendResponse({ ok: true, dataUrl });
      } catch (err) {
        console.warn('CAPTURE_VISIBLE failed', err);
        sendResponse({ ok: false, error: String(err) });
      }
    })();
    return true; // keep the message channel open for async sendResponse
  }

  // ---------- NEW: Settings passthroughs (nice for content/popup) ----------
  if (request.type === 'get_settings') {
    chrome.storage.sync.get(null).then(v => sendResponse({ ok: true, settings: v }));
    return true;
  }
  if (request.type === 'set_settings' && request.settings && typeof request.settings === 'object') {
    chrome.storage.sync.set(request.settings).then(() => sendResponse({ ok: true }));
    return true;
  }

  return true;
});

console.log('Background service worker initialized');
