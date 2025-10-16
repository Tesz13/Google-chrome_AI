export class PiiDetector {
  constructor() {
    this.session = null;
    this.useRegexFallback = false;
    this.isInitialized = false;
    this.piiTypes = ['email', 'phone', 'ssn', 'credit_card', 'address', 'password', 'api_key'];
  }

  async init() {
    try {
      // Check if the AI API is available
      if (typeof ai === 'undefined' || !ai.languageModel) {
        console.warn("AI Language Model API not available. Using regex fallback.");
        this.useRegexFallback = true;
        this.isInitialized = true;
        return;
      }

      const canCreate = await ai.languageModel.capabilities();
      
      if (canCreate.available === "readily" || canCreate.available === "after-download") {
        this.session = await ai.languageModel.create({
          systemPrompt: `You are a PII (Personally Identifiable Information) detector. Your job is to identify sensitive data in text.

CRITICAL: You must respond with ONLY valid JSON, nothing else. No explanations, no markdown, just raw JSON.

Response format:
{
  "pii_found": [
    {"type": "email", "value": "user@example.com"},
    {"type": "phone", "value": "555-123-4567"}
  ]
}

PII types to detect:
- email: Email addresses (user@example.com)
- phone: Phone numbers (555-123-4567, +1-555-123-4567, etc.)
- ssn: Social Security Numbers (XXX-XX-XXXX or XXXXXXXXX)
- credit_card: Credit card numbers (16 digits, with or without spaces/dashes)
- address: Physical addresses with street, city, state, zip
- password: Obvious password strings or patterns
- api_key: API keys, tokens, or secrets (long alphanumeric strings)

Rules:
- Only detect actual PII, not example placeholders
- Be conservative - don't flag common words as PII
- If no PII is found, return {"pii_found": []}
- Return ONLY the JSON object, nothing else`
        });
        
        console.log("AI Language Model initialized successfully");
        this.useRegexFallback = false;
        this.isInitialized = true;
      } else {
        console.warn(`AI model not available (status: ${canCreate.available}). Using regex fallback.`);
        this.useRegexFallback = true;
        this.isInitialized = true;
      }
    } catch (error) {
      console.error("Failed to initialize AI Language Model:", error);
      console.warn("Falling back to regex-based detection");
      this.useRegexFallback = true;
      this.isInitialized = true;
    }
  }

  async detectPII(text) {
    if (!this.isInitialized) {
      await this.init();
    }

    // Skip very short or empty text
    if (!text || text.trim().length < 5) {
      return [];
    }

    // Use regex fallback if AI is not available
    if (this.useRegexFallback || !this.session) {
      return this.regexFallback(text);
    }

    try {
      // Send text to Gemini Nano for analysis
      const prompt = `Analyze this text for PII and respond with JSON only:\n\n"${text}"`;
      const response = await this.session.prompt(prompt);
      
      // Clean up response - remove markdown code blocks if present
      let cleanedResponse = response.trim();
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      } else if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/```\n?/g, '');
      }
      
      // Parse the JSON response
      const result = JSON.parse(cleanedResponse);
      
      // Validate the response structure
      if (result && Array.isArray(result.pii_found)) {
        // Filter out invalid entries
        const validPII = result.pii_found.filter(item => 
          item && item.type && item.value && 
          typeof item.type === 'string' && 
          typeof item.value === 'string'
        );
        return validPII;
      } else {
        console.warn("Invalid AI response format, using regex fallback");
        return this.regexFallback(text);
      }
    } catch (error) {
      console.error("PII detection error:", error);
      // Fall back to regex on error
      return this.regexFallback(text);
    }
  }

  regexFallback(text) {
    // Enhanced regex patterns for common PII types
    const patterns = {
      email: {
        regex: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
        validate: (match) => {
          // Avoid false positives like "example@example.com" or test emails
          const testDomains = ['example.com', 'test.com', 'sample.com'];
          const domain = match.split('@')[1];
          return !testDomains.includes(domain);
        }
      },
      phone: {
        regex: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
        validate: (match) => {
          // Remove non-digits and check if it's a reasonable length
          const digits = match.replace(/\D/g, '');
          return digits.length >= 10 && digits.length <= 15;
        }
      },
      ssn: {
        regex: /\b\d{3}-?\d{2}-?\d{4}\b/g,
        validate: (match) => {
          const digits = match.replace(/\D/g, '');
          // Basic SSN validation (not 000, 666, or 900-999 in first group)
          const firstGroup = parseInt(digits.substring(0, 3));
          return digits.length === 9 && 
                 firstGroup !== 0 && 
                 firstGroup !== 666 && 
                 firstGroup < 900;
        }
      },
      credit_card: {
        regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
        validate: (match) => {
          const digits = match.replace(/\D/g, '');
          // Luhn algorithm check
          if (digits.length !== 16) return false;
          
          let sum = 0;
          let isEven = false;
          
          for (let i = digits.length - 1; i >= 0; i--) {
            let digit = parseInt(digits[i]);
            
            if (isEven) {
              digit *= 2;
              if (digit > 9) digit -= 9;
            }
            
            sum += digit;
            isEven = !isEven;
          }
          
          return sum % 10 === 0;
        }
      },
      api_key: {
        regex: /\b(?:api[_-]?key|token|secret|bearer)[\s:=]+['"]?([a-zA-Z0-9_\-]{20,})['"]?\b/gi,
        validate: (match) => {
          // Extract the actual key part
          return match.length >= 20;
        }
      }
    };

    const found = [];
    
    for (const [type, config] of Object.entries(patterns)) {
      const matches = text.matchAll(config.regex);
      for (const match of matches) {
        const value = match[0];
        
        // Apply validation if provided
        if (!config.validate || config.validate(value)) {
          found.push({ type, value });
        }
      }
    }
    
    return found;
  }

  // Clean up resources
  destroy() {
    if (this.session) {
      try {
        this.session.destroy();
      } catch (error) {
        console.error("Error destroying session:", error);
      }
      this.session = null;
    }
    this.isInitialized = false;
  }
}

// Export a default instance if needed
export default PiiDetector;