const config = globalThis.StirlingConfig;

const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const fileInfo = document.getElementById("fileInfo");
const fileNameEl = document.getElementById("fileName");
const fileSizeEl = document.getElementById("fileSize");
const uploadBtn = document.getElementById("uploadBtn");
const progressWrap = document.getElementById("progressWrap");
const progressBar = document.getElementById("progressBar");
const progressPct = document.getElementById("progressPct");
const statusBox = document.getElementById("statusBox");
const localNotice = document.getElementById("localNotice");
const localFilenameEl = document.getElementById("localFilename");
const sourceUrl = new URLSearchParams(window.location.search).get("source");
const openSettingsBtn = document.getElementById("openSettingsBtn");

let selectedFile = null;
let uploadInProgress = false;

const hint = window.location.hash ? decodeURIComponent(window.location.hash.slice(1)) : null;
if (hint) {
  localNotice.classList.add("visible");
  localFilenameEl.textContent = `"${hint}"`;
}

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});

["dragleave", "dragend"].forEach((eventName) => {
  dropZone.addEventListener(eventName, () => dropZone.classList.remove("drag-over"));
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  const file = e.dataTransfer?.files?.[0];
  if (file) handleFile(file);
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) handleFile(file);
});

uploadBtn.addEventListener("click", () => {
  void startUpload();
});

openSettingsBtn.addEventListener("click", async () => {
  await chrome.runtime.openOptionsPage();
});

void initializeLocalSource();

async function initializeLocalSource() {
  const baseUrl = await config.getBaseUrl();
  if (!baseUrl) {
    showStatus(
      "error",
      `Set your Stirling URL in <strong>Extension Settings</strong> before opening local PDFs.`
    );
    uploadBtn.disabled = true;
    return;
  }

  if (!sourceUrl) return;

  showStatus("success", "Reading the local PDF you opened in Edge...");

  try {
    const file = await loadLocalPdf(sourceUrl, hint);
    handleFile(file);
    if (selectedFile) {
      await startUpload();
    }
  } catch (err) {
    showStatus(
      "error",
      `${err.message}<br><br>Enable <strong>Allow access to file URLs</strong> for this extension in <code>edge://extensions</code>, then reload it and try again.`
    );
  }
}

function handleFile(file) {
  if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
    showStatus("error", "Please select a PDF file.");
    return;
  }

  if (file.size > 100 * 1024 * 1024) {
    showStatus("error", "File is too large. Maximum size is 100 MB.");
    return;
  }

  selectedFile = file;
  fileNameEl.textContent = file.name;
  fileSizeEl.textContent = formatBytes(file.size);
  fileInfo.classList.add("visible");
  uploadBtn.disabled = false;
  clearStatus();
}

async function startUpload() {
  if (!selectedFile || uploadInProgress) return;

  const baseUrl = await config.getBaseUrl();
  if (!baseUrl) {
    showStatus("error", "Set your Stirling URL in Extension Settings first.");
    uploadBtn.disabled = true;
    return;
  }

  uploadInProgress = true;
  uploadBtn.disabled = true;
  progressWrap.classList.add("visible");
  clearStatus();

  try {
    await openInStirlingUi(selectedFile);
    showStatus("success", "Opening the PDF in Stirling...");
  } finally {
    uploadInProgress = false;
  }
}

async function loadLocalPdf(fileUrl, fallbackName) {
  let response;

  try {
    response = await fetch(fileUrl);
  } catch {
    throw new Error("The extension could not read the local file automatically.");
  }

  if (!response.ok) {
    throw new Error(`The local file could not be read (HTTP ${response.status}).`);
  }

  const blob = await response.blob();
  const name = getFilename(fileUrl, fallbackName);
  return new File([blob], name, { type: blob.type || "application/pdf" });
}

function openInStirlingUi(file) {
  return new Promise((resolve, reject) => {
    fileToBase64(file)
      .then((base64Data) => {
        chrome.runtime.sendMessage(
          {
            type: "OPEN_IN_STIRLING_UI",
            fileName: file.name,
            mimeType: file.type || "application/pdf",
            base64Data,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }

            if (response?.ok) {
              resolve();
              return;
            }

            reject(new Error(response?.reason || "Stirling UI handoff failed."));
          }
        );
      })
      .catch(reject);
  }).catch((error) => {
    showStatus(
      "error",
      `${error.message}<br><br>Fallback: open your Stirling site manually and drag the PDF there.`
    );
    uploadBtn.disabled = false;
    progressWrap.classList.remove("visible");
    throw error;
  });
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFilename(fileUrl, fallbackName) {
  if (fallbackName) return fallbackName;
  try {
    return decodeURIComponent(new URL(fileUrl).pathname.split("/").pop() || "document.pdf");
  } catch {
    return "document.pdf";
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64Data = result.includes(",") ? result.split(",")[1] : "";
      if (!base64Data) {
        reject(new Error("The local PDF could not be prepared for Stirling."));
        return;
      }
      resolve(base64Data);
    };
    reader.onerror = () => reject(new Error("The local PDF could not be prepared for Stirling."));
    reader.readAsDataURL(file);
  });
}

function showStatus(type, html) {
  statusBox.className = `status ${type}`;
  statusBox.innerHTML = html;
}

function clearStatus() {
  statusBox.className = "status";
  statusBox.innerHTML = "";
}
