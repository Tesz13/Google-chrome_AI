// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const CONSTANTS = {
  REFRESH_INTERVAL: 5000,
  STATUS_UPDATE_DELAY: 500,
  RESCAN_DELAY: 1000,
  ERROR_DISPLAY_DURATION: 5000,
  
  RESTRICTED_URL_PREFIXES: [
    'chrome://',
    'chrome-extension://',
    'edge://',
    'about:'
  ],
  
  DEFAULT_FILTERS: {
    email: true,
    phone: true,
    ssn: true,
    credit_card: true,
    address: true,
    password: true,
    api_key: true
  },
  
  PII_ICONS: {
    email: '@',
    phone: '#',
    ssn: 'ID',
    credit_card: '$',
    address: 'PIN',
    password: '***',
    api_key: 'KEY'
  },
  
  IMAGE_ICONS: {
    violence: '⚔️',
    nudity: '🚫',
    sexual: '🔞',
    disturbing: '⚠️',
    age_restricted: '🔞',
    inappropriate_ads: '📢'
  },
  
  SCORE_THRESHOLDS: {
    SAFE: { min: 80, bgColor: '#475569', color: '#94a3b8', textColor: '#e2e8f0', label: 'SAFE' },
    MODERATE: { min: 50, bgColor: '#334155', color: '#94a3b8', textColor: '#cbd5e1', label: 'MODERATE' },
    HIGH_RISK: { min: 0, bgColor: '#1e293b', color: '#fca5a5', textColor: '#D4DF9E', label: 'HIGH RISK' }
  }
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let refreshInterval = null;
const elementCache = new Map();

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function getElement(id) {
  if (!elementCache.has(id)) {
    elementCache.set(id, document.getElementById(id));
  }
  return elementCache.get(id);
}

function toggleClass(element, className, condition) {
  if (!element) return;
  element.classList.toggle(className, condition);
}

function isRestrictedUrl(url) {
  return url && CONSTANTS.RESTRICTED_URL_PREFIXES.some(prefix => url.startsWith(prefix));
}

async function getActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.id ? tab : null;
  } catch (error) {
    console.error('Error getting active tab:', error);
    return null;
  }
}

async function sendMessageToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    console.debug('Content script not available:', error.message);
    return null;
  }
}

function getScoreConfig(score) {
  if (score >= CONSTANTS.SCORE_THRESHOLDS.SAFE.min) {
    return CONSTANTS.SCORE_THRESHOLDS.SAFE;
  } else if (score >= CONSTANTS.SCORE_THRESHOLDS.MODERATE.min) {
    return CONSTANTS.SCORE_THRESHOLDS.MODERATE;
  }
  return CONSTANTS.SCORE_THRESHOLDS.HIGH_RISK;
}

function pluralize(count, singular, plural) {
  return count === 1 ? singular : plural;
}

function sanitizeHtml(html) {
  const div = document.createElement('div');
  div.textContent = html;
  return div.innerHTML;
}

// ============================================================================
// STORAGE OPERATIONS
// ============================================================================

async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get(['enabled', 'filters', 'imageModeration']);
    
    const mainToggle = getElement('main-toggle');
    const enabled = result.enabled !== false;
    toggleClass(mainToggle, 'active', enabled);
    
    const filters = result.filters || CONSTANTS.DEFAULT_FILTERS;
    document.querySelectorAll('.filter-toggle').forEach(toggle => {
      const type = toggle.dataset.type;
      if (type && Object.prototype.hasOwnProperty.call(filters, type)) {
        toggleClass(toggle, 'active', filters[type]);
      }
    });
  } catch (error) {
    console.error('Error loading settings:', error);
    showError('Failed to load settings');
  }
}

async function saveSettings(settings) {
  try {
    await chrome.storage.sync.set(settings);
  } catch (error) {
    console.error('Error saving settings:', error);
    throw error;
  }
}

// ============================================================================
// UI UPDATE FUNCTIONS
// ============================================================================

function updateStatusDisplay(text, className) {
  const statusElement = getElement('status');
  if (statusElement) {
    statusElement.textContent = text;
    statusElement.className = `status ${className}`;
  }
}

function updateStatusFromResponse(response) {
  if (!response) {
    updateStatusDisplay('UNAVAILABLE', 'disabled');
    updatePIICount(0);
    updateScores(100, 100, {}, {});
    return;
  }
  
  updatePIICount(response.maskedCount || 0);
  updateScores(
    response.privacyScore || 100,
    response.safetyScore || 100,
    response.piiCounts || {},
    response.imageSafetyIssues || {}
  );
  updateTrackingInfo(response.trackingInfo);
  
  if (response.initialized && response.enabled) {
    updateStatusDisplay('ACTIVE', 'active');
  } else if (response.initialized && !response.enabled) {
    updateStatusDisplay('DISABLED', 'disabled');
  } else {
    updateStatusDisplay('LOADING', 'initializing');
  }
}

async function updateStatus() {
  try {
    const tab = await getActiveTab();
    
    if (!tab) {
      showError('No active tab found');
      return;
    }
    
    if (isRestrictedUrl(tab.url)) {
      updateStatusDisplay('RESTRICTED', 'disabled');
      updatePIICount(0);
      updateScores(100, 100, {}, {});
      return;
    }
    
    const response = await sendMessageToTab(tab.id, { type: 'get_status' });
    updateStatusFromResponse(response);
    
  } catch (error) {
    console.error('Error updating status:', error);
  }
}

function updatePIICount(count) {
  const countElement = getElement('pii-count');
  if (!countElement) return;
  
  const threatText = pluralize(count, '1 threat detected', `${count} threats detected`);
  countElement.textContent = count === 0 ? 'No threats detected' : threatText;
}

function updateScores(privacyScore, safetyScore, piiCounts, imageSafetyIssues) {
  // Update privacy score
  updatePrivacyScore(privacyScore, piiCounts);
  
  // Update safety score
  updateSafetyScore(safetyScore, imageSafetyIssues);
  
  // Update mini cards
  const privacyMini = getElement('privacy-score-mini');
  const privacyStatusMini = getElement('privacy-status-mini');
  const safetyMini = getElement('safety-score-mini');
  const safetyStatusMini = getElement('safety-status-mini');
  
  if (privacyMini) privacyMini.textContent = privacyScore;
  if (safetyMini) safetyMini.textContent = safetyScore;
  
  const privacyConfig = getScoreConfig(privacyScore);
  const safetyConfig = getScoreConfig(safetyScore);
  
  if (privacyStatusMini) {
    privacyStatusMini.textContent = privacyConfig.label;
    privacyStatusMini.style.color = privacyConfig.color;
  }
  if (safetyStatusMini) {
    safetyStatusMini.textContent = safetyConfig.label;
    safetyStatusMini.style.color = safetyConfig.color;
  }
}

function updatePrivacyScore(score, piiCounts) {
  const scoreCircle = getElement('score-circle');
  const scoreLabel = getElement('score-label');
  
  if (!scoreCircle || !scoreLabel) return;
  
  const numberElement = scoreCircle.querySelector('.score-number');
  if (numberElement) {
    numberElement.textContent = score;
  }
  
  const config = getScoreConfig(score);
  scoreCircle.style.background = `linear-gradient(135deg, ${config.bgColor} 0%, #475569 100%)`;
  
  const maxElement = scoreCircle.querySelector('.score-max');
  if (numberElement) numberElement.style.color = config.textColor;
  if (maxElement) maxElement.style.color = '#94a3b8';
  
  scoreLabel.style.color = config.color;
  scoreLabel.textContent = config.label;
  
  updatePIIPills(piiCounts);
}

function updateSafetyScore(score, imageSafetyIssues) {
  updateImagePills(imageSafetyIssues);
}

function updatePIIPills(piiCounts) {
  const piiPills = getElement('pii-pills');
  if (!piiPills || !piiCounts) return;
  
  const counts = Object.entries(piiCounts).filter(([, count]) => count > 0);
  
  if (counts.length === 0) {
    piiPills.style.display = 'none';
    return;
  }
  
  piiPills.style.display = 'flex';
  piiPills.innerHTML = counts
    .map(([type, count]) => createPIIPill(type, count))
    .join('');
}

function createPIIPill(type, count) {
  const icon = CONSTANTS.PII_ICONS[type] || '•';
  const label = type.replace(/_/g, ' ');
  
  return `
    <div class="pii-pill">
      <span style="font-weight: 700; color: #3b82f6;">${sanitizeHtml(icon)}</span>
      <span class="pii-pill-count">${sanitizeHtml(String(count))}</span>
      <span>${sanitizeHtml(label)}</span>
    </div>
  `;
}

function updateImagePills(imageSafetyIssues) {
  const imagePills = getElement('image-pills');
  const imageSection = getElement('image-safety-section');
  
  if (!imagePills || !imageSection) return;
  
  const counts = Object.entries(imageSafetyIssues || {}).filter(([, count]) => count > 0);
  
  if (counts.length === 0) {
    imageSection.style.display = 'none';
    return;
  }
  
  imageSection.style.display = 'block';
  imagePills.innerHTML = counts
    .map(([type, count]) => createImagePill(type, count))
    .join('');
}

function createImagePill(type, count) {
  const icon = CONSTANTS.IMAGE_ICONS[type] || '⚠️';
  const label = type.replace(/_/g, ' ');
  
  return `
    <div class="image-pill">
      <span style="font-weight: 700;">${sanitizeHtml(icon)}</span>
      <span class="image-pill-count">${sanitizeHtml(String(count))}</span>
      <span>${sanitizeHtml(label)}</span>
    </div>
  `;
}

function updateTrackingInfo(trackingInfo) {
  const trackingSection = getElement('tracking-section');
  const trackingInfoEl = getElement('tracking-info');
  
  if (!trackingSection || !trackingInfoEl) return;
  
  if (!trackingInfo || !trackingInfo.tracking_detected) {
    trackingSection.style.display = 'none';
    return;
  }
  
  trackingSection.style.display = 'block';
  
  let html = '';
  if (trackingInfo.summary) {
    html += `<div class="tracking-summary">${sanitizeHtml(trackingInfo.summary)}</div>`;
  }
  
  if (trackingInfo.data_collected && trackingInfo.data_collected.length > 0) {
    html += '<div style="margin-top: 12px; font-size: 12px; color: #cbd5e1;">';
    html += '<div style="font-weight: 700; margin-bottom: 6px;">Collecting:</div>';
    trackingInfo.data_collected.forEach(item => {
      html += `<div style="padding: 4px 0; color: #94a3b8;">📍 ${sanitizeHtml(item)}</div>`;
    });
    html += '</div>';
  }
  
  trackingInfoEl.innerHTML = html || '<div class="no-tracking">No tracking detected</div>';
}

function showError(message) {
  const errorElement = getElement('error-message');
  if (!errorElement) return;
  
  errorElement.textContent = message;
  errorElement.style.display = 'block';
  
  setTimeout(() => {
    errorElement.style.display = 'none';
  }, CONSTANTS.ERROR_DISPLAY_DURATION);
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

async function handleMainToggle(toggle) {
  const newState = !toggle.classList.contains('active');
  toggleClass(toggle, 'active', newState);
  
  try {
    await saveSettings({ enabled: newState });
    
    const tab = await getActiveTab();
    if (tab) {
      await sendMessageToTab(tab.id, {
        type: 'toggle',
        enabled: newState
      });
      
      setTimeout(updateStatus, CONSTANTS.STATUS_UPDATE_DELAY);
    }
  } catch (error) {
    console.error('Error toggling extension:', error);
    toggleClass(toggle, 'active', !newState);
    showError('Failed to toggle extension');
  }
}

async function handleFilterToggle(toggle) {
  const type = toggle.dataset.type;
  if (!type) return;
  
  const newState = !toggle.classList.contains('active');
  toggleClass(toggle, 'active', newState);
  
  try {
    const result = await chrome.storage.sync.get(['filters']);
    const filters = result.filters || {};
    filters[type] = newState;
    
    await saveSettings({ filters });
    
    const tab = await getActiveTab();
    if (tab) {
      await sendMessageToTab(tab.id, {
        type: 'filter_change',
        piiType: type,
        enabled: newState
      });
      
      await sendMessageToTab(tab.id, { type: 'rescan' });
    }
  } catch (error) {
    console.error('Error updating filter:', error);
    toggleClass(toggle, 'active', !newState);
    showError('Failed to update filter');
  }
}

async function handleRescan(button) {
  const originalHTML = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<span>⏳</span><span>Scanning...</span>';
  
  try {
    const tab = await getActiveTab();
    if (tab) {
      await sendMessageToTab(tab.id, { type: 'rescan' });
      
      setTimeout(async () => {
        await updateStatus();
        button.disabled = false;
        button.innerHTML = originalHTML;
      }, CONSTANTS.RESCAN_DELAY);
    } else {
      button.disabled = false;
      button.innerHTML = originalHTML;
    }
  } catch (error) {
    console.error('Error rescanning:', error);
    button.disabled = false;
    button.innerHTML = originalHTML;
    showError('Failed to rescan page');
  }
}

// ============================================================================
// EVENT LISTENER SETUP
// ============================================================================

function setupEventListeners() {
  const mainToggle = getElement('main-toggle');
  if (mainToggle) {
    mainToggle.addEventListener('click', () => handleMainToggle(mainToggle));
  }
  
  document.querySelectorAll('.filter-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => handleFilterToggle(toggle));
  });
  
  const rescanButton = getElement('rescan-btn');
  if (rescanButton) {
    rescanButton.addEventListener('click', () => handleRescan(rescanButton));
  }
  
  const settingsButton = getElement('settings-btn');
  if (settingsButton) {
    settingsButton.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }
  
  const refreshButton = getElement('refresh-status-btn');
  if (refreshButton) {
    refreshButton.addEventListener('click', (e) => {
      e.preventDefault();
      updateStatus();
    });
  }
}

function handleMessage(request, sender, sendResponse) {
  if (request.type === 'pii_count') {
    updatePIICount(request.count);
    if (request.privacyScore !== undefined) {
      updateScores(
        request.privacyScore,
        request.safetyScore || 100,
        request.piiCounts || {},
        request.imageSafetyIssues || {}
      );
    }
  } else if (request.type === 'status_update') {
    updateStatus();
  }
  
  sendResponse({ received: true });
}

// ============================================================================
// LIFECYCLE MANAGEMENT
// ============================================================================

function startRefreshInterval() {
  stopRefreshInterval();
  refreshInterval = setInterval(updateStatus, CONSTANTS.REFRESH_INTERVAL);
}

function stopRefreshInterval() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

async function initializePopup() {
  try {
    await loadSettings();
    await updateStatus();
    setupEventListeners();
    startRefreshInterval();
  } catch (error) {
    console.error('Error initializing popup:', error);
    showError('Failed to initialize extension');
  }
}

function cleanup() {
  stopRefreshInterval();
  elementCache.clear();
}

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', initializePopup);
window.addEventListener('unload', cleanup);
chrome.runtime.onMessage.addListener(handleMessage);