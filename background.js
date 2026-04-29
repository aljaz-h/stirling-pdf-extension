const STIRLING_BASE = "https://pdf.arcont.si";
const STIRLING_VIEW = `${STIRLING_BASE}/view`;
const UPLOAD_PAGE = chrome.runtime.getURL("pages/upload.html");

const REMOTE_PDF_URL_RE = /^https?:\/\/[^/]+\/[^?#]*\.pdf([?#].*)?$/i;
const LOCAL_PDF_URL_RE = /^file:\/\/\/.+\.pdf([?#].*)?$/i;

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "loading" && !changeInfo.url) return;

  const url = changeInfo.url || tab.url;
  if (!url) return;
  if (url.startsWith(STIRLING_BASE) || url.startsWith(UPLOAD_PAGE)) return;

  if (REMOTE_PDF_URL_RE.test(url)) {
    const viewerUrl = `${STIRLING_VIEW}?url=${encodeURIComponent(url)}`;
    console.log("[Stirling PDF] remote PDF intercept:", url, "->", viewerUrl);
    chrome.tabs.update(tabId, { url: viewerUrl });
    return;
  }

  if (LOCAL_PDF_URL_RE.test(url)) {
    const uploadUrl = buildUploadUrl(url);
    console.log("[Stirling PDF] local PDF intercept:", url, "->", uploadUrl);
    chrome.tabs.update(tabId, { url: uploadUrl });
  }
});

chrome.runtime.onInstalled.addListener(() => {
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

  console.log("[Stirling PDF] ready.");
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  switch (info.menuItemId) {
    case "open-pdf-link": {
      const url = info.linkUrl;
      if (!url) return;
      if (url.startsWith("file://")) {
        openUploadTab(url, tab);
      } else {
        openInStirling(url, tab);
      }
      break;
    }
    case "open-current-page": {
      const url = tab?.url;
      if (!url) return;
      if (url.startsWith("file://")) {
        openUploadTab(url, tab);
      } else {
        openInStirling(url, tab);
      }
      break;
    }
    case "open-pdf-frame": {
      const url = info.frameUrl || info.srcUrl;
      if (!url) return;
      if (url.startsWith("file://")) {
        openUploadTab(url, tab);
      } else {
        openInStirling(url, tab);
      }
      break;
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "OPEN_UPLOAD_TAB") {
    openUploadTab(message.fileUrl);
    sendResponse({ ok: true });
  }

  if (message.type === "OPEN_IN_STIRLING_UI") {
    openInStirlingUi(message, sender.tab?.id)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, reason: error.message }));
    return true;
  }

  if (message.type === "REDIRECT_URL") {
    const { url } = message;
    if (url && url.startsWith("http")) {
      openInStirling(url, null);
      sendResponse({ ok: true });
    } else if (url && url.startsWith("file://")) {
      openUploadTab(url);
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false, reason: "Invalid URL" });
    }
  }

  return false;
});

function openInStirling(originalUrl, tab) {
  if (originalUrl.startsWith(STIRLING_BASE)) return;

  const viewerUrl = `${STIRLING_VIEW}?url=${encodeURIComponent(originalUrl)}`;
  if (tab?.id && !tab.url?.startsWith(STIRLING_BASE)) {
    chrome.tabs.update(tab.id, { url: viewerUrl });
  } else {
    chrome.tabs.create({ url: viewerUrl });
  }
}

function openUploadTab(fileUrl = null, tab = null) {
  const targetUrl = buildUploadUrl(fileUrl);
  if (tab?.id) {
    chrome.tabs.update(tab.id, { url: targetUrl });
  } else {
    chrome.tabs.create({ url: targetUrl });
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
  const targetUrl = STIRLING_BASE;
  const tabId = await openOrReuseTab(targetUrl, currentTabId);
  await waitForTabLoad(tabId);
  await deliverFileToTab(tabId, {
    type: "INJECT_LOCAL_PDF",
    fileName: message.fileName,
    mimeType: message.mimeType,
    base64Data: message.base64Data,
  });
}

function openOrReuseTab(url, currentTabId) {
  return new Promise((resolve, reject) => {
    const done = (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!tab?.id) {
        reject(new Error("Unable to open the Stirling tab."));
        return;
      }
      resolve(tab.id);
    };

    if (currentTabId) {
      chrome.tabs.update(currentTabId, { url }, done);
    } else {
      chrome.tabs.create({ url }, done);
    }
  });
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
