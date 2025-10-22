# 🚀 ScreenGuard AI - Quick Start Guide

Get up and running in 5 minutes!

---

## ⚡ Prerequisites

1. **Download Chrome Canary**: https://www.google.com/chrome/canary/
2. **Join Early Preview Program**: https://developer.chrome.com/docs/ai/join-epp

---

## 🔧 Setup (3 Steps)

### Step 1: Enable Chrome AI Flags

Open Chrome Canary and navigate to `chrome://flags`

Enable these THREE flags:

1. **Prompt API for Gemini Nano**
   ```
   chrome://flags/#prompt-api-for-gemini-nano
   → Set to: Enabled
   ```

2. **Optimization Guide On Device Model**
   ```
   chrome://flags/#optimization-guide-on-device-model
   → Set to: Enabled BypassPerfRequirement
   ```

3. **AI Language Model API**
   ```
   chrome://flags/#ai-language-model-api
   → Set to: Enabled
   ```

**Restart Chrome Canary** after enabling flags.

---

### Step 2: Wait for Gemini Nano Download

1. Open Chrome DevTools (F12)
2. In Console, run:
   ```javascript
   (await ai.languageModel.capabilities()).available
   ```

3. If it says `"readily"` ✅ - You're ready!
4. If it says `"after-download"` ⏳ - Wait a few minutes for Gemini Nano to download
5. If it says `"no"` ❌ - Double-check flags and restart Chrome

---

### Step 3: Load the Extension

1. Go to `chrome://extensions/`
2. Enable **Developer mode** (toggle top-right)
3. Click **Load unpacked**
4. Select the `screenguard-ai` folder
5. You should see the 🛡️ icon in your toolbar!

---

## 🧪 Test It

1. Open `demo.html` in your browser
2. The extension should automatically blur PII
3. Click the extension icon to see stats
4. Press `Ctrl+Shift+P` to toggle on/off

---

## 📝 File Checklist

Make sure you have all these files:

```
✅ manifest.json
✅ background.js
✅ content.js
✅ content.css
✅ popup.html
✅ popup.js
✅ options.html
✅ options.js
✅ demo.html
✅ icon.png (create a 128x128 icon)
✅ README.md
```

---

## 🎨 Create an Icon (Quick)

You need a 128x128px `icon.png`. Quick options:

### Option 1: Use an Emoji
1. Go to https://emojipedia.org/shield/
2. Right-click the shield emoji → Save image
3. Resize to 128x128px
4. Save as `icon.png`

### Option 2: Use a Generator
1. Go to https://www.favicon.cc/
2. Draw a shield or lock icon
3. Export as 128x128 PNG
4. Save as `icon.png`

### Option 3: Simple SVG → PNG
Create a file called `icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="20" fill="url(#grad)"/>
  <path d="M 64 25 L 90 40 L 90 70 Q 90 85 64 100 Q 38 85 38 70 L 38 40 Z" 
        fill="white" opacity="0.9"/>
  <text x="64" y="75" font-size="40" text-anchor="middle" fill="#667eea">🛡️</text>
</svg>
```

Then convert to PNG using any online SVG→PNG converter.

---

## ❓ Troubleshooting

### "AI not available"
- Ensure you're using Chrome Canary
- Check all three flags are enabled
- Restart Chrome completely
- Wait for Gemini Nano to download (check DevTools console)

### Extension not loading
- Make sure `manifest.json` has no syntax errors
- Check Chrome Extensions page for error messages
- Try reloading the extension

### Blurs not appearing
- Open DevTools Console
- Look for ScreenGuard messages
- Check if PII was detected: `console.log('Found X items')`
- Try the demo.html page first

### "Content script not available"
- Refresh the webpage after installing extension
- Some pages (chrome://, edge://) are restricted and won't work

---

## 🎥 Recording Demo Video

Use these tools to record your 3-minute demo:

- **OBS Studio** (free, cross-platform): https://obsproject.com/
- **Loom** (easy, web-based): https://www.loom.com/
- **QuickTime** (Mac): Built-in screen recorder
- **Xbox Game Bar** (Windows): Press Win+G

### Demo Structure:
1. **0:00-0:30** - Introduce the problem
2. **0:30-1:30** - Show it working (demo.html + real sites)
3. **1:30-2:15** - Show features (popup, filters, keyboard shortcut)
4. **2:15-2:45** - Explain AI technology (Prompt API, Gemini Nano)
5. **2:45-3:00** - Call to action / closing

Upload to YouTube as **Unlisted** and include the link in your submission.

---

## 📤 Submission Checklist

Before submitting to Devpost:

- [ ] All code files included
- [ ] Extension loads without errors
- [ ] Demo video recorded (< 3 minutes)
- [ ] Video uploaded to YouTube/Vimeo
- [ ] GitHub repository created (public)
- [ ] Repository has open source license (MIT)
- [ ] README.md explains features and APIs used
- [ ] Testing instructions in README
- [ ] Extension works on demo.html
- [ ] Tested on at least 2-3 real websites

---

## 🏆 Winning Tips

### Stand Out in the Competition

1. **Show Real Use Cases**: Demo on Gmail, Google Docs, LinkedIn
2. **Emphasize AI**: Explain context awareness (Johns Hopkins vs John's email)
3. **Highlight Privacy**: All local, no data sent anywhere
4. **Polish the UI**: Make it look professional
5. **Performance**: Show it works smoothly even on complex pages
6. **Error Handling**: Show regex fallback when AI unavailable

### Target These Categories

**Most Helpful** ($14,000):
- Focus on the practical problem solving
- Show diverse use cases (meetings, public computers, streaming)
- Emphasize ease of use

**Best Multimodal** ($9,000):
- If you add image PII detection, highlight this!
- Show detecting PII in screenshots or embedded images
- Use the new multimodal Prompt API features

---

## 🔗 Important Links

- **Devpost Submission**: https://googlechromeai2025.devpost.com/
- **Chrome AI Docs**: https://developer.chrome.com/docs/ai
- **Early Preview Program**: https://developer.chrome.com/docs/ai/join-epp
- **Prompt API Guide**: https://developer.chrome.com/docs/ai/built-in-apis
- **Sample Code**: https://github.com/GoogleChrome/chrome-extensions-samples

---

## 💡 Enhancement Ideas (Optional)

If you have extra time:

1. **Multimodal Detection**: Add image PII detection using Prompt API with image input
2. **Privacy Report**: Generate summary of PII found on page
3. **Whitelist**: Let users mark trusted sites
4. **Intensity Slider**: Adjust blur strength
5. **Export Settings**: Share filter configurations
6. **Notifications**: Alert when PII detected
7. **Statistics Dashboard**: Track PII blocked over time

---

## 🎯 Final Pre-Submission Test

Run through this checklist:

1. [ ] Load extension in fresh Chrome Canary instance
2. [ ] Open demo.html - see blurs immediately
3. [ ] Click extension icon - see correct count
4. [ ] Toggle filters - blurs update
5. [ ] Press Ctrl+Shift+P - blurs disappear/reappear
6. [ ] Open Gmail/Docs - extension works
7. [ ] Open Settings page - all options work
8. [ ] Check Console - no errors
9. [ ] Test on restricted page (chrome://) - shows appropriate message
10. [ ] Unload and reload extension - settings persist

---

## 🆘 Need Help?

If you get stuck:

1. Check the main README.md for detailed docs
2. Review Chrome AI documentation
3. Check DevTools Console for errors
4. Join Chrome Extensions Discord
5. Review other hackathon submissions for ideas

---

**Good luck with your submission! 🚀🛡️**

Remember: The judges are looking for creativity, functionality, and good use of the Prompt API. Focus on making something that genuinely solves a real problem!