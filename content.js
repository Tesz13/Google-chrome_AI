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
          systemPrompt: `You are a PII detector. Respond with ONLY valid JSON.
          
Format: {"pii_found": [{"type": "email", "value": "user@example.com"}]}

Detect: email, phone, ssn, credit_card, address, password, api_key
If no PII: {"pii_found": []}`
        });
        
        console.log("AI Language Model initialized");
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
      const prompt = `Analyze this text for PII:\n\n"${text}"`;
      const response = await this.session.prompt(prompt);
      
      let cleanedResponse = response.trim();
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
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
      ssn: /\b\d{3}-?\d{2}-?\d{4}\b/g,
      credit_card: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g
    };

    const found = [];
    
    for (const [type, regex] of Object.entries(patterns)) {
      const matches = text.matchAll(regex);
      for (const match of matches) {
        found.push({ type, value: match[0] });
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

// Main content script code
let detector;
let isEnabled = true;
let processedNodes = new WeakSet();
let maskedElements = [];
let observer = null;
let isInitialized = false;

console.log('ScreenGuard content script loading...');

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

// Listen for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Content script received:', request.type);
  
  if (request.type === 'get_status') {
    sendResponse({ 
      enabled: isEnabled, 
      initialized: isInitialized,
      maskedCount: maskedElements.length 
    });
  } else if (request.type === 'toggle') {
    isEnabled = request.enabled;
    sendResponse({ success: true });
  }
  
  return true;
});

// Initialize
initDetector().then(() => {
  console.log('ScreenGuard ready');
});

console.log('ScreenGuard content script loaded');