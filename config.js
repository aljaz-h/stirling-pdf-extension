(function () {
  const CONFIG_KEY = "stirlingBaseUrl";

  function normalizeBaseUrl(value) {
    if (!value) return "";

    try {
      const url = new URL(String(value).trim());
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return "";
      }
      url.hash = "";
      url.search = "";
      return url.href.replace(/\/+$/, "");
    } catch {
      return "";
    }
  }

  function buildViewerUrl(baseUrl, originalUrl) {
    return `${baseUrl}/view?url=${encodeURIComponent(originalUrl)}`;
  }

  async function getBaseUrl() {
    const result = await chrome.storage.sync.get(CONFIG_KEY);
    return normalizeBaseUrl(result[CONFIG_KEY] || "");
  }

  async function saveBaseUrl(value) {
    const normalized = normalizeBaseUrl(value);
    if (!normalized) {
      throw new Error("Enter a valid http:// or https:// Stirling URL.");
    }
    await chrome.storage.sync.set({ [CONFIG_KEY]: normalized });
    return normalized;
  }

  function isValidBaseUrl(value) {
    return Boolean(normalizeBaseUrl(value));
  }

  globalThis.StirlingConfig = {
    CONFIG_KEY,
    normalizeBaseUrl,
    buildViewerUrl,
    getBaseUrl,
    saveBaseUrl,
    isValidBaseUrl,
  };
})();
