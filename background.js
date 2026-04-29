const CONFIG_KEY = "stirlingBaseUrl";
const REDIRECT_RULE_ID = 1001;
const UPLOAD_PAGE = chrome.runtime.getURL("pages/upload.html");

const REMOTE_PDF_URL_RE = /^https?:\/\/[^/]+\/[^?#]*\.pdf([?#].*)?$/i;
const LOCAL_PDF_URL_RE = /^file:\/\/\/.+\.pdf([?#].*)?$/i;

chrome.runtime.onInstalled.addListener(async () => {
  await ensureContextMenus();
  await refreshRedirectRule();

  const baseUrl = await getConfiguredBaseUrl();
  if (!baseUrl) {
    chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await refreshRedirectRule();
});

chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== "sync" || !changes[CONFIG_KEY]) return;
  await refreshRedirectRule();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  void handleTabUpdated(tabId, changeInfo, tab);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  void handleContextMenuClick(info, tab);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "OPEN_UPLOAD_TAB") {
    openUploadTab(message.fileUrl)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, reason: error.message }));
    return true;
  }

  if (message.type === "OPEN_IN_STIRLING_UI") {
    openInStirlingUi(message, sender.tab?.id)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, reason: error.message }));
    return true;
  }

  if (message.type === "REDIRECT_URL") {
    redirectUrl(message.url)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, reason: error.message }));
    return true;
  }

  if (message.type === "GET_STIRLING_CONFIG") {
    getConfiguredBaseUrl()
      .then((baseUrl) => sendResponse({ ok: true, baseUrl }))
      .catch((error) => sendResponse({ ok: false, reason: error.message }));
    return true;
  }

  return false;
});

async function handleTabUpdated(tabId, changeInfo, tab) {
  if (changeInfo.status !== "loading" && !changeInfo.url) return;

  const baseUrl = await getConfiguredBaseUrl();
  if (!baseUrl) return;

  const url = changeInfo.url || tab.url;
  if (!url) return;
  if (url.startsWith(baseUrl) || url.startsWith(UPLOAD_PAGE)) return;

  if (REMOTE_PDF_URL_RE.test(url)) {
    const viewerUrl = buildViewerUrl(baseUrl, url);
    chrome.tabs.update(tabId, { url: viewerUrl });
    return;
  }

  if (LOCAL_PDF_URL_RE.test(url)) {
    const uploadUrl = buildUploadUrl(url);
    chrome.tabs.update(tabId, { url: uploadUrl });
  }
}

async function handleContextMenuClick(info, tab) {
  switch (info.menuItemId) {
    case "open-pdf-link": {
      const url = info.linkUrl;
      if (!url) return;
      if (url.startsWith("file://")) {
        await openUploadTab(url, tab);
      } else {
        await openInStirling(url, tab);
      }
      break;
    }
    case "open-current-page": {
      const url = tab?.url;
      if (!url) return;
      if (url.startsWith("file://")) {
        await openUploadTab(url, tab);
      } else {
        await openInStirling(url, tab);
      }
      break;
    }
    case "open-pdf-frame": {
      const url = info.frameUrl || info.srcUrl;
      if (!url) return;
      if (url.startsWith("file://")) {
        await openUploadTab(url, tab);
      } else {
        await openInStirling(url, tab);
      }
      break;
    }
  }
}

async function ensureContextMenus() {
  await chrome.contextMenus.removeAll();

  chrome.contextMenus.create({
    id: "open-pdf-link",
    title: "Open in Stirling PDF",
    contexts: ["link"],
  });

  chrome.contextMenus.create({
    id: "open-current-page",
    title: "Open current page in Stirling PDF",
    contexts: ["page"],
  });

  chrome.contextMenus.create({
    id: "open-pdf-frame",
    title: "Open in Stirling PDF",
    contexts: ["frame"],
  });
}

async function refreshRedirectRule() {
  const baseUrl = await getConfiguredBaseUrl();
  const host = baseUrl ? new URL(baseUrl).hostname : null;

  const addRules = [];
  if (baseUrl && host) {
    addRules.push({
      id: REDIRECT_RULE_ID,
      priority: 1,
      action: {
        type: "redirect",
        redirect: {
          regexSubstitution: `${baseUrl}/view?url=\\0`,
        },
      },
      condition: {
        regexFilter: "^https?://[^/]+/[^?#]*\\.[Pp][Dd][Ff]([?#].*)?$",
        resourceTypes: ["main_frame"],
        excludedRequestDomains: [host],
        excludedInitiatorDomains: [host],
      },
    });
  }

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [REDIRECT_RULE_ID],
    addRules,
  });
}

async function redirectUrl(url) {
  if (!url) {
    throw new Error("Invalid URL");
  }

  if (url.startsWith("file://")) {
    await openUploadTab(url);
    return;
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    await openInStirling(url, null);
    return;
  }

  throw new Error("Invalid URL");
}

async function openInStirling(originalUrl, tab) {
  const baseUrl = await requireConfiguredBaseUrl();
  if (originalUrl.startsWith(baseUrl)) return;

  const viewerUrl = buildViewerUrl(baseUrl, originalUrl);
  if (tab?.id && !tab.url?.startsWith(baseUrl)) {
    await updateTab(tab.id, viewerUrl);
  } else {
    await createTab(viewerUrl);
  }
}

async function openUploadTab(fileUrl = null, tab = null) {
  const targetUrl = buildUploadUrl(fileUrl);
  if (tab?.id) {
    await updateTab(tab.id, targetUrl);
  } else {
    await createTab(targetUrl);
  }
}

function buildUploadUrl(fileUrl = null) {
  if (!fileUrl) return UPLOAD_PAGE;

  const uploadUrl = new URL(UPLOAD_PAGE);
  uploadUrl.searchParams.set("source", fileUrl);
  uploadUrl.hash = encodeURIComponent(getFilenameFromUrl(fileUrl));
  return uploadUrl.toString();
}

function getFilenameFromUrl(fileUrl) {
  try {
    const pathname = new URL(fileUrl).pathname;
    return decodeURIComponent(pathname.split("/").pop() || "document.pdf");
  } catch {
    return "document.pdf";
  }
}

async function openInStirlingUi(message, currentTabId) {
  const baseUrl = await requireConfiguredBaseUrl();
  const tabId = await openOrReuseTab(baseUrl, currentTabId);
  await waitForTabLoad(tabId);
  await deliverFileToTab(tabId, {
    type: "INJECT_LOCAL_PDF",
    fileName: message.fileName,
    mimeType: message.mimeType,
    base64Data: message.base64Data,
  });
}

async function openOrReuseTab(url, currentTabId) {
  if (currentTabId) {
    return updateTab(currentTabId, url);
  }
  return createTab(url);
}

function waitForTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(handleUpdated);
      reject(new Error("Timed out waiting for Stirling to load."));
    }, 20000);

    const handleUpdated = (updatedTabId, changeInfo) => {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
      clearTimeout(timeoutId);
      chrome.tabs.onUpdated.removeListener(handleUpdated);
      resolve();
    };

    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        clearTimeout(timeoutId);
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (tab?.status === "complete") {
        clearTimeout(timeoutId);
        resolve();
        return;
      }

      chrome.tabs.onUpdated.addListener(handleUpdated);
    });
  });
}

function deliverFileToTab(tabId, payload) {
  let attempts = 0;

  return new Promise((resolve, reject) => {
    const trySend = () => {
      attempts += 1;

      chrome.tabs.sendMessage(tabId, payload, (response) => {
        if (chrome.runtime.lastError) {
          if (attempts < 30) {
            setTimeout(trySend, 500);
            return;
          }
          reject(new Error("Stirling page did not accept the file handoff."));
          return;
        }

        if (response?.ok) {
          resolve();
          return;
        }

        if (attempts < 30) {
          setTimeout(trySend, 500);
          return;
        }

        reject(new Error(response?.reason || "Stirling could not accept the local PDF."));
      });
    };

    trySend();
  });
}

async function getConfiguredBaseUrl() {
  const result = await chrome.storage.sync.get(CONFIG_KEY);
  return normalizeBaseUrl(result[CONFIG_KEY] || "");
}

async function requireConfiguredBaseUrl() {
  const baseUrl = await getConfiguredBaseUrl();
  if (baseUrl) return baseUrl;

  chrome.runtime.openOptionsPage();
  throw new Error("Set your Stirling URL in the extension settings first.");
}

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

function updateTab(tabId, url) {
  return new Promise((resolve, reject) => {
    chrome.tabs.update(tabId, { url }, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!tab?.id) {
        reject(new Error("Unable to update the tab."));
        return;
      }
      resolve(tab.id);
    });
  });
}

function createTab(url) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url }, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!tab?.id) {
        reject(new Error("Unable to create the tab."));
        return;
      }
      resolve(tab.id);
    });
  });
}
