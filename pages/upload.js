const STIRLING_BASE = "https://pdf.arcont.si";
const VIEW_ENDPOINT = `${STIRLING_BASE}/view`;
const STORAGE_UPLOAD_ENDPOINT = `${STIRLING_BASE}/api/v1/storage/files`;
const LEGACY_UPLOAD_ENDPOINT = `${STIRLING_BASE}/api/v1/general/upload-and-save`;

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

uploadBtn.addEventListener("click", async () => {
  await startUpload();
});

initializeLocalSource();

async function initializeLocalSource() {
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

  uploadInProgress = true;
  uploadBtn.disabled = true;
  progressWrap.classList.add("visible");
  clearStatus();

  try {
    await openInStirlingUi(selectedFile);
    showStatus("success", "Opening the PDF in Stirling...");
  } catch (err) {
    try {
      const resultUrl = await uploadFile(selectedFile);
      showStatus("success", "Uploaded. Opening in viewer...");
      setTimeout(() => {
        window.location.href = resultUrl;
      }, 800);
    } catch (uploadError) {
      showStatus(
        "error",
        `Upload failed: ${uploadError.message}<br><br>Fallback: <a href="${STIRLING_BASE}" target="_blank" style="color:inherit">Open Stirling PDF manually</a> and drag your file there.`
      );
      uploadBtn.disabled = false;
      progressWrap.classList.remove("visible");
    }
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
  });
}

function uploadFile(file) {
  return tryUploadStrategies(file);
}

async function tryUploadStrategies(file) {
  const attempts = [];

  const strategies = [
    {
      label: "server storage API",
      run: () => uploadWithStorageApi(file),
    },
    {
      label: "legacy upload API",
      run: () => uploadWithLegacyApi(file),
    },
  ];

  for (const strategy of strategies) {
    try {
      return await strategy.run();
    } catch (error) {
      attempts.push(`${strategy.label}: ${error.message}`);
    }
  }

  throw new Error(attempts.join(" | "));
}

function uploadWithStorageApi(file) {
  const formData = new FormData();
  formData.append("file", file, file.name);

  return sendMultipartRequest({
    endpoint: STORAGE_UPLOAD_ENDPOINT,
    formData,
    onSuccess: (responseText) => {
      const json = safeJsonParse(responseText);
      const fileId = json?.id;
      if (!fileId) {
        throw new Error("Upload succeeded but no stored file ID was returned.");
      }

      const sourceUrl = `${STIRLING_BASE}/api/v1/storage/files/${encodeURIComponent(fileId)}/download?inline=true`;
      return `${VIEW_ENDPOINT}?url=${encodeURIComponent(sourceUrl)}`;
    },
  });
}

function uploadWithLegacyApi(file) {
  const formData = new FormData();
  formData.append("fileInput", file, file.name);

  return sendMultipartRequest({
    endpoint: LEGACY_UPLOAD_ENDPOINT,
    formData,
    onSuccess: (responseText) => {
      const json = safeJsonParse(responseText);
      if (json?.url) {
        return json.url.startsWith("http") ? json.url : STIRLING_BASE + json.url;
      }
      if (json?.fileId) {
        return `${VIEW_ENDPOINT}?fileId=${encodeURIComponent(json.fileId)}`;
      }
      return STIRLING_BASE;
    },
  });
}

function sendMultipartRequest({ endpoint, formData, onSuccess }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.withCredentials = true;

    xhr.upload.addEventListener("progress", (e) => {
      if (!e.lengthComputable) return;

      const pct = Math.round((e.loaded / e.total) * 100);
      progressBar.style.width = `${pct}%`;
      progressPct.textContent = `${pct}%`;
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(onSuccess(xhr.responseText));
        } catch (error) {
          reject(error);
        }
        return;
      }

      reject(new Error(formatHttpError(xhr)));
    });

    xhr.addEventListener("error", () => reject(new Error("Network error. Is your Stirling instance reachable?")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled.")));
    xhr.open("POST", endpoint);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.send(formData);
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

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function formatHttpError(xhr) {
  const statusLine = `HTTP ${xhr.status}${xhr.statusText ? `: ${xhr.statusText}` : ""}`;
  const detail = extractErrorDetail(xhr.responseText);
  return detail ? `${statusLine} - ${detail}` : statusLine;
}

function extractErrorDetail(responseText) {
  if (!responseText) return "";

  const json = safeJsonParse(responseText);
  if (json) {
    const candidates = [
      json.message,
      json.error,
      json.reason,
      json.details,
      json.path,
    ].filter(Boolean);
    if (candidates.length > 0) {
      return candidates.join(" | ");
    }
  }

  const compact = String(responseText).replace(/\s+/g, " ").trim();
  if (!compact) return "";
  return compact.slice(0, 220);
}

function showStatus(type, html) {
  statusBox.className = `status ${type}`;
  statusBox.innerHTML = html;
}

function clearStatus() {
  statusBox.className = "status";
  statusBox.innerHTML = "";
}
