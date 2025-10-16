import { PiiDetector } from './detector.js';

let detector;
let isEnabled = true;
let processedNodes = new WeakSet();
let maskedElements = [];
let observer = null;
let isInitialized = false;

// Initialize the detector
async function initDetector() {
  try {
    detector = new PiiDetector();
    await detector.init();
    isInitialized = true;
    console.log('PII Detector initialized');
  } catch (error) {
    console.error('Failed to initialize detector:', error);
  }
}

// Scan a single element and its children for PII
async function scanAndMaskElement(element) {
  if (!isEnabled || !isInitialized) return;
  
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        // Skip already processed nodes and masked elements
        if (processedNodes.has(node) || 
            node.parentElement?.classList.contains('screenguard-masked-container')) {
          return NodeFilter.FILTER_REJECT;
        }
        // Skip script, style, and other non-visible elements
        if (node.parentElement?.tagName.match(/^(SCRIPT|STYLE|NOSCRIPT)$/i)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    },
    false
  );

  const nodesToProcess = [];
  let textNode;
  
  while (textNode = walker.nextNode()) {
    if (textNode.textContent.trim().length > 0) {
      nodesToProcess.push(textNode);
    }
  }

  // Process nodes in batches to avoid blocking
  for (const node of nodesToProcess) {
    try {
      const text = node.textContent;
      const pii = await detector.detectPII(text);
      
      if (pii && pii.length > 0) {
        maskTextNode(node, pii);
      }
      
      processedNodes.add(node);
    } catch (error) {
      console.error('Error processing node:', error);
    }
  }
}

// Initial full page scan
async function scanPageForPII() {
  if (!isEnabled || !isInitialized) return;

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        // Skip script, style, and other non-visible elements
        if (node.parentElement?.tagName.match(/^(SCRIPT|STYLE|NOSCRIPT)$/i)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    },
    false
  );

  let textNode;
  const detectedItems = [];

  while (textNode = walker.nextNode()) {
    const text = textNode.textContent;
    if (text.trim().length > 0) {
      try {
        const pii = await detector.detectPII(text);
        if (pii && pii.length > 0) {
          detectedItems.push({ node: textNode, pii: pii });
        }
      } catch (error) {
        console.error('Error detecting PII:', error);
      }
    }
  }

  return detectedItems;
}

// Mask all PII on the page
async function maskPII() {
  if (!isEnabled || !isInitialized) return;

  const items = await scanPageForPII();
  let totalMasked = 0;

  for (const item of items) {
    if (!processedNodes.has(item.node)) {
      maskTextNode(item.node, item.pii);
      processedNodes.add(item.node);
      totalMasked += item.pii.length;
    }
  }

  // Send count to popup
  try {
    chrome.runtime.sendMessage({
      type: 'pii_count',
      count: totalMasked
    });
  } catch (error) {
    // Popup might not be open, ignore error
  }

  console.log(`Masked ${totalMasked} PII items`);
}

// Mask a single text node with PII
function maskTextNode(node, piiItems) {
  if (!node || !node.parentElement || piiItems.length === 0) return;

  const text = node.textContent;
  
  // Find all PII positions in the text
  const piiPositions = [];
  for (const pii of piiItems) {
    let searchIndex = 0;
    while (true) {
      const index = text.indexOf(pii.value, searchIndex);
      if (index === -1) break;
      
      piiPositions.push({
        start: index,
        end: index + pii.value.length,
        type: pii.type,
        value: pii.value
      });
      
      searchIndex = index + 1;
    }
  }

  // Sort by start position and merge overlapping ranges
  piiPositions.sort((a, b) => a.start - b.start);
  
  const mergedPositions = [];
  for (const pos of piiPositions) {
    if (mergedPositions.length === 0) {
      mergedPositions.push(pos);
    } else {
      const last = mergedPositions[mergedPositions.length - 1];
      if (pos.start <= last.end) {
        // Overlapping or adjacent, merge them
        last.end = Math.max(last.end, pos.end);
        last.type = `${last.type}/${pos.type}`;
      } else {
        mergedPositions.push(pos);
      }
    }
  }

  if (mergedPositions.length === 0) return;

  // Create container with masked content
  const container = document.createElement('span');
  container.className = 'screenguard-masked-container';
  let lastIndex = 0;

  for (const pii of mergedPositions) {
    // Add unmasked text before PII
    if (pii.start > lastIndex) {
      container.appendChild(
        document.createTextNode(text.substring(lastIndex, pii.start))
      );
    }

    // Add masked PII
    const maskedSpan = document.createElement('span');
    maskedSpan.className = 'screenguard-masked';
    maskedSpan.textContent = '●'.repeat(pii.end - pii.start);
    maskedSpan.title = `Masked ${pii.type}`;
    maskedSpan.style.cssText = `
      filter: blur(5px);
      background-color: #f0f0f0;
      border-radius: 3px;
      padding: 0 2px;
      cursor: pointer;
      display: inline-block;
      user-select: none;
    `;
    maskedSpan.setAttribute('data-pii-type', pii.type);
    maskedSpan.setAttribute('data-original-value', pii.value);

    // Optional: Click to temporarily reveal
    maskedSpan.addEventListener('click', function() {
      if (this.textContent.includes('●')) {
        this.textContent = this.getAttribute('data-original-value');
        this.style.filter = 'none';
        setTimeout(() => {
          this.textContent = '●'.repeat(pii.end - pii.start);
          this.style.filter = 'blur(5px)';
        }, 3000);
      }
    });

    container.appendChild(maskedSpan);
    lastIndex = pii.end;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    container.appendChild(
      document.createTextNode(text.substring(lastIndex))
    );
  }

  // Replace the original node
  node.replaceWith(container);
  maskedElements.push(container);
}

// Remove all masking
function unmaskAll() {
  for (const element of maskedElements) {
    const originalText = element.textContent.replace(/●+/g, (match) => {
      // Try to restore original text from data attributes
      const masked = element.querySelector('.screenguard-masked');
      return masked?.getAttribute('data-original-value') || match;
    });
    const textNode = document.createTextNode(originalText);
    element.replaceWith(textNode);
  }
  maskedElements = [];
  processedNodes = new WeakSet();
}

// Setup MutationObserver for dynamic content
function setupObserver() {
  if (observer) observer.disconnect();

  observer = new MutationObserver((mutations) => {
    if (!isEnabled || !isInitialized) return;

    for (const mutation of mutations) {
      if (mutation.addedNodes.length) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Debounce to avoid excessive scanning
            clearTimeout(node._scanTimeout);
            node._scanTimeout = setTimeout(() => {
              scanAndMaskElement(node);
            }, 100);
          } else if (node.nodeType === Node.TEXT_NODE && 
                     node.textContent.trim().length > 0) {
            // New text node added
            detector.detectPII(node.textContent).then(pii => {
              if (pii && pii.length > 0) {
                maskTextNode(node, pii);
                processedNodes.add(node);
              }
            }).catch(err => console.error('Error detecting PII:', err));
          }
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: false
  });
}

// Listen for messages from popup and background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'toggle') {
    isEnabled = request.enabled;
    if (isEnabled) {
      maskPII();
      setupObserver();
    } else {
      unmaskAll();
      if (observer) observer.disconnect();
    }
    sendResponse({ success: true });
  } else if (request.type === 'get_status') {
    sendResponse({ 
      enabled: isEnabled, 
      initialized: isInitialized,
      maskedCount: maskedElements.length 
    });
  } else if (request.type === 'rescan') {
    processedNodes = new WeakSet();
    maskPII().then(() => {
      sendResponse({ success: true });
    });
    return true; // Keep channel open for async response
  }
});

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

async function init() {
  await initDetector();
  
  // Get initial state from storage
  chrome.storage.sync.get(['enabled'], (result) => {
    isEnabled = result.enabled !== false; // Default to true
    
    if (isEnabled && isInitialized) {
      maskPII();
      setupObserver();
    }
  });
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  if (observer) observer.disconnect();
});