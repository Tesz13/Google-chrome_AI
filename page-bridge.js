// page-bridge.js (in main world)
(() => {
  let sessionPromise = null;

  async function getAPI() {
    if (typeof LanguageModel !== "undefined") {
      return {
        kind: "standard",
        availability: () => LanguageModel.availability(),
        create: (opts) => LanguageModel.create(opts)
      };
    }
    // Optional legacy fallback (older trial builds)
    const legacy = chrome?.aiOriginTrial?.languageModel;
    if (legacy) {
      return {
        kind: "legacy",
        availability: () => legacy.availability(),
        create: (opts) => legacy.create(opts)
      };
    }
    throw new Error("Prompt API unavailable in page context");
  }

  async function ensureSession() {
    if (sessionPromise) return sessionPromise;
    sessionPromise = (async () => {
      const api = await getAPI();
      const avail = await api.availability();
      if (avail === "unavailable") throw new Error("Model unavailable");

      return api.create({
        monitor(m) {
          m.addEventListener("downloadprogress", (e) => {
            window.postMessage({ type: "LM_DOWNLOAD_PROGRESS", progress: e.loaded }, "*");
          });
        }
      });
    })();
    return sessionPromise;
  }

  async function detectPII(text) {
    const session = await ensureSession();
    const systemPrompt = `You are a PII detector. Respond with ONLY valid JSON:
{"pii_found":[{"type":"email","value":"user@example.com","start":0,"end":16}]}
Types: email, phone, ssn, credit_card, address, password, api_key.
If none: {"pii_found":[]}`;
    // You can prepend a system instruction by formatting your user prompt accordingly:
    const reply = await session.prompt(`${systemPrompt}\n\nTEXT:\n${text}\n\nJSON ONLY:`);

    // Defensive JSON parse
    try {
      const parsed = JSON.parse(reply);
      if (!parsed || !Array.isArray(parsed.pii_found)) throw 0;
      return parsed;
    } catch {
      return { pii_found: [] };
    }
  }

  window.addEventListener("message", async (evt) => {
    const msg = evt.data;
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "PII_DETECT" && typeof msg.text === "string") {
      try {
        const result = await detectPII(msg.text);
        window.postMessage({ type: "PII_DETECT_RESULT", id: msg.id, result }, "*");
      } catch (err) {
        window.postMessage({ type: "PII_DETECT_ERROR", id: msg.id, error: err?.message || String(err) }, "*");
      }
    }

    if (msg.type === "LM_CHECK") {
      try {
        const api = await getAPI();
        const avail = await api.availability();
        window.postMessage({ type: "LM_CHECK_RESULT", avail, kind: api.kind }, "*");
      } catch (e) {
        window.postMessage({ type: "LM_CHECK_RESULT", avail: "unavailable", kind: "none", error: e?.message }, "*");
      }
    }
  });
  
    async function classifyImage(blob) {
    const session = await ensureSession(); // reuse the same session you created for text
    const prompt = [
        { text: "You are a safety classifier. Decide if this image is unsafe for minors." },
        { text: "Return STRICT JSON: {\"unsafe\": true|false, \"categories\": [\"adult_nudity\",\"explicit\",\"suggestive\",\"violence\",\"graphic\",\"none\"], \"confidence\": 0..1}" },
        { image: blob }
    ];
    const res = await session.prompt(prompt);
    try {
        return JSON.parse(res.trim());
    } catch {
        return { unsafe: null, categories: [], confidence: 0, reason: "parse_error" };
    }
    }

    window.addEventListener("message", async (evt) => {
    const msg = evt.data;
    if (!msg || typeof msg !== "object") return;

    // ...existing handlers...

    if (msg.type === "IMG_CLASSIFY" && msg.blob instanceof Blob) {
        try {
        const result = await classifyImage(msg.blob);
        window.postMessage({ type: "IMG_CLASSIFY_RESULT", id: msg.id, result }, "*");
        } catch (err) {
        window.postMessage({ type: "IMG_CLASSIFY_ERROR", id: msg.id, error: err?.message || String(err) }, "*");
        }
    }
    });

  // Optional: announce that the bridge is live
  window.postMessage({ type: "LM_BRIDGE_READY" }, "*");
})();

