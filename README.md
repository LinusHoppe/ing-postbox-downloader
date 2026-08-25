# ING Postbox Bulk Download

A userscript for **Firefox + Violentmonkey** that downloads all currently visible documents in the ING postbox one after another. The script is intended for local personal use and deliberately follows a minimal, understandable approach instead of relying on opaque third-party code.

The current version uses a **native click on the existing download link** in each document row, because this approach works reliably in practice, while programmatic downloads can run into redirect or CORS-related issues with ING links.

## Purpose

The ING postbox UI only provides single-document downloads. This script adds a button to the postbox that downloads all **visible** documents one after another, including a configurable delay and a dry-run mode to safely verify document detection without triggering actual downloads.

The project is explicitly focused on **self-development and transparency**. Public examples were only used as initial inspiration; the actual implementation is meant to remain locally controlled, readable, and easy to adapt.

## Features

- Download all currently visible documents in the postbox
- Sequential execution instead of parallel downloads, so the browser and website are not overloaded with too many simultaneous actions
- Dry-run mode to test document detection without triggering real downloads
- Configurable delay between downloads
- Debug logging for DOM analysis and troubleshooting
- Automatic UI re-initialization when ING dynamically re-renders parts of the page

## Technical Approach

The script runs as a Violentmonkey userscript directly in the browser on the ING postbox pages.

Document rows are collected using DOM selectors, and the existing download link is identified within each row. For direct child selectors inside a row, `:scope` is used so that selection remains correctly relative to the current element.

The actual download is not triggered via `fetch()`, but through a native click on the detected element. This matches the UI-driven workflow of the ING postbox more reliably.

## Requirements

To use the script, the following is required:

- Firefox as the browser
- The Violentmonkey extension for Firefox
- A locally installed userscript from this repository
- A logged-in ING postbox session

## Installation

1. Install Violentmonkey in Firefox.
2. Create a new userscript in Violentmonkey or import the `.user.js` file from this repository.
3. Save the script.
4. Open or reload the ING postbox.
5. Check whether an additional **"Download all"** button appears below the filter area.

## Usage

### Normal Workflow

1. Open the desired list in the ING postbox, for example by filtering by date range or document type.
2. Optionally enable dry-run first.
3. Click **"Download all"**.
4. The script processes all currently visible documents one after another.
5. Clicking the same button again aborts the process.

Important: The script only processes **currently visible documents**. It intentionally does not perform pagination or automatically load additional pages.

### Dry Run

In dry-run mode, all visible documents are detected and processed logically without triggering real downloads. This is the recommended first test after changing selectors or internal logic.

### Delay

The delay between two downloads can be configured. A small delay is useful so that the UI, Firefox, and the download manager can keep up cleanly.

### Debug Logs

If **Debug Logs** are enabled, the script writes additional information to the browser console. This is useful for analyzing DOM changes, selector issues, or elements that are no longer detected correctly.

## UI Elements

The script injects a small control panel into the postbox. As of version 0.3, it includes:

| Element | Function |
|---|---|
| Download all | Starts the sequential download of all visible documents. During execution, the same button is also used to abort the process. |
| Dry-run (no download) | Only verifies document detection without triggering actual downloads. |
| Debug Logs | Enables additional console output for analysis and troubleshooting. |
| Delay (ms) | Defines the waiting time between two download actions. |
| Status line | Shows the number of visible documents as well as progress, completion, or cancellation state. |

## Limitations

### Visible Documents Only

The script only downloads the documents that are visible on the current page. This is intentional so that the logic remains predictable and does not silently navigate through additional pages.

### DOM Dependency

The script depends on the current HTML structure of the ING postbox. If ING changes class names, button structure, table layout, or dynamic rendering behavior, selectors or detection logic may need to be updated.

### No Guaranteed File Name

The browser or server response determines the final file name. Free renaming was intentionally not pursued further for stability reasons.

### No API-Based Approach

The project does not use an official ING API for documents. It automates only the existing web interface, meaning a UI-based workflow inside a logged-in browser session.

## Security

Because the script interacts with sensitive banking data, it deliberately follows a **local and traceable approach**. It does not send data to third parties, does not use external tracking services, and only accesses the ING postbox already available in the logged-in browser context.

Recommended security principles:

- Only run code that is fully understood
- Always test changes in dry-run mode first
- When forking the code, keep the repository private if it contains internal adjustments or personal notes
- Anonymize logs before sharing them, as document titles or metadata may be visible
- Keep the `@match` scope intentionally limited to the ING postbox

## Architecture

The internal structure of the script is intentionally simple:

- **Configuration**: selectors, defaults, and storage keys
- **State**: run status, abort flag, progress, observer references
- **DOM detection**: collecting rows and finding the download link for each document
- **Action**: native click on the detected element
- **UI**: control panel with start, dry-run, debug, and delay options
- **Reactivity**: `MutationObserver` to reattach the panel after DOM updates

## Typical Code Flow

1. After the page loads, the script tries to find the filter area as the UI anchor.
2. It injects its own control panel there.
3. When started, it collects all visible table rows.
4. For each row, it identifies the download link.
5. In real execution mode, it triggers a native click per document.
6. Between two documents, it waits for the configured delay.
7. Clicking again sets an abort flag and stops the run cleanly after the current step.

## Persistent Settings

User settings are stored in the userscript storage.

Currently stored values:

| Key | Meaning |
|---|---|
| `ing.delayMs` | Delay between two downloads in milliseconds |
| `ing.dryRun` | Remembers whether dry-run was enabled last |
| `ing.debug` | Remembers whether debug logging is enabled |

## Debugging

### Browser Console

The most important source of diagnostics is the Firefox console. With debug mode enabled, it can show:

- detected documents
- detected link candidates per row
- the selected download link
- progress information
- errors in click handling or DOM logic

### Important Checks

If the script stops working after changes, these points should be checked first:

1. Is there still a valid UI anchor under `.account-filters`?
2. Do the rows still match `.ibbr-table-body .ibbr-table-row`?
3. Are the columns still direct children reachable via `:scope > span.ibbr-table-cell:not(:last-child)`?
4. Does each document row still contain a clickable download link?
5. Does a manual click on the same link still open a valid download?

### Typical Failure Patterns

| Problem | Likely Cause | Hint |
|---|---|---|
| No button visible | UI anchor not found | Check whether `.account-filters` still exists |
| Dry-run finds 0 documents | Table or cell selectors no longer match | Inspect the DOM in Firefox DevTools |
| Download does not start | ING changed link or event structure | Analyze link candidates with debug logs |
| UI disappears after changing filters | DOM was dynamically re-rendered | Check observer and selector logic |

## Adapting to DOM Changes

If ING changes the UI, usually only a few areas are relevant:

- `uiAnchorSelector`
- `rowSelector`
- `cellSelector`
- detection logic in `findDownloadLink()`
- possibly the selector for the **"More actions"** button

The fastest way to find a new selector is via Firefox DevTools. In the Inspector, the relevant element can be selected and its CSS selector analyzed; for direct child elements inside a node, `:scope` is often the most robust choice.

## Known Design Decisions

### No Pagination

The script only processes the current view. This avoids additional navigation logic, waiting states, page changes, and harder-to-trace error chains.

### No File Renaming

The file name is accepted as provided by the browser or server, not artificially overridden. This improves the reliability of the actual download process.

### No External Runtime Dependencies

The current version works without jQuery or additional UI libraries. This simplifies maintenance, debugging, and control over the executed code.

## Development Notes

For script changes, the following workflow is recommended:

1. Apply changes locally in Violentmonkey.
2. Reload the page.
3. Enable dry-run.
4. Watch the console.
5. Only then run a real test with a small number of visible documents.
6. Use it more broadly only after the test succeeds.

## Non-Goals

This project deliberately does **not** aim for:

- full archive synchronization
- server-side automation
- usage of an official or unofficial backend API
- forcing file renaming at all costs
- multi-user or multi-tenant support
- browser-specific adaptations outside Firefox

## Origin and Context

The basic idea is not new; there are public examples and blog posts around batch downloading from the ING postbox using userscripts.

This implementation should nevertheless be understood as an **independent, reduced, and locally controlled variant** for private use.

## Disclaimer

Use at your own risk. The script is an unofficial browser automation helper and is not affiliated with ING. Changes to the website may affect functionality at any time.

Before using it productively, the behavior should always be tested with a small number of documents first. Especially for banking documents, caution, local control, and a deliberately narrow scope are strongly recommended.