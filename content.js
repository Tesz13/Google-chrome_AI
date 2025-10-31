// ========== PII Detector Class ==========
class PiiDetector {
  constructor() {
    this.session = null;
    this.useRegexFallback = false;
    this.isInitialized = false;
    this.piiTypes = ['email', 'phone', 'ssn', 'credit_card', 'address', 'password', 'api_key'];
    this.pollInterval = null;
    this.userActivityListeners = [];
    this.initAttemptCount = 0;
    this.maxInitAttempts = 100; // Stop after 100 attempts (about 5 minutes at 3s intervals)
  }

  async tryInit() {
    try {
      // Check if already successfully initialized
      if (this.session && !this.useRegexFallback) {
        return true;
      }

      // Check user activation
      const hasUserActivation = navigator.userActivation?.isActive || false;

      if (hasUserActivation) {
        const capabilities = await LanguageModel.availability();
        console.log(capabilities === "available") 
        if (capabilities === "available") {
          const session = await LanguageModel.create({
            initialPrompts: [{
              role: "system",
              content: `how many r in strawberry?`
            }]
          });
          
          this.session = session;
          console.log("✅ AI Language Model initialized (text)");
          this.useRegexFallback = false;
          this.isInitialized = true;
          const result = await session.prompt('Write me a poem!');
          console.log('result----------');
          console.log(result);
          this.stopPolling();
          return true;
        } else {
          console.warn("AI model not available. Will keep polling...");
          return false;
        }
      } else {
        // User activation not available yet
        return false;
      }
    } catch (error) {
      console.error("Failed to initialize AI (will retry):", error);
      return false;
    }
  }

  async init() {
    // Mark as initialized to prevent blocking, but keep it as fallback mode
    this.isInitialized = true;
    this.useRegexFallback = true;

    // Try immediate initialization
    const success = await this.tryInit();
    if (success) {
      return;
    }

    console.warn("User activation not detected. Starting background polling...");
    
    // Set up polling every 3 seconds
    this.startPolling();
    
    // Also listen for user activity events
    this.startUserActivityListeners();
  }

  startPolling() {
    if (this.pollInterval) return;
    
    this.pollInterval = setInterval(async () => {
      this.initAttemptCount++;
      
      // Stop polling if we've tried too many times
      if (this.initAttemptCount >= this.maxInitAttempts) {
        console.warn("Max initialization attempts reached. Staying in regex fallback mode.");
        this.stopPolling();
        return;
      }

      const success = await this.tryInit();
      if (success) {
        console.log("✅ Successfully initialized AI after background polling");
        this.stopPolling();
      }
    }, 3000); // Poll every 3 seconds
  }

  startUserActivityListeners() {
    // Listen for user interactions to retry immediately
    const events = ['mousedown', 'mouseup', 'click', 'keydown', 'touchstart', 'scroll'];
    const handler = async () => {
      // Debounce: only check every 500ms
      if (this.activityCheckTimeout) return;
      this.activityCheckTimeout = setTimeout(async () => {
        this.activityCheckTimeout = null;
        if (!this.session || this.useRegexFallback) {
          const success = await this.tryInit();
          if (success) {
            this.stopPolling();
          }
        }
      }, 500);
    };

    events.forEach(event => {
      document.addEventListener(event, handler, { passive: true, capture: true });
      this.userActivityListeners.push({ event, handler });
    });
  }

  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    // Remove user activity listeners
    this.userActivityListeners.forEach(({ event, handler }) => {
      document.removeEventListener(event, handler, { capture: true });
    });
    this.userActivityListeners = [];

    if (this.activityCheckTimeout) {
      clearTimeout(this.activityCheckTimeout);
      this.activityCheckTimeout = null;
    }
  }

  async detectPII(text) {
    if (!this.isInitialized) {
      await this.init();
    }

    if (!text || text.trim().length < 5) {
      return [];
    }

    if (this.useRegexFallback || !this.session) {
      return this.regexFallback(text);
    }

    try {
      const prompt = `Analyze this text for PII:\n\n"${text.substring(0, 1000)}"`;
      const response = await this.session.prompt(prompt);
      
      let cleanedResponse = response.trim();
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }
      if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/```\n?/g, '');
      }
      
      const result = JSON.parse(cleanedResponse);
      
      if (result && Array.isArray(result.pii_found)) {
        return result.pii_found.filter(item => 
          item && item.type && item.value
        );
      } else {
        return this.regexFallback(text);
      }
    } catch (error) {
      console.error("PII detection error:", error);
      return this.regexFallback(text);
    }
  }

  regexFallback(text) {
    const patterns = {
      email: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
      phone: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
      ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
      credit_card: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
      api_key: /\b[A-Za-z0-9]{32,}\b/g
    };

    const found = [];
    
    for (const [type, regex] of Object.entries(patterns)) {
      const matches = text.matchAll(regex);
      for (const match of matches) {
        found.push({ 
          type, 
          value: match[0],
          start: match.index,
          end: match.index + match[0].length,
          context: 'detected by regex'
        });
      }
    }
    
    return found;
  }

  destroy() {
    this.stopPolling();
    if (this.session) {
      try {
        this.session.destroy();
      } catch (error) {
        console.error("Error destroying session:", error);
      }
      this.session = null;
    }
  }
}

// ========== Data Tracking Analyzer ==========
class DataTrackingAnalyzer {
  constructor() {
    this.session = null;
    this.isInitialized = false;
    this.trackedData = new Set();
  }

  async init() {
    try {
      if (typeof window.ai === 'undefined' || !window.ai.languageModel) {
        console.warn("AI not available for tracking analysis");
        return;
      }

      const capabilities = await window.ai.languageModel.capabilities();
      
      if (capabilities.available === "readily" || capabilities.available === "after-download") {
        this.session = await window.ai.languageModel.create({
          initialPrompts: [{
            role: "system",
            content: `You are a privacy analyst. Analyze web page content to identify what user data is being collected or sold.

CRITICAL: Respond with ONLY valid JSON. No explanations.

Format: {
  "tracking_detected": true/false,
  "data_collected": ["browsing history", "location", "personal info", "behavior patterns"],
  "tracking_methods": ["cookies", "pixels", "fingerprinting", "third-party scripts"],
  "privacy_concerns": ["high"/"medium"/"low"],
  "data_sharing": ["advertisers", "analytics", "third parties"],
  "summary": "brief description"
}

Analyze for:
- Privacy policies and terms of service
- Tracking scripts and pixels
- Data collection forms
- Third-party integrations
- Cookie notices
- Analytics and advertising code`
          }]
        });
        
        console.log("✅ Data Tracking Analyzer initialized");
        this.isInitialized = true;
      }
    } catch (error) {
      console.error("Failed to initialize tracking analyzer:", error);
    }
  }

  async analyzePageTracking() {
    if (!this.session || !this.isInitialized) return null;

    try {
      // Analyze privacy policy, terms, scripts
      const pageText = document.body.innerText.substring(0, 3000);
      const scripts = Array.from(document.querySelectorAll('script[src]'))
        .map(s => s.src)
        .join(', ');
      
      const prompt = `Analyze this page for data tracking and collection:

Page content: ${pageText}

External scripts: ${scripts}

Identify what user data is being collected and how it's being used.`;

      const response = await this.session.prompt(prompt);
      let cleaned = response.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/```\n?/g, '');
      }
      
      return JSON.parse(cleaned);
    } catch (error) {
      console.error("Tracking analysis error:", error);
      return null;
    }
  }

  destroy() {
    if (this.session) {
      try {
        this.session.destroy();
      } catch (error) {
        console.error("Error destroying tracking analyzer:", error);
      }
      this.session = null;
    }
  }
}

// ========== Main Extension Logic ==========
let detector;
let trackingAnalyzer;
let isEnabled = true;
let processedNodes = new WeakSet();
let maskedElements = new Map();
let observer = null;
let isInitialized = false;
let enabledFilters = {
  email: true,
  phone: true,
  ssn: true,
  credit_card: true,
  address: true,
  password: true,
  api_key: true
};

// Image moderation state
let imageModerationEnabled = true;
let imageAiSession = null;
const imageVerdictCache = new Map();

// Safety tracking
let safetyScore = 100;
let privacyScore = 100;
let piiCounts = {
  email: 0,
  phone: 0,
  ssn: 0,
  credit_card: 0,
  address: 0,
  password: 0,
  api_key: 0
};

let imageSafetyIssues = {
  violence: 0,
  nudity: 0,
  sexual: 0,
  disturbing: 0,
  age_restricted: 0,
  inappropriate_ads: 0
};

let trackingInfo = null;

console.log('🛡️ ScreenGuard content script loading...');

// Initialize detector
async function initDetector() {
  try {
    detector = new PiiDetector();
    await detector.init();
    
    trackingAnalyzer = new DataTrackingAnalyzer();
    await trackingAnalyzer.init();
    
    isInitialized = true;
    console.log('✅ All detectors initialized');
    
    // Start scanning after initialization
    await scanPage();
    startObserver();
  } catch (error) {
    console.error('❌ Failed to initialize detector:', error);
  }
}

// Scan entire page for PII, images, and tracking
async function scanPage() {
  if (!isEnabled || !isInitialized) return;
  
  console.log('🔍 Scanning page for PII, unsafe images, and tracking...');
  
  // Clear existing masks and reset counts
  clearAllMasks();
  resetScores();
  
  // -- TEXT SCAN --
  const textNodes = getTextNodes(document.body);
  let totalFound = 0;
  
  for (const node of textNodes) {
    if (processedNodes.has(node)) continue;
    
    const text = node.textContent;
    if (!text || text.trim().length < 5) continue;
    
    const piiItems = await detector.detectPII(text);
    if (piiItems.length > 0) {
      const filteredItems = piiItems.filter(item => enabledFilters[item.type]);
      if (filteredItems.length > 0) {
        maskTextNode(node, filteredItems);
        totalFound += filteredItems.length;
        filteredItems.forEach(item => {
          if (piiCounts.hasOwnProperty(item.type)) {
            piiCounts[item.type]++;
          }
        });
      }
    }
    processedNodes.add(node);
  }

  // -- IMAGE SCAN --
  await scanImages(document);

  // -- TRACKING ANALYSIS --
  if (trackingAnalyzer && trackingAnalyzer.isInitialized) {
    trackingInfo = await trackingAnalyzer.analyzePageTracking();
    console.log('📊 Tracking analysis:', trackingInfo);
  }

  console.log(`✅ Found ${totalFound} text PII items, ${getTotalImageIssues()} image issues`);
  
  // Calculate and update scores
  calculatePrivacyScore();
  calculateSafetyScore();
  updateDashboard();
  updateBadge(totalFound);
}

function getTotalImageIssues() {
  return Object.values(imageSafetyIssues).reduce((sum, count) => sum + count, 0);
}

// Get all text nodes in a container
function getTextNodes(element) {
  const textNodes = [];
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        
        const tagName = parent.tagName.toLowerCase();
        if (['script', 'style', 'noscript', 'iframe'].includes(tagName)) {
          return NodeFilter.FILTER_REJECT;
        }
        if (parent.classList.contains('screenguard-overlay')) {
          return NodeFilter.FILTER_REJECT;
        }
        if (node.textContent.trim().length < 5) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );
  
  let node;
  while (node = walker.nextNode()) {
    textNodes.push(node);
  }
  return textNodes;
}

// Mask PII in a text node
function maskTextNode(textNode, piiItems) {
  const text = textNode.textContent;
  const parent = textNode.parentElement;
  if (!parent) return;
  
  for (const pii of piiItems) {
    try {
      const index = text.indexOf(pii.value);
      if (index === -1) continue;
      
      const range = document.createRange();
      range.setStart(textNode, index);
      range.setEnd(textNode, index + pii.value.length);
      
      const rects = range.getClientRects();
      for (const rect of rects) {
        if (rect.width === 0 || rect.height === 0) continue;
        const overlay = createOverlay(rect, pii.type, pii.context);
        document.body.appendChild(overlay);

        if (!maskedElements.has(textNode)) {
          maskedElements.set(textNode, []);
        }
        maskedElements.get(textNode).push(overlay);
      }
    } catch (error) {
      console.error('Error masking PII:', error);
    }
  }
}

// Create blur overlay element
function createOverlay(rect, piiType, context = '') {
  const overlay = document.createElement('div');
  overlay.className = 'screenguard-overlay';
  overlay.dataset.piiType = piiType;
  if (context) overlay.title = `${piiType}: ${context}`;

  overlay.style.position = 'fixed';
  overlay.style.left = rect.left + 'px';
  overlay.style.top = rect.top + 'px';
  overlay.style.width = rect.width + 'px';
  overlay.style.height = rect.height + 'px';
  overlay.style.zIndex = '999999';
  overlay.style.pointerEvents = 'none';

  return overlay;
}

// Clear all masks
function clearAllMasks() {
  maskedElements.forEach((overlays) => {
    overlays.forEach(overlay => {
      if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    });
  });
  maskedElements.clear();
  processedNodes = new WeakSet();
  
  const existingDashboard = document.getElementById('screenguard-dashboard');
  if (existingDashboard) existingDashboard.remove();
}

// Update overlay positions
function updateOverlayPositions() {
  maskedElements.forEach((overlays, node) => {
    if (node.nodeType === 1 && !document.contains(node)) {
      overlays.forEach(o => o?.parentNode?.removeChild(o));
      maskedElements.delete(node);
      return;
    }
    if (node.nodeType === 3 && !document.contains(node.parentElement)) {
      overlays.forEach(o => o?.parentNode?.removeChild(o));
      maskedElements.delete(node);
      return;
    }

    try {
      let rect;
      if (node.nodeType === 3) {
        const range = document.createRange();
        range.selectNodeContents(node);
        rect = range.getBoundingClientRect();
      } else {
        rect = node.getBoundingClientRect();
      }
      if (rect && rect.width > 0 && rect.height > 0) {
        overlays.forEach(overlay => {
          overlay.style.left = rect.left + 'px';
          overlay.style.top = rect.top + 'px';
          overlay.style.width = rect.width + 'px';
          overlay.style.height = rect.height + 'px';
        });
      }
    } catch {}
  });
}

// Start mutation observer
function startObserver() {
  if (observer) return;
  
  observer = new MutationObserver((mutations) => {
    let shouldRescan = false;
    
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.classList && node.classList.contains('screenguard-overlay')) continue;
          if (node.id === 'screenguard-dashboard') continue;
          shouldRescan = true;
          break;
        }
      }
      if (mutation.type === 'characterData') {
        shouldRescan = true;
      }
    }
    
    if (shouldRescan) {
      if (window.rescanTimeout) clearTimeout(window.rescanTimeout);
      window.rescanTimeout = setTimeout(() => {
        scanPage();
      }, 500);
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
  
  console.log('👀 MutationObserver started');
}

// Handle scroll and resize
let isScrolling = false;
window.addEventListener('scroll', () => {
  if (!isScrolling) {
    isScrolling = true;
    requestAnimationFrame(() => {
      updateOverlayPositions();
      isScrolling = false;
    });
  }
}, true);

window.addEventListener('resize', () => {
  requestAnimationFrame(updateOverlayPositions);
});

// Update badge count
function safeSendMessage(message) {
  try {
    if (chrome?.runtime?.sendMessage) {
      chrome.runtime.sendMessage(message);
    } else {
      console.warn('chrome.runtime.sendMessage not available', message);
    }
  } catch (e) {
    console.error('Error sending message:', e);
  }
}

// Then use it like this:
function updateBadge(count) {
  safeSendMessage({
    type: 'pii_detected',
    count: count,
    privacyScore: privacyScore,
    safetyScore: safetyScore,
    piiCounts: piiCounts,
    imageSafetyIssues: imageSafetyIssues,
    trackingInfo: trackingInfo
  });
}

 


// ========== SCORING SYSTEMS ==========

function resetScores() {
  privacyScore = 100;
  safetyScore = 100;
  piiCounts = {
    email: 0,
    phone: 0,
    ssn: 0,
    credit_card: 0,
    address: 0,
    password: 0,
    api_key: 0
  };
  imageSafetyIssues = {
    violence: 0,
    nudity: 0,
    sexual: 0,
    disturbing: 0,
    age_restricted: 0,
    inappropriate_ads: 0
  };
  trackingInfo = null;
}

function calculatePrivacyScore() {
  let score = 100;
  const weights = {
    password: 25,
    ssn: 20,
    credit_card: 20,
    api_key: 15,
    email: 10,
    phone: 8,
    address: 10
  };
  
  for (const [type, count] of Object.entries(piiCounts)) {
    if (count > 0 && weights[type]) {
      score -= weights[type];
      if (count > 1) {
        score -= Math.min((count - 1) * (weights[type] * 0.3), weights[type]);
      }
    }
  }
  
  // Factor in tracking
  if (trackingInfo) {
    if (trackingInfo.privacy_concerns === 'high') score -= 15;
    else if (trackingInfo.privacy_concerns === 'medium') score -= 8;
  }
  
  privacyScore = Math.max(0, Math.min(100, Math.round(score)));
  console.log(`🔒 Privacy Score: ${privacyScore}/100`);
  return privacyScore;
}

function calculateSafetyScore() {
  let score = 100;
  const weights = {
    violence: 20,
    nudity: 25,
    sexual: 25,
    disturbing: 15,
    age_restricted: 20,
    inappropriate_ads: 10
  };
  
  for (const [type, count] of Object.entries(imageSafetyIssues)) {
    if (count > 0 && weights[type]) {
      score -= weights[type];
      if (count > 1) {
        score -= Math.min((count - 1) * (weights[type] * 0.4), weights[type]);
      }
    }
  }
  
  safetyScore = Math.max(0, Math.min(100, Math.round(score)));
  console.log(`🛡️ Safety Score: ${safetyScore}/100`);
  return safetyScore;
}

function getScoreColor(score) {
  if (score >= 80) return { bg: '#2c5aa0', text: '#2c5aa0', label: 'SAFE' };
  if (score >= 50) return { bg: '#1e3a5f', text: '#1e3a5f', label: 'MODERATE' };
  return { bg: '#4A4B2F', text: '#4A4B2F', label: 'HIGH RISK' };
}

function updateDashboard() {
  if (!isEnabled) return;
  
  const existingDashboard = document.getElementById('screenguard-dashboard');
  if (existingDashboard) existingDashboard.remove();
  
  const dashboard = document.createElement('div');
  dashboard.id = 'screenguard-dashboard';
  dashboard.className = 'screenguard-dashboard';
  
  const privacyData = getScoreColor(privacyScore);
  const safetyData = getScoreColor(safetyScore);
  const totalPII = Object.values(piiCounts).reduce((sum, count) => sum + count, 0);
  const totalImageIssues = getTotalImageIssues();
  
  dashboard.innerHTML = `
    <div class="dashboard-header">
      <div class="dashboard-title">🛡️ ScreenGuard</div>
      <button class="dashboard-toggle" id="sg-toggle">▼</button>
    </div>
    <div class="dashboard-content" id="sg-content">
      <div class="score-row">
        <div class="score-card">
          <div class="score-label">Privacy</div>
          <div class="score-value" style="color: ${privacyData.text}">${privacyScore}</div>
          <div class="score-status">${privacyData.label}</div>
          <div class="score-detail">${totalPII} PII items</div>
        </div>
        <div class="score-card">
          <div class="score-label">Safety</div>
          <div class="score-value" style="color: ${safetyData.text}">${safetyScore}</div>
          <div class="score-status">${safetyData.label}</div>
          <div class="score-detail">${totalImageIssues} image issues</div>
        </div>
      </div>
      
      ${totalPII > 0 ? `
      <div class="detail-section">
        <div class="section-title">📊 Data Exposure</div>
        <div class="detail-list">
          ${Object.entries(piiCounts).filter(([_, count]) => count > 0).map(([type, count]) => `
            <div class="detail-item">
              <span class="detail-icon">${getPiiIcon(type)}</span>
              <span class="detail-text">${count} ${type.replace('_', ' ')}</span>
            </div>
          `).join('')}
        </div>
      </div>` : ''}
      
      ${totalImageIssues > 0 ? `
      <div class="detail-section">
        <div class="section-title">⚠️ Content Warnings</div>
        <div class="detail-list">
          ${Object.entries(imageSafetyIssues).filter(([_, count]) => count > 0).map(([type, count]) => `
            <div class="detail-item">
              <span class="detail-icon">${getImageIcon(type)}</span>
              <span class="detail-text">${count} ${type.replace('_', ' ')}</span>
            </div>
          `).join('')}
        </div>
      </div>` : ''}
      
      ${trackingInfo && trackingInfo.tracking_detected ? `
      <div class="detail-section">
        <div class="section-title">🔍 Data Collection</div>
        <div class="tracking-summary">${trackingInfo.summary || 'This page collects user data'}</div>
        ${trackingInfo.data_collected && trackingInfo.data_collected.length > 0 ? `
        <div class="detail-list">
          ${trackingInfo.data_collected.map(item => `
            <div class="detail-item">
              <span class="detail-icon">📍</span>
              <span class="detail-text">${item}</span>
            </div>
          `).join('')}
        </div>` : ''}
      </div>` : ''}
      
      <div class="dashboard-actions">
        <button class="action-button" id="sg-rescan">🔄 Rescan</button>
        <button class="action-button" id="sg-details">📋 Full Report</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(dashboard);
  
  // Event listeners
  document.getElementById('sg-toggle')?.addEventListener('click', toggleDashboard);
  document.getElementById('sg-rescan')?.addEventListener('click', () => scanPage());
  document.getElementById('sg-details')?.addEventListener('click', showFullReport);
}

function getPiiIcon(type) {
  const icons = {
    email: '📧',
    phone: '📱',
    ssn: '🔢',
    credit_card: '💳',
    address: '📍',
    password: '🔑',
    api_key: '🔐'
  };
  return icons[type] || '•';
}

function getImageIcon(type) {
  const icons = {
    violence: '⚔️',
    nudity: '🚫',
    sexual: '🔞',
    disturbing: '⚠️',
    age_restricted: '🔞',
    inappropriate_ads: '📢'
  };
  return icons[type] || '⚠️';
}

function toggleDashboard() {
  const content = document.getElementById('sg-content');
  const toggle = document.getElementById('sg-toggle');
  if (content && toggle) {
    const isHidden = content.style.display === 'none';
    content.style.display = isHidden ? 'block' : 'none';
    toggle.textContent = isHidden ? '▼' : '▶';
  }
}

function showFullReport() {
  const report = [];
  
  report.push('🛡️ SCREENGUARD SECURITY REPORT');
  report.push('═'.repeat(40));
  report.push('');
  
  report.push(`Privacy Score: ${privacyScore}/100 (${getScoreColor(privacyScore).label})`);
  report.push(`Safety Score: ${safetyScore}/100 (${getScoreColor(safetyScore).label})`);
  report.push('');
  
  if (Object.values(piiCounts).some(c => c > 0)) {
    report.push('📊 PERSONAL DATA DETECTED:');
    for (const [type, count] of Object.entries(piiCounts)) {
      if (count > 0) {
        report.push(`  ${getPiiIcon(type)} ${count} ${type.replace('_', ' ')}`);
      }
    }
    report.push('');
  }
  
  if (getTotalImageIssues() > 0) {
    report.push('⚠️ CONTENT WARNINGS:');
    for (const [type, count] of Object.entries(imageSafetyIssues)) {
      if (count > 0) {
        report.push(`  ${getImageIcon(type)} ${count} ${type.replace('_', ' ')}`);
      }
    }
    report.push('');
  }
  
  if (trackingInfo && trackingInfo.tracking_detected) {
    report.push('🔍 DATA COLLECTION DETECTED:');
    report.push(`  ${trackingInfo.summary || 'User data is being collected'}`);
    if (trackingInfo.data_collected) {
      report.push('  Collecting:');
      trackingInfo.data_collected.forEach(item => {
        report.push(`    • ${item}`);
      });
    }
    if (trackingInfo.data_sharing) {
      report.push('  Sharing with:');
      trackingInfo.data_sharing.forEach(item => {
        report.push(`    • ${item}`);
      });
    }
    report.push('');
  }
  
  report.push('═'.repeat(40));
  report.push('Generated by ScreenGuard - Your Privacy Guardian');
  
  alert(report.join('\n'));
}

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Content script received:', request.type);

  if (request.type === 'get_status') {
    sendResponse({ 
      enabled: isEnabled, 
      initialized: isInitialized,
      maskedCount: Array.from(maskedElements.values()).reduce((sum, arr) => sum + arr.length, 0),
      privacyScore: privacyScore,
      safetyScore: safetyScore,
      piiCounts: piiCounts,
      imageSafetyIssues: imageSafetyIssues,
      trackingInfo: trackingInfo
    });
  } else if (request.type === 'toggle') {
    isEnabled = request.enabled;
    if (isEnabled) {
      scanPage();
    } else {
      clearAllMasks();
    }
    sendResponse({ success: true });
  } else if (request.type === 'rescan') {
    scanPage().then(() => sendResponse({ success: true }));
    return true;
  } else if (request.type === 'filter_change') {
    enabledFilters[request.piiType] = request.enabled;
    sendResponse({ success: true });
  }
  return true;
  });
} else {
  console.log(chrome);
  console.warn('chrome.runtime.onMessage not available');
}

// Load settings and initialize
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get(['enabled', 'filters', 'imageModeration']);
    if (result.enabled !== undefined) {
      isEnabled = result.enabled;
    }
    if (result.filters) {
      enabledFilters = { ...enabledFilters, ...result.filters };
    }
    imageModerationEnabled = result.imageModeration !== false;
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

// Initialize everything
loadSettings().then(() => {
  initDetector();
});

console.log('✅ ScreenGuard content script loaded');

// =================== IMAGE MODERATION ===================

// Ensure Prompt API session for images
async function ensureImageAiSession() {
  if (!window.ai?.languageModel) return null;
  
  if (!imageAiSession) {
    try {
      const capabilities = await window.ai.languageModel.capabilities();
      
      if (capabilities.available === "readily" || capabilities.available === "after-download") {
        imageAiSession = await window.ai.languageModel.create({
          initialPrompts: [{
            role: "system",
            content: `You are an advanced content safety classifier. Analyze images for inappropriate content that should be blocked or blurred.

CRITICAL: Respond with ONLY valid JSON. No explanations, no markdown.

Format: {
  "unsafe": true/false,
  "categories": ["violence", "nudity", "sexual", "disturbing", "age_restricted", "inappropriate_ads", "none"],
  "confidence": 0.0-1.0,
  "severity": "low"/"medium"/"high"/"critical",
  "description": "brief reason"
}

Content Categories:
- violence: Gore, weapons, fighting, blood, war imagery
- nudity: Exposed private parts, explicit nudity
- sexual: Sexual acts, suggestive poses, explicit content
- disturbing: Shock content, grotesque imagery, horror
- age_restricted: Content inappropriate for minors
- inappropriate_ads: Predatory ads, scams, clickbait with explicit thumbnails
- none: Safe content

Classification Rules:
- Artistic nudity in museums/education = safe
- News violence coverage = context-dependent
- Medical/educational anatomy = safe
- Suggestive poses/clothing = age_restricted
- Any explicit sexual content = unsafe (sexual, nudity)
- Gore/graphic violence = unsafe (violence, disturbing)
- Clickbait ads with sexualized content = unsafe (inappropriate_ads)

Set confidence 0.9+ only if extremely certain.
Set unsafe=true if confidence >= 0.75 in any harmful category.`
          }],
          expectedInputs: [{ type: "image" }]
        });
        console.log("✅ Image AI session created");
      }
    } catch (error) {
      console.error("Failed to create image AI session:", error);
      return null;
    }
  }
  
  return imageAiSession;
}

// Fetch remote image as Blob
async function fetchImageBlob(url) {
  try {
    const res = await fetch(url, { mode: 'cors', cache: 'force-cache' });
    if (!res.ok) throw new Error(res.statusText);
    return await res.blob();
  } catch (error) {
    console.warn('Failed to fetch image:', error);
    return null;
  }
}

// SHA-256 hash for caching
async function sha256Blob(blob) {
  const buf = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Prompt API image classifier
async function classifyImageWithAI(blob) {
  const session = await ensureImageAiSession();
  if (!session) {
    return { 
      unsafe: null, 
      categories: [], 
      confidence: 0, 
      severity: 'unknown',
      description: 'AI not available',
      reason: 'no_ai' 
    };
  }

  try {
    const response = await session.prompt([{
      role: "user",
      content: [
        { 
          type: "text", 
          value: "Analyze this image for safety. Return the JSON classification."
        },
        { 
          type: "image", 
          value: blob 
        }
      ]
    }]);
    
    let cleaned = response.trim();
    
    // Remove markdown code blocks
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    }
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/```\n?/g, '');
    }
    
    const result = JSON.parse(cleaned);
    
    // Validate result structure
    if (!result.hasOwnProperty('unsafe') || !Array.isArray(result.categories)) {
      throw new Error('Invalid response format');
    }
    
    return result;
  } catch (error) {
    console.warn('Image AI classification error:', error);
    return { 
      unsafe: null, 
      categories: [], 
      confidence: 0, 
      severity: 'unknown',
      description: 'Parse error',
      reason: 'parse_error' 
    };
  }
}

function extractCssUrl(bg) {
  const match = bg && bg.match(/url\(["']?(.*?)["']?\)/);
  return match ? match[1] : null;
}

function elementIsVisible(el) {
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  return (
    rect.width > 40 && 
    rect.height > 40 && 
    rect.bottom > 0 && 
    rect.right > 0 &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0'
  );
}

async function processImgElement(imgEl) {
  if (!imageModerationEnabled) return;
  if (!imgEl || imgEl.dataset.sgProcessedImg) return;
  if (!elementIsVisible(imgEl)) return;
  imgEl.dataset.sgProcessedImg = '1';

  const url = imgEl.currentSrc || imgEl.src;
  if (!url) return;

  try {
    const urlObj = new URL(url, location.href);
    const fname = (urlObj.pathname || '').toLowerCase();
    
    // Skip common safe formats
    if (fname.endsWith('.svg') || fname.endsWith('.ico') || fname.endsWith('.gif')) {
      return;
    }
  } catch (error) {
    console.warn('Invalid image URL:', error);
    return;
  }

  const blob = await fetchImageBlob(url);
  if (!blob) return;
  
  // Skip tiny images (likely icons/logos)
  if ((blob.size || 0) < 2000) return;

  const key = await sha256Blob(blob);
  let verdict = imageVerdictCache.get(key);
  
  if (!verdict) {
    verdict = await classifyImageWithAI(blob);
    imageVerdictCache.set(key, verdict);
    console.log(`🖼️ Image classified:`, verdict);
  }
  
  // Blur if unsafe with high confidence
  if (verdict.unsafe === true && verdict.confidence >= 0.75) {
    maskImageElement(imgEl, verdict);
    
    // Update safety counts
    if (verdict.categories && Array.isArray(verdict.categories)) {
      verdict.categories.forEach(category => {
        if (imageSafetyIssues.hasOwnProperty(category) && category !== 'none') {
          imageSafetyIssues[category]++;
        }
      });
    }
  }
}

async function processBackgroundImage(el) {
  if (!imageModerationEnabled) return;
  if (!el || el.dataset.sgProcessedBg) return;

  const bg = getComputedStyle(el).backgroundImage;
  const url = extractCssUrl(bg);
  if (!url || url === 'none') return;

  el.dataset.sgProcessedBg = '1';
  if (!elementIsVisible(el)) return;

  const blob = await fetchImageBlob(url);
  if (!blob) return;
  if ((blob.size || 0) < 2000) return;

  const key = await sha256Blob(blob);
  let verdict = imageVerdictCache.get(key);
  
  if (!verdict) {
    verdict = await classifyImageWithAI(blob);
    imageVerdictCache.set(key, verdict);
    console.log(`🖼️ Background image classified:`, verdict);
  }
  
  if (verdict.unsafe === true && verdict.confidence >= 0.75) {
    maskImageElement(el, verdict, true);
    
    // Update safety counts
    if (verdict.categories && Array.isArray(verdict.categories)) {
      verdict.categories.forEach(category => {
        if (imageSafetyIssues.hasOwnProperty(category) && category !== 'none') {
          imageSafetyIssues[category]++;
        }
      });
    }
  }
}

async function scanImages(root = document) {
  if (!imageModerationEnabled) return;

  console.log('🔍 Scanning images for unsafe content...');

  // Process <img> tags
  const images = [...root.querySelectorAll('img')];
  for (const img of images) {
    await processImgElement(img);
  }

  // Process CSS backgrounds (common in ads and thumbnails)
  const elementsWithBg = [...root.querySelectorAll('div, section, article, aside, header, footer, a')];
  for (const el of elementsWithBg) {
    const bg = getComputedStyle(el).backgroundImage;
    if (bg && bg !== 'none' && bg.includes('u rl(')) {
      await processBackgroundImage(el);
    }
  }
  
  console.log('✅ Image scan complete');
}

function maskImageElement(el, verdict, isBg = false) {
  try {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const overlay = createOverlay(rect, 'image');
    overlay.dataset.sgKind = 'image';
    overlay.dataset.sgSeverity = verdict.severity || 'unknown';
    
    // Create detailed tooltip
    const categories = verdict.categories?.filter(c => c !== 'none').join(', ') || 'inappropriate content';
    const severityLabel = verdict.severity ? ` (${verdict.severity} severity)` : '';
    overlay.title = `🚫 Blurred: ${categories}${severityLabel}\n${verdict.description || ''}`;
    
    // Add click-to-reveal functionality
    overlay.style.pointerEvents = 'auto';
    overlay.style.cursor = 'pointer';
    
    const warningLabel = document.createElement('div');
    warningLabel.className = 'image-warning-label';
    warningLabel.textContent = '🚫 Content Hidden';
    warningLabel.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: bold;
      pointer-events: none;
      z-index: 1;
    `;
    overlay.appendChild(warningLabel);
    
    // Click to temporarily reveal
    overlay.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`This content was flagged as: ${categories}\n\nDo you want to reveal it?`)) {
        overlay.style.display = 'none';
        setTimeout(() => {
          if (overlay.parentNode) overlay.style.display = 'block';
        }, 5000); // Re-blur after 5 seconds
      }
    });
    
    document.body.appendChild(overlay);

    if (!maskedElements.has(el)) maskedElements.set(el, []);
    maskedElements.get(el).push(overlay);
    
    console.log(`🚫 Masked ${isBg ? 'background' : 'image'}:`, categories);
  } catch (error) {
    console.warn('maskImageElement error', error);
  }
}

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  if (detector) detector.destroy();
  if (trackingAnalyzer) trackingAnalyzer.destroy();
  if (imageAiSession) {
    try {
      imageAiSession.destroy();
    } catch (error) {
      console.error('Error destroying image session:', error);
    }
  }
});