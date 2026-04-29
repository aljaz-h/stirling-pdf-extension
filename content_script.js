(function () {
  const config = globalThis.StirlingConfig;
  const uploadPage = chrome.runtime.getURL("pages/upload.html");

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "INJECT_LOCAL_PDF") return false;

    void (async () => {
      try {
        await injectLocalPdfIntoStirling(message);
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, reason: error.message });
      }
    })();

    return true;
  });

  void initialize();

  async function initialize() {
    const baseUrl = await config.getBaseUrl();
    if (!baseUrl) return;

    const url = window.location.href;
    if (url.startsWith(baseUrl)) return;

    const isPdf = document.contentType === "application/pdf";
    if (!isPdf) return;

    if (url.startsWith("http://") || url.startsWith("https://")) {
      window.location.replace(config.buildViewerUrl(baseUrl, url));
      return;
    }

    if (url.startsWith("file://")) {
      const uploadUrl = new URL(uploadPage);
      uploadUrl.searchParams.set("source", url);
      uploadUrl.hash = encodeURIComponent(getFilenameFromUrl(url));
      window.location.replace(uploadUrl.toString());
    }
  }

  function getFilenameFromUrl(fileUrl) {
    try {
      const pathname = new URL(fileUrl).pathname;
      return decodeURIComponent(pathname.split("/").pop() || "document.pdf");
    } catch {
      return "document.pdf";
    }
  }

  async function injectLocalPdfIntoStirling(message) {
    const baseUrl = await config.getBaseUrl();
    if (!baseUrl || !window.location.href.startsWith(baseUrl)) {
      throw new Error("Not on the configured Stirling site yet.");
    }

    const file = base64ToFile(message.base64Data, message.fileName, message.mimeType);
    const deadline = Date.now() + 20000;

    while (Date.now() < deadline) {
      if (tryPopulateFileInputs(file)) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error("No Stirling upload field was found.");
  }

  function tryPopulateFileInputs(file) {
    const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
    if (inputs.length === 0) return false;

    const preferredInputs = inputs.filter((input) => {
      const accept = (input.getAttribute("accept") || "").toLowerCase();
      return !input.disabled && (!accept || accept.includes("pdf") || accept.includes("application/pdf"));
    });

    const candidates = preferredInputs.length > 0 ? preferredInputs : inputs.filter((input) => !input.disabled);
    if (candidates.length === 0) return false;

    let injected = false;
    for (const input of candidates) {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      input.files = dataTransfer.files;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      dispatchDropLikeEvents(input, dataTransfer);
      injected = true;
    }

    return injected;
  }

  function dispatchDropLikeEvents(input, dataTransfer) {
    const targets = [input, input.parentElement, document.body].filter(Boolean);
    for (const target of targets) {
      target.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer }));
      target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer }));
      target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
    }
  }

  function base64ToFile(base64Data, fileName, mimeType) {
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new File([bytes], fileName || "document.pdf", {
      type: mimeType || "application/pdf",
    });
  }
})();
