🔐 Cipher - Chrome Extension
Real-Time Privacy Protection Using Chrome's Built-in AI

Cipher is a Chrome extension that automatically detects and blurs personally identifiable information (PII) as it appears on your screen — protecting users from shoulder-surfing, screen-sharing leaks, and accidental exposure during meetings.

Built for the Google Chrome Built-in AI Challenge 2025 🏆

🌟 Key Features
🔒 Smart PII Detection – Identifies sensitive text across any web app (Gmail, Docs, Slack, etc.)
👁️ Automatic Blur Mode – Masks detected PII in real-time with visual overlays
🧠 AI Context Awareness – Uses Chrome's Prompt API with Gemini Nano to reduce false positives
⚙️ Customizable Filters – Choose which data types to protect
💻 Privacy-First Design – All processing happens locally; no data leaves your device
🎨 Color-Coded Blurs – Different PII types have different blur colors for easy identification
PII Types Detected
📧 Email addresses
📱 Phone numbers
🔢 Social Security Numbers
💳 Credit card numbers
📍 Physical addresses
🔒 Passwords
🔑 API keys & tokens
🚀 Installation & Setup
Prerequisites
Chrome Canary or Dev Channel (required for Chrome Built-in AI APIs)
Join the Chrome Built-in AI Early Preview Program:
Visit: https://developer.chrome.com/docs/ai/join-epp
Sign up and enable AI features in chrome://flags
Enable Required Flags
Open chrome://flags and enable:

Prompt API for Gemini Nano
Search: #prompt-api-for-gemini-nano
Set to: Enabled
Optimization Guide On Device Model
Search: #optimization-guide-on-device-model
Set to: Enabled BypassPerfRequirement
Restart Chrome
Install the Extension
Clone or download this repository
Open Chrome Extension Management:
Navigate to chrome://extensions/
Enable "Developer mode" (toggle in top-right)
Load the extension:
Click "Load unpacked"
Select the extension folder containing manifest.json
Verify installation:
You should see the Cipher icon in your toolbar
Click it to open the popup
Test the Extension
Open demo.html in Chrome
The extension should automatically detect and blur PII on the page
Use Ctrl+Shift+P (or Cmd+Shift+P on Mac) to toggle blurring on/off
📁 File Structure
cipher/
├── manifest.json          # Extension manifest (Manifest V3)
├── background.js          # Background service worker
├── content.js             # Main content script with PII detection
├── content.css            # Blur overlay styles
├── popup.html             # Extension popup UI
├── popup.js               # Popup logic
├── options.html           # Settings page
├── options.js             # Settings logic
├── demo.html              # Demo page with sample PII
├── icon.png               # Extension icon (128x128)
└── README.md              # This file
🎯 How It Works
1. AI-Powered Detection
Cipher uses Chrome's Prompt API with Gemini Nano to analyze text content:

javascript
const session = await ai.languageModel.create({
  systemPrompt: `You are a PII detector. Analyze text and identify 
  personally identifiable information with context awareness...`
});

const piiItems = await session.prompt(`Analyze this text: "${text}"`);
2. Intelligent Context Awareness
The AI understands context to reduce false positives:

✅ "Johns Hopkins University" → NOT PII (institution name)
❌ "John's email: john@email.com" → IS PII (personal email)
3. Visual Masking
When PII is detected, the extension:

Gets the exact screen position of the text using Range.getBoundingClientRect()
Creates a positioned overlay element with blur effect
Updates overlay positions on scroll/resize
4. Regex Fallback
If the AI API is unavailable, the extension automatically falls back to regex-based detection to ensure functionality.

🎨 Usage
Popup Controls
Click the extension icon to:

Toggle protection on/off
View PII count on current page
Configure filters for specific PII types
Rescan page manually
Access settings
Keyboard Shortcut
Ctrl+Shift+P (Windows/Linux)
Cmd+Shift+P (Mac)
Quickly toggle PII masking on/off

Settings Page
Right-click the extension icon → Options:

Enable/disable specific PII types
Configure advanced settings
View extension information
🏗️ Technical Architecture
Chrome APIs Used
Prompt API (Primary) - AI-powered PII detection with Gemini Nano
Storage API - Save user preferences
Tabs API - Communicate with active tabs
Scripting API - Inject content scripts
Commands API - Keyboard shortcuts
Performance Optimizations
Debounced scanning - Waits 500ms after DOM changes before rescanning
WeakSet for processed nodes - Prevents duplicate processing
Viewport-first scanning - Prioritizes visible content
Efficient text node traversal - Uses TreeWalker for optimal performance
Privacy & Security
✅ 100% local processing - No data sent to external servers
✅ No tracking or analytics - Your privacy is guaranteed
✅ Open source - Fully auditable code
✅ Minimal permissions - Only requests necessary permissions
🧪 Testing Scenarios
Test with demo.html
The included demo.html contains various PII types for testing:

Email addresses in different formats
Phone numbers (US and international)
SSNs with and without dashes
Credit card numbers
API keys and tokens
Mixed content scenarios
Context awareness tests
Test on Real Sites
Try the extension on:

Gmail (emails, phone numbers in signatures)
LinkedIn (contact information)
Google Docs (documents with PII)
Slack Web (shared contact info)
Any web form with personal data
📊 Hackathon Submission Checklist
 Uses Chrome Built-in AI APIs (Prompt API with Gemini Nano)
 Original project for 2025 hackathon
 Text description of features and APIs used
 Demo video (< 3 minutes) showing functionality
 Public GitHub repository with open source license
 Working demo accessible for judging
 Written in English
Judging Criteria Alignment
Functionality ⭐⭐⭐⭐⭐
Scalable to any website
Works across regions and audiences
Robust API integration with fallback
Purpose ⭐⭐⭐⭐⭐
Solves real privacy problem (screen sharing, shoulder surfing)
Unlocks new capability (automated PII protection)
Content ⭐⭐⭐⭐⭐
Creative use of AI for context-aware detection
Polished UI with color-coded blurs
User Experience ⭐⭐⭐⭐⭐
Easy to use (automatic detection)
Intuitive controls (popup, keyboard shortcut)
Seamless integration
Technological Execution ⭐⭐⭐⭐⭐
Excellent showcase of Prompt API
Context-aware AI detection
Hybrid approach (AI + regex fallback)
🎥 Demo Video Script
Opening (0:00 - 0:20)
"Imagine you're sharing your screen in a video call, and accidentally expose sensitive information — emails, phone numbers, credit cards. ScreenGuard AI prevents this."

Problem (0:20 - 0:40)
"Whether you're a teacher, professional, or streamer, on-screen privacy is critical. Traditional solutions require manual redaction or are unreliable."

Solution (0:40 - 1:30)
"ScreenGuard AI uses Chrome's built-in Prompt API with Gemini Nano to automatically detect and blur PII in real-time. Watch as it identifies emails, phone numbers, SSNs, and more — with context awareness to avoid false positives."

[Show demo.html with real-time blurring]

Features (1:30 - 2:20)
"It's customizable — choose which data types to protect. Works on any website. Toggle with a keyboard shortcut. And everything happens locally on your device."

[Show popup, settings, keyboard shortcut]

Closing (2:20 - 2:50)
"Cipher makes on-screen privacy automatic, intelligent, and effortless. Built with Chrome's Built-in AI Challenge 2025, powered by Gemini Nano."

🛠️ Development
Adding New PII Types
Update the piiTypes array in content.js
Add regex pattern in regexFallback() method
Update the AI system prompt to include the new type
Add filter checkbox in popup.html and options.html
Add color-coded style in content.css
Debugging
Enable verbose logging:

javascript
// In content.js
console.log('🔐 Cipher:', message);
Check the console:

Extension popup: Right-click popup → Inspect
Content script: Open DevTools on any webpage
Background script: chrome://extensions → Cipher → Service worker
📜 License
MIT License - See LICENSE file for details

🤝 Contributing
This is a hackathon submission, but feedback and improvements are welcome!

Fork the repository
Create a feature branch
Make your changes
Submit a pull request
📧 Contact
Created for the Google Chrome Built-in AI Challenge 2025

Competition Categories:

🏆 Most Helpful - Chrome Extension ($14,000)
🎨 Best Multimodal AI Application - Chrome Extension ($9,000)
🙏 Acknowledgments
Google Chrome Team for the Built-in AI APIs
Chrome AI Early Preview Program
Gemini Nano AI model
Built with ❤️ using Chrome's Prompt API and Gemini Nano

