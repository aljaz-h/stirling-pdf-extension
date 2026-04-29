# Stirling PDF Redirector

Manifest V3 extension for Edge/Chrome that sends PDF links to your own Stirling PDF instance.

It supports:

- automatic redirect of web PDF URLs
- opening local PDFs from `file://` tabs
- a configurable Stirling base URL saved in extension settings

## Features

- Configurable Stirling instance URL through the extension settings page
- Dynamic redirect rule generation with `chrome.declarativeNetRequest.updateDynamicRules()`
- Local PDF handoff flow for files opened from Windows Explorer
- Popup shortcuts for opening Stirling, local files, and settings
- `chrome.storage.sync` support so the saved URL can follow the user account where supported

## File Structure

```text
stirling-pdf-extension/
├── manifest.json
├── background.js
├── content_script.js
├── config.js
├── icons/
└── pages/
    ├── popup.html
    ├── popup.js
    ├── options.html
    ├── options.js
    ├── upload.html
    └── upload.js
```

## Installation

1. Open `edge://extensions/` or `chrome://extensions/`
2. Enable Developer mode
3. Click `Load unpacked`
4. Select the `stirling-pdf-extension` folder
5. Open the extension settings page and enter your Stirling base URL
6. Optional but recommended for local files: enable `Allow access to file URLs`

## Configuration

The extension no longer hardcodes a specific Stirling host.

Set your Stirling instance in the options page:

- Example: `https://stirling.example.com`
- Use only the base URL
- Do not include `/view` or a trailing query string

When the URL is saved:

- the background worker stores it in `chrome.storage.sync`
- the redirect rule is rebuilt dynamically
- popup, content scripts, and upload flow all start using the saved instance

If no URL is configured yet, the extension opens settings and keeps redirects effectively inactive.

## How Web PDF Redirects Work

For navigations like:

```text
https://example.com/report.pdf
```

the extension redirects the main tab to:

```text
https://your-stirling-host/view?url=https%3A%2F%2Fexample.com%2Freport.pdf
```

The redirect rule is created dynamically in the background worker so the excluded Stirling host always matches the user’s saved configuration.

## How Local PDF Support Works

Local PDFs cannot simply be passed to Stirling as filesystem paths. The extension handles them differently:

1. A `file://...pdf` tab is intercepted
2. The extension opens its local upload page
3. The file is read locally by the extension
4. The extension opens the configured Stirling site
5. The file is handed into Stirling’s web UI so it behaves like a user-selected upload

This is designed to mirror the manual drag-and-drop flow as closely as possible.

## Popup and Settings

The popup provides:

- a field for opening a remote PDF URL in Stirling
- a button for local PDF flow
- a button to open the configured Stirling dashboard
- a button to open extension settings

The settings page provides:

- Stirling base URL input
- save action with validation
- current configured value display
- quick open button for the saved instance

## Permissions

| Permission | Why it is used |
|---|---|
| `declarativeNetRequest` | Create the automatic PDF redirect rule |
| `declarativeNetRequestWithHostAccess` | Apply redirect rules against external PDF URLs |
| `tabs` | Update or open tabs for viewer and local handoff flows |
| `contextMenus` | Add right-click actions for links, frames, and pages |
| `storage` | Save the configured Stirling URL |
| `scripting` | Reserved for extension-side page integration workflows |
| `host_permissions` | Required for matching web URLs and local file URLs |

## Troubleshooting

### Web PDFs are not redirecting

- Make sure the extension is enabled
- Make sure a Stirling URL is saved in settings
- Confirm the target URL actually ends with `.pdf`
- Reload the extension after major code changes during development

### Local PDFs do not work

- Enable `Allow access to file URLs` in the extension details page
- Make sure a Stirling URL is configured
- Try opening the Stirling site manually to verify it is reachable

### Local handoff fails

- Your Stirling UI may use a different upload page structure than expected
- Open the site manually and verify that normal drag-and-drop or file selection works
- If needed, inspect the page and adjust the content-script handoff logic

### Settings save but behavior does not change

- Reload the unpacked extension
- Save the URL again
- Re-test a PDF navigation in a fresh tab

## Version

Current manifest version: `1.5.0`

## License

MIT
