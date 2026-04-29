const config = globalThis.StirlingConfig;
const uploadPage = chrome.runtime.getURL("pages/upload.html");

const statusCard = document.getElementById("statusCard");
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
    statusCard.classList.remove("inactive");
    statusText.textContent = "Auto-redirect is active for:";
    configuredUrl.textContent = baseUrl.replace(/^https?:\/\//, "");
    configuredUrl.href = baseUrl;
    configuredUrl.title = baseUrl;
  } else {
    statusCard.classList.add("inactive");
    statusText.textContent = "Set your Stirling URL in Settings to enable redirects.";
    configuredUrl.textContent = "No Stirling instance configured yet";
    configuredUrl.removeAttribute("href");
    configuredUrl.removeAttribute("title");
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
