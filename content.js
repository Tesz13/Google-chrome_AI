// ========== PII Detector Class ==========
class PiiDetector {
  constructor() {
    this.session = null;
    this.useRegexFallback = false;
    this.isInitialized = false;
    this.piiTypes = ['email', 'phone', 'ssn', 'credit_card', 'address', 'password', 'api_key'];
  }

  async init() {
    try {
      if (typeof ai === 'undefined' || !ai.languageModel) {
        console.warn("AI Language Model API not available. Using regex fallback.");
        this.useRegexFallback = true;
        this.isInitialized = true;
        return;
      }

      const canCreate = await ai.languageModel.capabilities();
      
      if (canCreate.available === "readily" || canCreate.available === "after-download") {
        this.session = await ai.languageModel.create({
          systemPrompt: `You are a PII detector. Analyze text and identify personally identifiable information.

CRITICAL: Respond with ONLY valid JSON. No explanations, no markdown, just JSON.

Format: {"pii_found": [{"type": "email", "value": "user@example.com", "start": 0, "end": 16}]}

PII Types to detect:
- email: Email addresses
- phone: Phone numbers (any format)
- ssn: Social Security Numbers
- credit_card: Credit card numbers
- address: Physical addresses (street addresses only, not company names)
- password: Visible passwords or password-like strings
- api_key: API keys, tokens, secrets

Context awareness:
- "Johns Hopkins University" is NOT PII (institution name)
- "John's email: john@email.com" - the email IS PII
- Phone numbers in contact lists ARE PII
- Company addresses in footers may NOT be PII (use judgment)

If no PII found: {"pii_found": []}`
        });
        
        console.log("✅ AI Language Model initialized (text)");
        this.useRegexFallback = false;
        this.isInitialized = true;
      } else {
        console.warn("AI model not available. Using regex fallback.");
        this.useRegexFallback = true;
        this.isInitialized = true;
      }
    } catch (error) {
      console.error("Failed to initialize AI:", error);
      this.useRegexFallback = true;
      this.isInitialized = true;
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
          end: match.index + match[0].length
        });
      }
    }
    
    return found;
  }

  destroy() {
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

// ========== Main Extension Logic ==========
let detector;
let isEnabled = true;
let processedNodes = new WeakSet();
let maskedElements = new Map(); // Map of nodes/elements -> overlay elements[]
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

// ---- Image moderation state (NEW) ----
let imageModerationEnabled = true;
// AI session for image classification (separate from text model)
let sgAiSession = null;
// Cache: image hash -> verdict
const imageVerdictCache = new Map();

// Privacy Score tracking
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

console.log('🛡️ ScreenGuard content script loading...');

// Initialize detector
async function initDetector() {
  try {
    detector = new PiiDetector();
    await detector.init();
    isInitialized = true;
    console.log('✅ PII Detector initialized');
    
    // Start scanning after initialization
    await scanPage();
    startObserver();
  } catch (error) {
    console.error('❌ Failed to initialize detector:', error);
  }
}

// Scan entire page for PII (text + images)
async function scanPage() {
  if (!isEnabled || !isInitialized) return;
  
  console.log('🔍 Scanning page for PII (text + images)...');
  
  // Clear existing masks and reset counts
  clearAllMasks();
  resetPrivacyScore();
  
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

  // -- IMAGE SCAN (NEW) --
  scanImages(document);

  console.log(`✅ Found and masked ${totalFound} text PII items`);
  
  // Calculate and update privacy score
  calculatePrivacyScore();
  updatePrivacyBadge();
  updateBadge(totalFound);
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
        const overlay = createOverlay(rect, pii.type);
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

// Create blur overlay element (used for both text + image masks)
function createOverlay(rect, piiType) {
  const overlay = document.createElement('div');
  overlay.className = 'screenguard-overlay';
  overlay.dataset.piiType = piiType;

  overlay.style.position = 'fixed';
  overlay.style.left = rect.left + 'px';
  overlay.style.top = rect.top + 'px';
  overlay.style.width = rect.width + 'px';
  overlay.style.height = rect.height + 'px';
  overlay.style.zIndex = '999999';
  overlay.style.pointerEvents = 'none';
  // Visuals (also add CSS rule in content.css)
  // overlay.style.backdropFilter = 'blur(14px)';
  // overlay.style.background = 'rgba(0,0,0,0.25)';
  // overlay.style.borderRadius = '4px';

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
  
  const existingBadge = document.getElementById('screenguard-privacy-badge');
  if (existingBadge) existingBadge.remove();
}

// Update overlay positions (supports text nodes AND elements)
function updateOverlayPositions() {
  maskedElements.forEach((overlays, node) => {
    // If node gone, remove overlays
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
function updateBadge(count) {
  try {
    chrome.runtime.sendMessage({
      type: 'pii_detected',
      count: count,
      privacyScore: privacyScore,
      piiCounts: piiCounts
    });
  } catch (error) {
    // Ignore if background script isn't ready
  }
}

// ========== PRIVACY SCORE SYSTEM ==========

function resetPrivacyScore() {
  privacyScore = 100;
  piiCounts = {
    email: 0,
    phone: 0,
    ssn: 0,
    credit_card: 0,
    address: 0,
    password: 0,
    api_key: 0
  };
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
  privacyScore = Math.max(0, Math.min(100, Math.round(score)));
  console.log(`🔒 Privacy Score: ${privacyScore}/100`);
  return privacyScore;
}

function getScoreColor() {
  if (privacyScore >= 80) return { bg: '#2c5aa0', text: 'navy', label: 'SAFE' };
  if (privacyScore >= 50) return { bg: '#1e3a5f', text: 'dark-navy', label: 'MODERATE' };
  return { bg: '#4A4B2F', text: 'olive', label: 'HIGH RISK' };
}

function updatePrivacyBadge() {
  if (!isEnabled) return;
  const existingBadge = document.getElementById('screenguard-privacy-badge');
  if (existingBadge) existingBadge.remove();
  
  const badge = document.createElement('div');
  badge.id = 'screenguard-privacy-badge';
  badge.className = 'screenguard-privacy-badge';
  
  const scoreData = getScoreColor();
  const totalPII = Object.values(piiCounts).reduce((sum, count) => sum + count, 0);
  
  badge.innerHTML = `
    <div class="score-circle" style="background: ${scoreData.bg}">
      <div class="score-number">${privacyScore}</div>
      <div class="score-max">/100</div>
    </div>
    <div class="score-details">
      <div class="score-label" style="color: ${scoreData.bg}">${scoreData.label}</div>
      <div class="score-info">${totalPII} PII item${totalPII !== 1 ? 's' : ''} detected</div>
    </div>
  `;
  document.body.appendChild(badge);
  badge.addEventListener('click', () => showPrivacyDetails());
}

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Content script received:', request.type);
  
  if (request.type === 'get_status') {
    sendResponse({ 
      enabled: isEnabled, 
      initialized: isInitialized,
      maskedCount: Array.from(maskedElements.values()).reduce((sum, arr) => sum + arr.length, 0),
      privacyScore: privacyScore,
      piiCounts: piiCounts
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
    // Default ON if not set
    imageModerationEnabled = result.imageModeration !== false;
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

// Initialize everything
loadSettings().then(() => {
  initDetector();
});

console.log('✅ Cipher content script loaded');

function showPrivacyDetails() {
  const details = [];
  for (const [type, count] of Object.entries(piiCounts)) {
    if (count > 0) {
      const emoji = {
        email: '📧',
        phone: '📱',
        ssn: '🔢',
        credit_card: '💳',
        address: '📍',
        password: '🔒',
        api_key: '🔑'
      }[type] || '•';
      details.push(`${emoji} ${count} ${type.replace('_', ' ')}`);
    }
  }
  const scoreData = getScoreColor();
  const message = details.length > 0 
    ? `Privacy Score: ${privacyScore}/100 (${scoreData.label})\n\n${details.join('\n')}`
    : 'No PII detected on this page';
  alert(message);
}

// =================== IMAGE MODERATION (NEW) ===================

// Ensure Prompt API session for images
async function ensureImageAiSession() {
  if (!window.ai?.assistant?.create) return null;
  if (!sgAiSession) sgAiSession = await window.ai.assistant.create();
  return sgAiSession;
}

// Fetch remote image as Blob
async function fetchImageBlob(url) {
  try {
    const res = await fetch(url, { mode: 'cors', cache: 'force-cache' });
    if (!res.ok) throw new Error(res.statusText);
    return await res.blob();
  } catch {
    return null;
  }
}

// SHA-1 hash for caching
async function sha1Blob(blob) {
  const buf = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-1', buf);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Prompt API image classifier
async function classifyImageWithAI(blob) {
  const session = await ensureImageAiSession();
  if (!session) return { unsafe: null, categories: [], confidence: 0, reason: 'no_ai' };

  const prompt = [
    { text: "You are a safety classifier. Determine if this image is unsafe for minors (ads, popups, thumbnails)." },
    { text: "Return STRICT JSON: {\"unsafe\": true|false, \"categories\": [\"adult_nudity\",\"explicit\",\"suggestive\",\"violence\",\"graphic\",\"none\"], \"confidence\": 0..1}" },
    { image: blob }
  ];
  try {
    const res = await session.prompt(prompt);
    return JSON.parse(res.trim());
  } catch (e) {
    console.warn('Image AI parse error', e);
    return { unsafe: null, categories: [], confidence: 0, reason: 'parse_error' };
  }
}

function extractCssUrl(bg) {
  const m = bg && bg.match(/url\(["']?(.*?)["']?\)/);
  return m ? m[1] : null;
}

function elementIsVisible(el) {
  const r = el.getBoundingClientRect();
  return r.width > 40 && r.height > 40 && r.bottom > 0 && r.right > 0;
}

async function processImgElement(imgEl) {
  if (!imageModerationEnabled) return;
  if (!imgEl || imgEl.dataset.sgProcessedImg) return;
  if (!elementIsVisible(imgEl)) return;
  imgEl.dataset.sgProcessedImg = '1';

  const url = imgEl.currentSrc || imgEl.src;
  if (!url) return;

  try {
    const u = new URL(url, location.href);
    const fname = (u.pathname || '').toLowerCase();
    if (fname.endsWith('.svg') || fname.endsWith('.ico')) return;
  } catch {}

  const blob = await fetchImageBlob(url);
  if (!blob) return;
  if ((blob.size || 0) < 1500) return; // tiny assets: skip

  const key = await sha1Blob(blob);
  let verdict = imageVerdictCache.get(key);
  if (!verdict) {
    verdict = await classifyImageWithAI(blob);
    imageVerdictCache.set(key, verdict);
  }
  if (verdict.unsafe === true && verdict.confidence >= 0.80) {
    maskImageElement(imgEl, verdict.categories);
  }
}

async function processBackgroundImage(el) {
  if (!imageModerationEnabled) return;
  if (!el || el.dataset.sgProcessedBg) return;

  const bg = getComputedStyle(el).backgroundImage;
  const url = extractCssUrl(bg);
  if (!url) return;

  el.dataset.sgProcessedBg = '1';
  if (!elementIsVisible(el)) return;

  const blob = await fetchImageBlob(url);
  if (!blob) return;
  if ((blob.size || 0) < 1500) return;

  const key = await sha1Blob(blob);
  let verdict = imageVerdictCache.get(key);
  if (!verdict) {
    verdict = await classifyImageWithAI(blob);
    imageVerdictCache.set(key, verdict);
  }
  if (verdict.unsafe === true && verdict.confidence >= 0.80) {
    maskImageElement(el, verdict.categories, /*isBg*/ true);
  }
}

function scanImages(root = document) {
  if (!imageModerationEnabled) return;

  // <img> tags
  [...root.querySelectorAll('img')].forEach(processImgElement);

  // CSS backgrounds
  [...root.querySelectorAll('*')].forEach(processBackgroundImage);
}

function maskImageElement(el, categories = [], isBg = false) {
  try {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const overlay = createOverlay(rect, 'image');
    overlay.dataset.sgKind = 'image';
    overlay.title = categories.length ? `Blurred: ${categories.filter(c => c !== 'none').join(', ')}` : 'Blurred: Sensitive image';
    document.body.appendChild(overlay);

    if (!maskedElements.has(el)) maskedElements.set(el, []);
    maskedElements.get(el).push(overlay);
  } catch (e) {
    console.warn('maskImageElement error', e);
  }
}
