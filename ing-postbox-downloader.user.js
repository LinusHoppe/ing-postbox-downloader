// ==UserScript==
// @name         ING Postbox Bulk Download
// @namespace    local.ing.postbox.bulkdownload
// @version      0.3.0
// @description  Lädt sichtbare Dokumente aus der ING Postbox nacheinander per nativer Browser-Aktion herunter.
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
  const BUTTON_LABEL_START = 'Alle herunterladen';
  const BUTTON_LABEL_STOP = 'Abbrechen';

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
      console.warn(`[${SCRIPT_NAME}] Konnte Setting nicht speichern`, key, err);
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
      log('Kandidaten in Zeile:', candidates.map(describeElement));
      log('Gewählter Download-Link:', describeElement(directDownloadLink));
      log('Gewählter Toggle-Button:', describeElement(findToggleButton(row)));
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
      throw new Error('Element zum Klicken fehlt.');
    }

    el.click();
  }

  async function executeDownload(doc) {
    if (!doc.linkElement) {
      throw new Error('Kein Download-Link für Dokument gefunden.');
    }

    clickElement(doc.linkElement);
  }

  function createButton(label, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.style.cssText = [
      'margin-right:10px',
      'margin-bottom:12px',
      'padding:8px 14px',
      'border-radius:6px',
      'border:1px solid #d0d0d0',
      'background:#f7f7f7',
      'cursor:pointer',
      'font-size:14px'
    ].join(';');
    btn.addEventListener('click', onClick);
    return btn;
  }

  function createCheckbox(labelText, checked, onChange) {
    const wrapper = document.createElement('label');
    wrapper.style.cssText = 'display:inline-flex;align-items:center;gap:8px;margin-right:12px;margin-bottom:12px;font-size:14px;cursor:pointer;';

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
    wrapper.style.cssText = 'display:inline-flex;align-items:center;gap:8px;margin-right:12px;margin-bottom:12px;font-size:14px;';

    const text = document.createElement('span');
    text.textContent = labelText;

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = '100';
    input.value = String(initialValue);
    input.style.cssText = 'width:90px;padding:4px 6px;';
    input.addEventListener('change', () => onChange(Number(input.value) || 0));

    wrapper.append(text, input);
    return wrapper;
  }

  function ensurePanelStyle(panel) {
    panel.style.cssText = 'margin:12px 0 20px 0;padding:10px 0;';
  }

  function updateStartButton(button = state.currentButton) {
    if (!button) return;

    if (!state.running) {
      button.textContent = BUTTON_LABEL_START;
      button.style.opacity = '1';
      return;
    }

    button.textContent = `${BUTTON_LABEL_STOP} (${state.processed}/${state.total})`;
    button.style.opacity = '1';
  }

  function buildStatusText() {
    const docs = collectDocuments();
    return `Sichtbare Dokumente: ${docs.length}`;
  }

  function createStatusElement() {
    const status = document.createElement('div');
    status.id = `${PANEL_ID}-status`;
    status.style.cssText = 'font-size:13px;color:#555;margin:4px 0 10px 0;';
    status.textContent = buildStatusText();
    return status;
  }

  function refreshStatusElement() {
    const status = document.getElementById(`${PANEL_ID}-status`);
    if (status && !state.running) {
      status.textContent = buildStatusText();
    }
  }

  async function runDownloadQueue(button) {
    if (state.running) {
      state.abortRequested = true;
      updateStartButton(button);
      return;
    }

    const delayMs = getSetting(STORAGE_KEYS.delayMs, config.defaultDelayMs);
    const dryRun = getSetting(STORAGE_KEYS.dryRun, config.defaultDryRun);

    const docs = collectDocuments();

    if (!docs.length) {
      alert('Keine sichtbaren Dokumente mit Download-Link gefunden.');
      refreshStatusElement();
      return;
    }

    state.running = true;
    state.abortRequested = false;
    state.processed = 0;
    state.total = docs.length;
    state.currentButton = button;
    updateStartButton(button);

    const status = document.getElementById(`${PANEL_ID}-status`);
    if (status) {
      status.textContent = dryRun
        ? `Dry-Run aktiv: ${docs.length} sichtbare Dokumente erkannt.`
        : `Starte Download von ${docs.length} sichtbaren Dokumenten...`;
    }

    log('Gefundene Dokumente:', docs);

    try {
      for (const doc of docs) {
        if (state.abortRequested) {
          log('Abbruch angefordert.');
          break;
        }

        log('Verarbeite Dokument', {
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

        if (status) {
          status.textContent = dryRun
            ? `Dry-Run: ${state.processed}/${state.total} geprüft`
            : `Download: ${state.processed}/${state.total}`;
        }
      }
    } catch (err) {
      console.error(`[${SCRIPT_NAME}] Fehler`, err);
      alert(`Fehler beim Download: ${err.message}`);
    } finally {
      const wasAborted = state.abortRequested;

      state.running = false;
      state.abortRequested = false;
      updateStartButton(button);

      if (status) {
        if (wasAborted) {
          status.textContent = `Abgebrochen bei ${state.processed}/${state.total}.`;
        } else if (dryRun) {
          status.textContent = `Dry-Run abgeschlossen: ${state.processed}/${state.total} geprüft.`;
        } else {
          status.textContent = `Download abgeschlossen: ${state.processed}/${state.total}.`;
        }
      }

      refreshStatusElement();
    }
  }

  function installUi() {
    const anchor = document.querySelector(config.uiAnchorSelector);

    if (!anchor) {
      log('UI-Anker nicht gefunden:', config.uiAnchorSelector);
      return false;
    }

    const existingPanel = document.getElementById(PANEL_ID);
    if (existingPanel) {
      ensurePanelStyle(existingPanel);
      refreshStatusElement();
      return true;
    }

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    ensurePanelStyle(panel);

    const startButton = createButton(BUTTON_LABEL_START, () => runDownloadQueue(startButton));
    state.currentButton = startButton;

    const dryRunCheckbox = createCheckbox(
      'Dry-Run (kein Download)',
      getSetting(STORAGE_KEYS.dryRun, config.defaultDryRun),
      checked => setSetting(STORAGE_KEYS.dryRun, checked)
    );

    const debugCheckbox = createCheckbox(
      'Debug-Logs',
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

    log('UI installiert');
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

    log('MutationObserver installiert');
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
      warn('UI konnte nicht installiert werden. Selektoren prüfen.');
    }
  }

  bootstrap();
})();