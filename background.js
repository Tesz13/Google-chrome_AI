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
    }
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
  if (request.type === 'pii_detected') {
    console.log(`PII detected:`, request.count);
    
    // Update badge with count
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
  }
  return true;
});

console.log('Background service worker initialized');