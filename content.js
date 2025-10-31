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
      // if (typeof ai === 'undefined' || !ai.languageModel) {
      //   console.warn("AI Language Model API not available. Using regex fallback.");
      //   this.useRegexFallback = true;
      //   this.isInitialized = true;
      //   return;
      // }

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
        
        console.log("✅ AI Language Model initialized");
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
let maskedElements = new Map(); // Map of text nodes to their overlay elements
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

// Scan entire page for PII
async function scanPage() {
  if (!isEnabled || !isInitialized) return;
  
  console.log('🔍 Scanning page for PII...');
  
  // Clear existing masks
  clearAllMasks();
  
  // Get all text nodes
  const textNodes = getTextNodes(document.body);
  
  let totalFound = 0;
  
  for (const node of textNodes) {
    if (processedNodes.has(node)) continue;
    
    const text = node.textContent;
    if (!text || text.trim().length < 5) continue;
    
    // Detect PII in this text node
    const piiItems = await detector.detectPII(text);
    
    if (piiItems.length > 0) {
      // Filter by enabled types
      const filteredItems = piiItems.filter(item => enabledFilters[item.type]);
      
      if (filteredItems.length > 0) {
        maskTextNode(node, filteredItems);
        totalFound += filteredItems.length;
      }
    }
    
    processedNodes.add(node);
  }
  
  console.log(`✅ Found and masked ${totalFound} PII items`);
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
        // Skip script, style, and already processed nodes
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        
        const tagName = parent.tagName.toLowerCase();
        if (['script', 'style', 'noscript', 'iframe'].includes(tagName)) {
          return NodeFilter.FILTER_REJECT;
        }
        
        // Skip our own overlay elements
        if (parent.classList.contains('screenguard-overlay')) {
          return NodeFilter.FILTER_REJECT;
        }
        
        // Only accept nodes with meaningful text
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
  
  // For each PII item, create a blur overlay
  for (const pii of piiItems) {
    try {
      // Find the position of this PII in the text
      const index = text.indexOf(pii.value);
      if (index === -1) continue;
      
      // Create a range for this specific PII
      const range = document.createRange();
      range.setStart(textNode, index);
      range.setEnd(textNode, index + pii.value.length);
      
      // Get the bounding rectangles
      const rects = range.getClientRects();
      
      // Create overlay for each rect (handles line wrapping)
      for (const rect of rects) {
        if (rect.width === 0 || rect.height === 0) continue;
        
        const overlay = createOverlay(rect, pii.type);
        document.body.appendChild(overlay);
        
        // Store reference
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
function createOverlay(rect, piiType) {
  const overlay = document.createElement('div');
  overlay.className = 'screenguard-overlay';
  overlay.dataset.piiType = piiType;
  
  // Position absolutely at the exact location of the text
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
}

// Update position of all overlays (for scroll/resize)
function updateOverlayPositions() {
  maskedElements.forEach((overlays, textNode) => {
    // Check if text node still exists in DOM
    if (!document.contains(textNode)) {
      // Remove overlays for deleted nodes
      overlays.forEach(overlay => {
        if (overlay && overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
      });
      maskedElements.delete(textNode);
      return;
    }
    
    // Update positions
    const text = textNode.textContent;
    let overlayIndex = 0;
    
    // This is simplified - in production you'd track exact PII positions
    overlays.forEach(overlay => {
      try {
        const range = document.createRange();
        range.selectNodeContents(textNode);
        const rect = range.getBoundingClientRect();
        
        if (rect.width > 0 && rect.height > 0) {
          overlay.style.left = rect.left + 'px';
          overlay.style.top = rect.top + 'px';
        }
      } catch (error) {
        // Node might be removed
      }
    });
  });
}

// Start mutation observer
function startObserver() {
  if (observer) return;
  
  observer = new MutationObserver((mutations) => {
    let shouldRescan = false;
    
    for (const mutation of mutations) {
      // Check if significant content was added
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          // Skip our own overlays
          if (node.classList && node.classList.contains('screenguard-overlay')) {
            continue;
          }
          shouldRescan = true;
          break;
        }
      }
      
      // Check for text changes
      if (mutation.type === 'characterData') {
        shouldRescan = true;
      }
    }
    
    if (shouldRescan) {
      // Debounce rescan
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

// Handle scroll and resize with better performance
let scrollTimeout;
let isScrolling = false;

window.addEventListener('scroll', () => {
  if (!isScrolling) {
    isScrolling = true;
    // Use requestAnimationFrame for smoother updates
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
      count: count
    });
  } catch (error) {
    // Ignore if background script isn't ready
  }
}

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Content script received:', request.type);
  
  if (request.type === 'get_status') {
    sendResponse({ 
      enabled: isEnabled, 
      initialized: isInitialized,
      maskedCount: Array.from(maskedElements.values()).reduce((sum, arr) => sum + arr.length, 0)
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
    scanPage().then(() => {
      sendResponse({ success: true });
    });
    return true; // Async response
  } else if (request.type === 'filter_change') {
    enabledFilters[request.piiType] = request.enabled;
    sendResponse({ success: true });
  }
  
  return true;
});

// Load settings and initialize
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get(['enabled', 'filters']);
    
    if (result.enabled !== undefined) {
      isEnabled = result.enabled;
    }
    
    if (result.filters) {
      enabledFilters = { ...enabledFilters, ...result.filters };
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

// Initialize everything
loadSettings().then(() => {
  initDetector();
});

console.log('✅ ScreenGuard content script loaded');