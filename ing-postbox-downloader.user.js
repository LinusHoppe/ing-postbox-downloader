// ==UserScript==
// @name         ING Postbox Bulk Download
// @namespace    local.ing.postbox.bulkdownload
// @version      0.5.0
// @description  Sequentially download all visible documents from the ING Postbox
// @match        https://banking.ing.de/app/postbox/postbox*
// @match        https://banking.ing.de/app/postbox/postbox_archiv*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-end
// ==/UserScript==

(() => {
  'use strict';

  const SCRIPT_NAME = 'ING Postbox Bulk Download';
  const PANEL_ID = 'ing-postbox-bulkdownload-panel';
  const STYLE_ID = 'ing-postbox-bulkdownload-style';

  const BUTTON_LABEL_START = 'Download all';
  const BUTTON_LABEL_STOP = 'Abort';

  const STORAGE_KEYS = {
    delayMs: 'ing.delayMs',
    dryRun: 'ing.dryRun',
    debug: 'ing.debug',
  };

  const config = {
    uiAnchorSelector: '.account-filters',
    rowSelector: '.ibbr-table-body .ibbr-table-row',
    cellSelector: ':scope > span.ibbr-table-cell:not(:last-child)',
    interactiveSelector: 'a, button, [role="button"]',
    toggleButtonSelector: 'button[aria-label="Weitere Funktionen"]',
    defaultDelayMs: 1500,
    defaultDryRun: true,
    defaultDebug: true,
    maxBootstrapAttempts: 40,
    bootstrapIntervalMs: 1000,
    mutationDebounceMs: 600,
  };

  const state = {
    running: false,
    abortRequested: false,
    processed: 0,
    total: 0,
    observer: null,
    bootstrapTimer: null,
    mutationTimer: null,
    currentButton: null,
  };

  function getSetting(key, fallback) {
    try {
      return GM_getValue(key, fallback);
    } catch {
      return fallback;
    }
  }

  function setSetting(key, value) {
    try {
      GM_setValue(key, value);
    } catch (err) {
      console.warn(`[${SCRIPT_NAME}] Could not persist setting`, key, err);
    }
  }

  function isDebugEnabled() {
    return !!getSetting(STORAGE_KEYS.debug, config.defaultDebug);
  }

  function log(...args) {
    if (isDebugEnabled()) {
      console.log(`[${SCRIPT_NAME}]`, ...args);
    }
  }

  function warn(...args) {
    console.warn(`[${SCRIPT_NAME}]`, ...args);
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function toAbsoluteIngUrl(href) {
    if (!href) return '';
    try {
      return new URL(href, window.location.origin).toString();
    } catch {
      return href;
    }
  }

  function getVisibleRows() {
    return Array.from(document.querySelectorAll(config.rowSelector));
  }

  function getInteractiveCandidates(row) {
    return Array.from(row.querySelectorAll(config.interactiveSelector));
  }

  function describeElement(el) {
    if (!el) return null;

    return {
      tag: el.tagName,
      text: (el.textContent || '').trim(),
      href: el.getAttribute?.('href') || '',
      title: el.getAttribute?.('title') || '',
      ariaLabel: el.getAttribute?.('aria-label') || '',
      classes: el.className || '',
      id: el.id || '',
      name: el.getAttribute?.('name') || '',
      role: el.getAttribute?.('role') || '',
      toggleSelector: el.getAttribute?.('data-toggle-selector') || '',
    };
  }

  function findToggleButton(row) {
    return row.querySelector(config.toggleButtonSelector);
  }

  function findDownloadLink(row) {
    const candidates = getInteractiveCandidates(row);
    const links = candidates.filter(el => el.tagName === 'A');

    const directDownloadLink =
      links.find(link => {
        const text = (link.textContent || '').trim();
        const title = link.getAttribute('title') || '';
        const aria = link.getAttribute('aria-label') || '';
        const href = link.getAttribute('href') || '';

        return (
          text.includes('Download') ||
          title.includes('Download') ||
          aria.includes('Download') ||
          href.includes('download') ||
          href.includes('postbox_archiv') ||
          href.toLowerCase().includes('.pdf')
        );
      }) || null;

    if (isDebugEnabled()) {
      log('Row candidates:', candidates.map(describeElement));
      log('Selected download link:', describeElement(directDownloadLink));
      log('Selected toggle button:', describeElement(findToggleButton(row)));
    }

    return directDownloadLink;
  }

  function parseRow(row, index) {
    const cells = Array.from(row.querySelectorAll(config.cellSelector))
      .map(cell => cell.textContent.trim());

    const link = findDownloadLink(row);
    const toggleButton = findToggleButton(row);

    const href = link?.getAttribute('href') || '';
    const absoluteUrl = toAbsoluteIngUrl(href);

    return {
      index,
      row,
      rawCells: cells,
      type: cells[0] || '',
      subject: cells[1] || '',
      date: cells[2] || '',
      url: absoluteUrl,
      linkElement: link,
      toggleButtonElement: toggleButton,
    };
  }

  function collectDocuments() {
    const rows = getVisibleRows();
    return rows
      .map((row, index) => parseRow(row, index))
      .filter(doc => !!doc.linkElement);
  }

  function clickElement(el) {
    if (!el) {
      throw new Error('Missing element to click.');
    }

    el.click();
  }

  async function executeDownload(doc) {
    if (!doc.linkElement) {
      throw new Error('No download link found for document.');
    }

    clickElement(doc.linkElement);
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID} {
        margin: 12px 0 20px 0;
        padding: 12px 14px;
        border: 1px solid #d8dde6;
        border-radius: 10px;
        background: #f8fafc;
        color: #1f2937;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px 12px;
        font-family: Arial, sans-serif;
      }

      #${PANEL_ID} .ipbd-primary-btn {
        appearance: none;
        border: 1px solid #c9d2df;
        background: #ffffff;
        color: #111827;
        border-radius: 8px;
        padding: 8px 14px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
      }

      #${PANEL_ID} .ipbd-primary-btn:hover {
        background: #f1f5f9;
        border-color: #b8c4d6;
      }

      #${PANEL_ID} .ipbd-primary-btn:focus-visible {
        outline: 2px solid #2563eb;
        outline-offset: 2px;
      }

      #${PANEL_ID} .ipbd-checkbox,
      #${PANEL_ID} .ipbd-number {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: #374151;
      }

      #${PANEL_ID} .ipbd-checkbox {
        cursor: pointer;
        user-select: none;
      }

      #${PANEL_ID} .ipbd-checkbox input {
        cursor: pointer;
      }

      #${PANEL_ID} .ipbd-number input {
        width: 90px;
        padding: 5px 7px;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        font-size: 13px;
        background: #fff;
        color: #111827;
      }

      #${PANEL_ID} .ipbd-status {
        margin-left: auto;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 30px;
        padding: 6px 10px;
        border-radius: 999px;
        background: #e8eef8;
        color: #1e3a8a;
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
      }

      #${PANEL_ID} .ipbd-status[data-variant="idle"] {
        background: #eef2f7;
        color: #334155;
      }

      #${PANEL_ID} .ipbd-status[data-variant="running"] {
        background: #e0f2fe;
        color: #075985;
      }

      #${PANEL_ID} .ipbd-status[data-variant="success"] {
        background: #dcfce7;
        color: #166534;
      }

      #${PANEL_ID} .ipbd-status[data-variant="warning"] {
        background: #fef3c7;
        color: #92400e;
      }

      #${PANEL_ID} .ipbd-status[data-variant="error"] {
        background: #fee2e2;
        color: #991b1b;
      }

      #${PANEL_ID} .ipbd-status-dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: currentColor;
        opacity: 0.85;
        flex: 0 0 auto;
      }

      @media (max-width: 900px) {
        #${PANEL_ID} .ipbd-status {
          width: 100%;
          margin-left: 0;
          justify-content: center;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function createButton(label, onClick, title = '') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.className = 'ipbd-primary-btn';
    if (title) {
      btn.title = title;
    }
    btn.addEventListener('click', onClick);
    return btn;
  }

  function createCheckbox(labelText, checked, onChange) {
    const wrapper = document.createElement('label');
    wrapper.className = 'ipbd-checkbox';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', () => onChange(input.checked));

    const text = document.createElement('span');
    text.textContent = labelText;

    wrapper.append(input, text);
    return wrapper;
  }

  function createNumberInput(labelText, initialValue, onChange) {
    const wrapper = document.createElement('label');
    wrapper.className = 'ipbd-number';

    const text = document.createElement('span');
    text.textContent = labelText;

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = '100';
    input.value = String(initialValue);
    input.addEventListener('change', () => onChange(Number(input.value) || 0));

    wrapper.append(text, input);
    return wrapper;
  }

  function updateStartButton(button = state.currentButton) {
    if (!button) return;

    if (!state.running) {
      button.textContent = BUTTON_LABEL_START;
      button.title = 'Start a sequential download of all currently visible documents';
      return;
    }

    button.textContent = `${BUTTON_LABEL_STOP} (${state.processed}/${state.total})`;
    button.title = 'Click again to stop after the current step';
  }

  function getStatusElement() {
    return document.getElementById(`${PANEL_ID}-status`);
  }

  function setStatus(text, variant = 'idle') {
    const status = getStatusElement();
    if (!status) return;

    status.dataset.variant = variant;
    const label = status.querySelector('.ipbd-status-text');
    if (label) {
      label.textContent = text;
    } else {
      status.textContent = text;
    }
  }

  function buildStatusText() {
    const docs = collectDocuments();
    return `Visible documents: ${docs.length}`;
  }

  function createStatusElement() {
    const status = document.createElement('div');
    status.id = `${PANEL_ID}-status`;
    status.className = 'ipbd-status';
    status.dataset.variant = 'idle';

    const dot = document.createElement('span');
    dot.className = 'ipbd-status-dot';
    dot.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    text.className = 'ipbd-status-text';
    text.textContent = buildStatusText();

    status.append(dot, text);
    return status;
  }

  function refreshStatusElement() {
    if (!state.running) {
      setStatus(buildStatusText(), 'idle');
    }
  }

  async function runDownloadQueue(button) {
    if (state.running) {
      state.abortRequested = true;
      updateStartButton(button);
      setStatus(`Stopping after ${state.processed}/${state.total}...`, 'warning');
      return;
    }

    const delayMs = getSetting(STORAGE_KEYS.delayMs, config.defaultDelayMs);
    const dryRun = getSetting(STORAGE_KEYS.dryRun, config.defaultDryRun);

    const docs = collectDocuments();

    if (!docs.length) {
      alert('No visible documents with a download link were found.');
      setStatus('No downloadable documents found', 'error');
      refreshStatusElement();
      return;
    }

    state.running = true;
    state.abortRequested = false;
    state.processed = 0;
    state.total = docs.length;
    state.currentButton = button;
    updateStartButton(button);

    setStatus(
      dryRun
        ? `Dry run started with ${docs.length} visible documents`
        : `Starting download of ${docs.length} visible documents`,
      'running'
    );

    log('Detected documents:', docs);

    try {
      for (const doc of docs) {
        if (state.abortRequested) {
          log('Abort requested.');
          break;
        }

        log('Processing document', {
          index: doc.index,
          type: doc.type,
          subject: doc.subject,
          date: doc.date,
          href: doc.url,
          dryRun,
        });

        if (!dryRun) {
          await executeDownload(doc);
          await sleep(delayMs);
        }

        state.processed += 1;
        updateStartButton(button);

        setStatus(
          dryRun
            ? `Dry run: checked ${state.processed}/${state.total}`
            : `Download: ${state.processed}/${state.total}`,
          'running'
        );
      }
    } catch (err) {
      console.error(`[${SCRIPT_NAME}] Error`, err);
      setStatus(`Error after ${state.processed}/${state.total}`, 'error');
      alert(`Download error: ${err.message}`);
    } finally {
      const wasAborted = state.abortRequested;

      state.running = false;
      state.abortRequested = false;
      updateStartButton(button);

      if (wasAborted) {
        setStatus(`Aborted at ${state.processed}/${state.total}`, 'warning');
      } else if (dryRun) {
        setStatus(`Dry run finished: checked ${state.processed}/${state.total}`, 'success');
      } else {
        setStatus(`Download finished: ${state.processed}/${state.total}`, 'success');
      }

      window.setTimeout(() => {
        refreshStatusElement();
      }, 2500);
    }
  }

  function installUi() {
    const anchor = document.querySelector(config.uiAnchorSelector);

    if (!anchor) {
      log('UI anchor not found:', config.uiAnchorSelector);
      return false;
    }

    ensureStyles();

    const existingPanel = document.getElementById(PANEL_ID);
    if (existingPanel) {
      refreshStatusElement();
      return true;
    }

    const panel = document.createElement('div');
    panel.id = PANEL_ID;

    const startButton = createButton(
      BUTTON_LABEL_START,
      () => runDownloadQueue(startButton),
      'Start a sequential download of all currently visible documents'
    );
    state.currentButton = startButton;

    const dryRunCheckbox = createCheckbox(
      'Dry run (no download)',
      getSetting(STORAGE_KEYS.dryRun, config.defaultDryRun),
      checked => setSetting(STORAGE_KEYS.dryRun, checked)
    );

    const debugCheckbox = createCheckbox(
      'Debug logs',
      getSetting(STORAGE_KEYS.debug, config.defaultDebug),
      checked => setSetting(STORAGE_KEYS.debug, checked)
    );

    const delayInput = createNumberInput(
      'Delay (ms)',
      getSetting(STORAGE_KEYS.delayMs, config.defaultDelayMs),
      value => setSetting(STORAGE_KEYS.delayMs, value)
    );

    const status = createStatusElement();

    panel.append(
      startButton,
      dryRunCheckbox,
      debugCheckbox,
      delayInput,
      status
    );

    anchor.insertAdjacentElement('afterend', panel);

    log('UI installed');
    return true;
  }

  function scheduleUiRefresh() {
    if (state.mutationTimer) {
      clearTimeout(state.mutationTimer);
    }

    state.mutationTimer = setTimeout(() => {
      installUi();
      refreshStatusElement();
    }, config.mutationDebounceMs);
  }

  function installMutationObserver() {
    if (state.observer) {
      return;
    }

    state.observer = new MutationObserver(() => {
      scheduleUiRefresh();
    });

    state.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    log('MutationObserver installed');
  }

  function bootstrap(attempt = 0) {
    const installed = installUi();

    if (installed) {
      installMutationObserver();
      return;
    }

    if (attempt < config.maxBootstrapAttempts) {
      state.bootstrapTimer = setTimeout(
        () => bootstrap(attempt + 1),
        config.bootstrapIntervalMs
      );
    } else {
      warn('UI could not be installed. Please verify the selectors.');
    }
  }

  bootstrap();
})();