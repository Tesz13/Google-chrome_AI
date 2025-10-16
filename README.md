# ScreenGuard AI - Real-Time Privacy for Your Screen


## Problem
Users often expose sensitive information during screen sharing or in shared workspaces...


## Solution
ScreenGuard AI uses Chrome's built-in Gemini Nano model (via the Prompt API) to automatically detect and blur personally identifiable information in real-time.


## How It Works
1. Content script scans DOM for text
2. Text is sent to Prompt API with instructions to identify PII
3. Detected PII is highlighted and blurred on the page
4. Everything runs locally on your device - no data leaves your browser


## APIs Used
- **Chrome Prompt API** – For intelligent PII detection using Gemini Nano
- (Optional) Chrome Translator API – For multilingual support


## Installation
1. Download Chrome Canary...
2. Enable experimental AI flags...
3. Clone this repo...
