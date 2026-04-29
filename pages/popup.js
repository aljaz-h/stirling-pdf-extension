const config = globalThis.StirlingConfig;
const uploadPage = chrome.runtime.getURL("pages/upload.html");

const statusText = document.getElementById("statusText");
const configuredUrl = document.getElementById("configuredUrl");
const urlInput = document.getElementById("urlInput");
const goBtn = document.getElementById("goBtn");
const uploadLocalBtn = document.getElementById("uploadLocalBtn");
const openStirlingBtn = document.getElementById("openStirlingBtn");
const openSettingsBtn = document.getElementById("openSettingsBtn");

uploadLocalBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: uploadPage });
  window.close();
});

openStirlingBtn.addEventListener("click", async () => {
  const baseUrl = await config.getBaseUrl();
  if (!baseUrl) {
    await chrome.runtime.openOptionsPage();
    window.close();
    return;
  }

  chrome.tabs.create({ url: baseUrl });
  window.close();
});

openSettingsBtn.addEventListener("click", async () => {
  await chrome.runtime.openOptionsPage();
  window.close();
});

goBtn.addEventListener("click", () => {
  void navigateUrl();
});

urlInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    void navigateUrl();
  }
});

void initialize();

async function initialize() {
  const baseUrl = await config.getBaseUrl();
  if (baseUrl) {
    statusText.innerHTML = `Auto-redirect active to <strong>${escapeHtml(new URL(baseUrl).host)}</strong>`;
    configuredUrl.textContent = baseUrl;
    configuredUrl.href = baseUrl;
  } else {
    statusText.textContent = "Set your Stirling URL in Settings to enable redirects.";
    configuredUrl.textContent = "Not configured";
    configuredUrl.removeAttribute("href");
    openStirlingBtn.disabled = true;
  }
}

async function navigateUrl() {
  const baseUrl = await config.getBaseUrl();
  if (!baseUrl) {
    await chrome.runtime.openOptionsPage();
    window.close();
    return;
  }

  const raw = urlInput.value.trim();
  if (!raw) return;

  if (raw.startsWith("file://") || raw.startsWith("blob:") || raw.startsWith("data:")) {
    chrome.tabs.create({ url: uploadPage });
    window.close();
    return;
  }

  const url = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
  chrome.tabs.create({ url: config.buildViewerUrl(baseUrl, url) });
  window.close();
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
