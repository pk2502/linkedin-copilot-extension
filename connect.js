// Content script that runs only on the web app's /connect-extension page
// (see manifest.json). The page, where the user is already signed in (any
// method, including Google), asks the backend for a token pair dedicated to
// the extension and hands it over with window.postMessage. This script checks
// that the message came from the page itself and stores the tokens.
//
// Content scripts cannot be ES modules, so this file is self-contained.
(() => {
  const PREFIX = "CONNECTPILOT_EXTENSION_";
  const origin = window.location.origin;

  const announceReady = () => window.postMessage({ type: `${PREFIX}READY` }, origin);

  const isToken = (value) =>
    typeof value === "string" && value.length > 20 && value.length < 4096 && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(value);

  window.addEventListener("message", async (event) => {
    // Only accept messages posted by this page, from this origin.
    if (event.source !== window || event.origin !== origin) return;
    const data = event.data;
    if (!data || typeof data.type !== "string" || !data.type.startsWith(PREFIX)) return;

    if (data.type === `${PREFIX}PING`) {
      announceReady();
      return;
    }

    if (data.type === `${PREFIX}TOKENS`) {
      if (!isToken(data.access) || !isToken(data.refresh)) {
        window.postMessage({ type: `${PREFIX}ERROR`, reason: "invalid_tokens" }, origin);
        return;
      }
      try {
        await chrome.storage.local.set({ access_token: data.access, refresh_token: data.refresh });
        window.postMessage({ type: `${PREFIX}CONNECTED` }, origin);
      } catch {
        window.postMessage({ type: `${PREFIX}ERROR`, reason: "storage_failed" }, origin);
      }
    }
  });

  announceReady();
})();
