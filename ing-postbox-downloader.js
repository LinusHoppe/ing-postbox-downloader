// ==UserScript==
// @name         ING Postbox Bulk Download
// @namespace    local.ing.postbox.bulkdownload
// @version      0.2.0
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
  const BUTTON_LABEL_START = 'Alle herunterladen';
  const BUTTON_LABEL_STOP = 'Abbrechen';

  const STORAGE_KEYS = {
    filenameTemplate: 'ing.filenameTemplate',
    useOriginalFilename: 'ing.useOriginalFilename',
    delayMs: 'ing.delayMs',
    dryRun: 'ing.dryRun',
    debug: 'ing.debug',
  };

  const state = {
    running: false,
    abortRequested: false,
    processed: 0,
    total: 0,
  };

  const config = {
    uiAnchorSelector: '.account-filters',
    rowSelector: '.ibbr-table-body .ibbr-table-row',
    cellSelector: ':scope > span.ibbr-table-cell:not(:last-child)',
    interactiveSelector: 'a, button, [role="button"]',
    toggleButtonSelector: 'button[aria-label="Weitere Funktionen"]',
    defaultFilenameTemplate: 'YYYY-MM-DD_ART_BETREFF',
    defaultDelayMs: 1500,
    defaultDryRun: true,
    defaultDebug: true,
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

  function sanitizeFilenamePart(value) {
    return String(value || '')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function normalizeDateParts(rawValue) {
    const text = String(rawValue || '').trim();
    const parts = text.split(/[.\-/]/).map(p => p.trim());

    if (parts.length !== 3) {
      return { DD: '00', MM: '00', YYYY: '0000', raw: text };
    }

    const [DD, MM, YYYY] = parts;
    return {
      DD: DD.padStart(2, '0'),
      MM: MM.padStart(2, '0'),
      YYYY,
      raw: text,
    };
  }

  function buildFilename(doc, template, useOriginalFilename) {
    if (useOriginalFilename && doc.originalFilename) {
      return doc.originalFilename;
    }

    const dateParts = normalizeDateParts(doc.date);
    const replacements = {
      DD: dateParts.DD,
      MM: dateParts.MM,
      YYYY: dateParts.YYYY,
      ART: sanitizeFilenamePart(doc.type || 'Dokument'),
      BETREFF: sanitizeFilenamePart(doc.subject || 'Ohne_Betreff'),
    };

    let name = template;
    for (const [token, value] of Object.entries(replacements)) {
      name = name.replaceAll(token, value);
    }

    name = sanitizeFilenamePart(name);

    if (!name.toLowerCase().endsWith('.pdf')) {
      name += '.pdf';
    }

    return name;
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
      outerHTML: el.outerHTML,
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

  function parseRow(row) {
    const cells = Array.from(row.querySelectorAll(config.cellSelector))
      .map(cell => cell.textContent.trim());

    const link = findDownloadLink(row);
    const toggleButton = findToggleButton(row);

    const href = link?.getAttribute('href') || '';
    const absoluteUrl = toAbsoluteIngUrl(href);
    const originalFilename = absoluteUrl ? decodeURIComponent(absoluteUrl.split('/').pop() || '') : '';

    return {
      row,
      rawCells: cells,
      type: cells[0] || '',
      subject: cells[1] || '',
      date: cells[2] || '',
      url: absoluteUrl,
      originalFilename,
      linkElement: link,
      toggleButtonElement: toggleButton,
    };
  }

  function collectDocuments() {
    const rows = getVisibleRows();
    return rows.map(parseRow).filter(doc => !!doc.linkElement);
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

  function updateStartButton(button) {
    if (!button) return;

    if (!state.running) {
      button.textContent = BUTTON_LABEL_START;
      return;
    }

    button.textContent = `${BUTTON_LABEL_STOP} (${state.processed}/${state.total})`;
  }

  async function runDownloadQueue(button) {
    if (state.running) {
      state.abortRequested = true;
      updateStartButton(button);
      return;
    }

    const filenameTemplate = getSetting(STORAGE_KEYS.filenameTemplate, config.defaultFilenameTemplate);
    const useOriginalFilename = getSetting(STORAGE_KEYS.useOriginalFilename, false);
    const delayMs = getSetting(STORAGE_KEYS.delayMs, config.defaultDelayMs);
    const dryRun = getSetting(STORAGE_KEYS.dryRun, config.defaultDryRun);

    const docs = collectDocuments();

    if (!docs.length) {
      alert('Keine sichtbaren Dokumente mit Download-Link gefunden.');
      return;
    }

    state.running = true;
    state.abortRequested = false;
    state.processed = 0;
    state.total = docs.length;
    updateStartButton(button);

    log('Gefundene Dokumente:', docs);

    try {
      for (const doc of docs) {
        if (state.abortRequested) {
          log('Abbruch angefordert.');
          break;
        }

        const filename = buildFilename(doc, filenameTemplate, useOriginalFilename);

        log('Verarbeite Dokument', {
          type: doc.type,
          subject: doc.subject,
          date: doc.date,
          filename,
          href: doc.url,
          dryRun,
        });

        if (!dryRun) {
          await executeDownload(doc);
          await sleep(delayMs);
        }

        state.processed += 1;
        updateStartButton(button);
      }
    } catch (err) {
      console.error(`[${SCRIPT_NAME}] Fehler`, err);
      alert(`Fehler beim Download: ${err.message}`);
    } finally {
      state.running = false;
      state.abortRequested = false;
      updateStartButton(button);
    }
  }

  function installUi() {
    const anchor = document.querySelector(config.uiAnchorSelector);

    if (!anchor) {
      log('UI-Anker nicht gefunden:', config.uiAnchorSelector);
      return false;
    }

    if (document.getElementById('ing-postbox-bulkdownload-panel')) {
      return true;
    }

    const panel = document.createElement('div');
    panel.id = 'ing-postbox-bulkdownload-panel';
    panel.style.cssText = 'margin:12px 0 20px 0;padding:10px 0;';

    const startButton = createButton(BUTTON_LABEL_START, () => runDownloadQueue(startButton));

    const templateButton = createButton('Dateinamen ändern', () => {
      const current = getSetting(STORAGE_KEYS.filenameTemplate, config.defaultFilenameTemplate);
      const next = prompt('Dateinamens-Template eingeben (z. B. YYYY-MM-DD_ART_BETREFF):', current);
      if (next !== null && next.trim()) {
        setSetting(STORAGE_KEYS.filenameTemplate, next.trim());
      }
    });

    const originalNameCheckbox = createCheckbox(
      'Original-Dateinamen verwenden',
      getSetting(STORAGE_KEYS.useOriginalFilename, false),
      checked => setSetting(STORAGE_KEYS.useOriginalFilename, checked)
    );

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

    panel.append(
      startButton,
      templateButton,
      originalNameCheckbox,
      dryRunCheckbox,
      debugCheckbox,
      delayInput
    );

    anchor.insertAdjacentElement('afterend', panel);

    log('UI installiert');
    return true;
  }

  function bootstrap(attempt = 0) {
    const installed = installUi();
    if (installed) return;

    if (attempt < 20) {
      setTimeout(() => bootstrap(attempt + 1), 1000);
    } else {
      warn('UI konnte nicht installiert werden. Selektoren prüfen.');
    }
  }

  bootstrap();
})();