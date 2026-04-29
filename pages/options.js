const config = globalThis.StirlingConfig;

const baseUrlInput = document.getElementById("baseUrlInput");
const saveBtn = document.getElementById("saveBtn");
const openBtn = document.getElementById("openBtn");
const statusBox = document.getElementById("statusBox");
const currentValue = document.getElementById("currentValue");

saveBtn.addEventListener("click", () => {
  void saveSettings();
});

openBtn.addEventListener("click", async () => {
  const baseUrl = await config.getBaseUrl();
  if (!baseUrl) {
    showStatus("error", "Save a valid Stirling URL first.");
    return;
  }

  chrome.tabs.create({ url: baseUrl });
});

baseUrlInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    void saveSettings();
  }
});

void initialize();

async function initialize() {
  const baseUrl = await config.getBaseUrl();
  if (baseUrl) {
    baseUrlInput.value = baseUrl;
  }
  renderCurrentValue(baseUrl);
}

async function saveSettings() {
  const raw = baseUrlInput.value.trim();

  try {
    const saved = await config.saveBaseUrl(raw);
    baseUrlInput.value = saved;
    renderCurrentValue(saved);
    showStatus("success", "Saved. Redirect rules now point at your Stirling instance.");
  } catch (error) {
    showStatus("error", error.message);
  }
}

function renderCurrentValue(baseUrl) {
  currentValue.textContent = baseUrl
    ? `Current value: ${baseUrl}`
    : "Current value: not configured";
}

function showStatus(type, message) {
  statusBox.className = `status ${type}`;
  statusBox.textContent = message;
}
