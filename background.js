// ========== Background Service Worker ==========
// Handles extension icon badge and messaging

let extensionEnabled = true;
let currentTabStats = {
  piiCount: 0,
  privacyScore: 100,
  safetyScore: 100,
  piiCounts: {},
  imageSafetyIssues: {},
  trackingInfo: null
};

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('🛡️ ScreenGuard installed');
  
  // Set default settings
  chrome.storage.sync.set({
    enabled: true,
    imageModeration: true,
    filters: {
      email: true,
      phone: true,
      ssn: true,
      credit_card: true,
      address: true,
      password: true,
      api_key: true
    }
  });
  
  // Set initial badge
  updateBadge(0, 100, 100);
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'pii_detected') {
    currentTabStats = {
      piiCount: request.count || 0,
      privacyScore: request.privacyScore || 100,
      safetyScore: request.safetyScore || 100,
      piiCounts: request.piiCounts || {},
      imageSafetyIssues: request.imageSafetyIssues || {},
      trackingInfo: request.trackingInfo || null
    };
    
    updateBadge(
      currentTabStats.piiCount,
      currentTabStats.privacyScore,
      currentTabStats.safetyScore
    );
    
    sendResponse({ success: true });
  }
  return true;
});

// Update badge with count and color based on scores
function updateBadge(count, privacyScore, safetyScore) {
  const totalIssues = count + getTotalImageIssues();
  const averageScore = Math.round((privacyScore + safetyScore) / 2);
  
  // Set badge text
  if (totalIssues > 0) {
    chrome.action.setBadgeText({ text: totalIssues.toString() });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
  
  // Set badge color based on average score
  let badgeColor;
  if (averageScore >= 80) {
    badgeColor = '#2c5aa0'; // Blue - Safe
  } else if (averageScore >= 50) {
    badgeColor = '#ff8800'; // Orange - Moderate
  } else {
    badgeColor = '#cc0000'; // Red - High Risk
  }
  
  chrome.action.setBadgeBackgroundColor({ color: badgeColor });
}

function getTotalImageIssues() {
  if (!currentTabStats.imageSafetyIssues) return 0;
  return Object.values(currentTabStats.imageSafetyIssues).reduce((sum, count) => sum + count, 0);
}

// Handle tab changes
chrome.tabs.onActivated.addListener((activeInfo) => {
  // Reset stats when switching tabs
  currentTabStats = {
    piiCount: 0,
    privacyScore: 100,
    safetyScore: 100,
    piiCounts: {},
    imageSafetyIssues: {},
    trackingInfo: null
  };
  updateBadge(0, 100, 100);
  
  // Query the new active tab for its stats
  chrome.tabs.sendMessage(activeInfo.tabId, { type: 'get_status' }, (response) => {
    if (response && response.maskedCount !== undefined) {
      currentTabStats = {
        piiCount: response.maskedCount,
        privacyScore: response.privacyScore || 100,
        safetyScore: response.safetyScore || 100,
        piiCounts: response.piiCounts || {},
        imageSafetyIssues: response.imageSafetyIssues || {},
        trackingInfo: response.trackingInfo || null
      };
      updateBadge(
        currentTabStats.piiCount,
        currentTabStats.privacyScore,
        currentTabStats.safetyScore
      );
    }
  });
});

// Handle tab updates (page navigation)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    // Reset badge when page loads
    updateBadge(0, 100, 100);
  }
});

// Export stats for popup
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'popup') {
    port.onMessage.addListener((msg) => {
      if (msg.type === 'get_stats') {
        port.postMessage({
          type: 'stats',
          data: currentTabStats
        });
      }
    });
  }
});

console.log('✅ ScreenGuard background service worker loaded');