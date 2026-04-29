// ─── Stirling PDF – Popup Script ──────────────────────────────────────────────

const STIRLING_BASE  = "https://pdf.arcont.si";
const STIRLING_VIEW  = `${STIRLING_BASE}/view`;
const UPLOAD_PAGE    = chrome.runtime.getURL("pages/upload.html");

document.getElementById("uploadLocalBtn").addEventListener("click", () => {
  chrome.tabs.create({ url: UPLOAD_PAGE });
  window.close();
});

document.getElementById("openStirlingBtn").addEventListener("click", () => {
  chrome.tabs.create({ url: STIRLING_BASE });
  window.close();
});

document.getElementById("goBtn").addEventListener("click", navigateUrl);
document.getElementById("urlInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") navigateUrl();
});

function navigateUrl() {
  const raw = document.getElementById("urlInput").value.trim();
  if (!raw) return;

  // Prevent redirecting Stirling itself or file:// blob: etc.
  if (raw.startsWith("file://") || raw.startsWith("blob:") || raw.startsWith("data:")) {
    chrome.tabs.create({ url: UPLOAD_PAGE });
    window.close();
    return;
  }

  const url = raw.startsWith("http") ? raw : `https://${raw}`;
  const viewerUrl = `${STIRLING_VIEW}?url=${encodeURIComponent(url)}`;
  chrome.tabs.create({ url: viewerUrl });
  window.close();
}
