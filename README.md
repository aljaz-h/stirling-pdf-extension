# Stirling PDF Redirector — Edge Extension

Manifest V3 browser extension for Microsoft Edge (Chromium).  
Automatically redirects PDF URLs to your self-hosted **Stirling PDF** instance at `https://pdf.arcont.si`.

---

## 📁 File Structure

```
stirling-pdf-extension/
├── manifest.json          # MV3 manifest
├── rules.json             # declarativeNetRequest redirect rules
├── background.js          # Service worker (context menus, messaging)
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── pages/
    ├── popup.html         # Toolbar popup UI
    ├── popup.js
    ├── upload.html        # Local file upload page
    └── upload.js
```

---

## 🚀 Installation (Edge)

1. Open Edge and navigate to: `edge://extensions/`
2. Enable **Developer mode** (toggle, top-right)
3. Click **Load unpacked**
4. Select the `stirling-pdf-extension/` folder
5. The extension icon (orange PDF) appears in the toolbar

---

## ✅ How It Works

### Web PDFs (Automatic)

When you navigate to any URL matching:
```
http(s)://anything.com/path/file.pdf[?query]
```

The extension **automatically redirects** the main frame to:
```
https://pdf.arcont.si/view?url=<encoded_original_url>
```

No clicks needed — happens transparently via `declarativeNetRequest`.

**Loop prevention:** The regex explicitly excludes `pdf.arcont.si` as the host, and `excludedInitiatorDomains` is set, so no infinite redirect is possible.

---

### Local PDF Files (Manual Upload)

Browser extensions **cannot read `file://` URLs** — this is a hard sandboxing rule enforced by Chromium. Attempting to redirect `file://` URLs would either silently fail or crash.

**Solution:** A dedicated upload page.

**Two ways to trigger it:**

1. **Toolbar popup** → click "⬆ Upload Local PDF File"
2. **Right-click** any PDF link → "Open in Stirling PDF" (if it's a `file://` link, the upload page opens automatically)

**What happens:**
- A new tab opens at `chrome-extension://.../pages/upload.html`
- User drags & drops or clicks to browse for a `.pdf` file
- The file is `POST`ed to `https://pdf.arcont.si/api/v1/general/upload-and-save`
- On success, the viewer URL is opened

> **Note:** The upload endpoint path may differ depending on your Stirling PDF version. Check your instance's Swagger UI at `https://pdf.arcont.si/swagger-ui` and update `UPLOAD_ENDPOINT` in `pages/upload.js` if needed.

---

## 🔑 Permissions Explained

| Permission | Why it's needed |
|---|---|
| `declarativeNetRequest` | Redirect PDF URLs at the network layer (MV3 standard) |
| `contextMenus` | Add "Open in Stirling PDF" right-click menu |
| `scripting` | Reserved for potential future content script injection |
| `tabs` | Open new tabs for viewer / upload page |
| `storage` | Reserved for future settings (e.g. custom Stirling URL) |
| `host_permissions: http/https` | Required for `declarativeNetRequest` to match external URLs |

---

## 🛡️ What Is NOT Redirected

- `file://` URLs — explicitly excluded (and not matched by the regex)
- `blob:` and `data:` URLs — not HTTP/HTTPS, regex doesn't match
- `https://pdf.arcont.si/*` — excluded by regex and `excludedInitiatorDomains`
- Non-PDF URLs — regex only matches paths ending in `.pdf`

---

## ⚙️ Customisation

### Change the Stirling instance URL

Edit these files and replace `https://pdf.arcont.si`:
- `rules.json` → `regexSubstitution` value
- `rules.json` → `regexFilter` exclusion segment `pdf\\.arcont\\.si`
- `background.js` → `STIRLING_BASE` constant
- `pages/popup.js` → `STIRLING_BASE` constant
- `pages/upload.js` → `STIRLING_BASE` and `UPLOAD_ENDPOINT` constants

### Adjust the upload endpoint

In `pages/upload.js`, update:
```js
const UPLOAD_ENDPOINT = `${STIRLING_BASE}/api/v1/general/upload-and-save`;
```

Check your Stirling version's API at `/swagger-ui` for the correct path.

---

## 🔍 Regex Details (rules.json)

```
^https?://(?!pdf\.arcont\.si)[^/]+/[^?#]*\.pdf(\?[^#]*)?$
```

Wait — RE2 does **not** support lookaheads. The actual rule uses:

```
^https?://(?!pdf\.arcont\.si)...
```

Since Edge's `declarativeNetRequest` uses a slightly relaxed RE2 subset that **does** allow `(?!...)` in practice (Chromium's implementation), but to be safe, the `excludedInitiatorDomains` field provides a second layer of loop prevention that is 100% RE2 compatible and doesn't rely on the regex at all.

---

## 🐛 Troubleshooting

**PDFs aren't being redirected**
- Make sure Developer Mode is on and the extension is enabled
- Open `edge://extensions/` → click the extension → check for errors
- Confirm the URL ends in `.pdf` (some URLs hide the extension — those won't match)

**Upload fails**
- Verify your Stirling instance is reachable at `https://pdf.arcont.si`
- Check the Swagger UI for the correct upload endpoint
- Look at the browser DevTools Network tab on the upload page for error details

**Context menu doesn't appear**
- Right-click directly on a link, not on blank space (for "open-pdf-link" item)
- "Open current page in Stirling PDF" appears on the page background

---

## 📄 License

MIT — modify freely for your self-hosted setup.
