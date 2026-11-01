window.addEventListener("load", function () {

  let basketPage = 1;
  let basketPageSize = 10;

  let basketSortColumn = null;
  let basketSortDirection = "asc";

  // Path to the full OWL data dictionary, published as a static JSON asset.
  // Update this if the file is hosted somewhere else on the site.
  const DATA_DICTIONARY_URL = "/OWL/assets/data/search_methods/search_by_year/NSHD_Data_Dictionary_Public_full.json";

  // Small { varName: message } lookup of restricted variables only —
  // same file variable-restricted-icon.js reads, kept in sync with it.
  // Used here to pin restricted rows to the top of the basket table and
  // drive the two highlighted banners; icon rendering itself is left to
  // variable-restricted-icon.js, which already decorates this table's
  // name links automatically via its MutationObserver, so this file
  // never inserts a lock icon itself — only tracks restriction status.
  const RESTRICTED_LOOKUP_URL = "/OWL/assets/data/sensitive/restricted_variables.json";
  let restrictedLookup = {};

  function isRestricted(varName) {
    return !!restrictedLookup[varName];
  }

  function loadRestrictedLookup() {
    return fetch(RESTRICTED_LOOKUP_URL)
      .then(r => r.ok ? r.json() : {})
      .then(data => { restrictedLookup = data || {}; })
      .catch(() => { restrictedLookup = {}; })
      .then(() => {
        // The initial renderBasket() call further down may already have
        // run before this fetch resolved — re-render now that we
        // actually know which basket items are restricted, so the
        // pinning and banner aren't stuck showing the pre-lookup state.
        renderBasket();
        renderBasketPagination();
        updateBasketResultsCount();
      });
  }

  // CDN build of ExcelJS, used to produce a real, styled .xlsx client-side.
  const EXCELJS_CDN_URL = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";

  // Cached in memory after first fetch/load so repeat downloads are instant.
  let dictionaryCache = null;
  let exceljsLoadPromise = null;

  // Column widths taken from the original Data Dictionary workbook
  // (character-width units, same scale openpyxl/Excel use).
  const COLUMN_WIDTHS = {
    "NSHD Library File": 15,
    "Topic": 19.5,
    "Subtopic 1": 19.5,
    "Subtopic 2": 19.5,
    "Subtopic 3": 19.5,
    "Subtopic 4": 19.5,
    "NSHD Variable Name": 15.43,
    "Showcase Field ID": 15.43,
    "UKLLC Dataset Name(s)": 18.14,
    "Variable Label": 55,
    "Value labels": 34,
    "Units": 13.57,
    "Form": 20,
    "Question Number": 13.57,
    "Year of collection": 12.57,
    "Is variable derived?": 12.57,
    "Is variable sensitive?": 12.57,
    "Reason variable is sensitive": 15.14,
    "Is variable restricted?": 15.14,
    "Security message": 40,
    "Notes": 34.7,
    "Request variable": 16,
    "Variable Role": 26,
    "Researcher's Notes": 34
  };

  // Header fill colours taken from the original workbook, grouped by
  // column meaning. New "Request variable" column gets its own colour
  // so it stands out as the added field.
  const HEADER_FILLS = {
    "NSHD Library File": "FFF7C6D0",
    "Topic": "FFC0C0C0",
    "Subtopic 1": "FFC0C0C0",
    "Subtopic 2": "FFC0C0C0",
    "Subtopic 3": "FFC0C0C0",
    "Subtopic 4": "FFC0C0C0",
    "NSHD Variable Name": "FFC1E1C1",
    "Showcase Field ID": "FFC1E1C1",
    "UKLLC Dataset Name(s)": "FFC1E1C1",
    "Variable Label": "FFADD8E6",
    "Value labels": "FFADD8E6",
    "Units": "FFADD8E6",
    "Form": "FFADD8E6",
    "Question Number": "FFADD8E6",
    "Year of collection": "FFADD8E6",
    "Is variable derived?": "FFADD8E6",
    "Is variable sensitive?": "FFADD8E6",
    "Reason variable is sensitive": "FFADD8E6",
    "Notes": "FFADD8E6",
    "Is variable restricted?": "FFF4A9A0",
    "Security message": "FFF4A9A0",
    "Request variable": "FFFFFF00",
    "Variable Role": "FFD9CEF5",
    "Researcher's Notes": "FFD9CEF5"
  };

  // Columns present in the website's dictionary JSON but left out of the
  // pre-filled Excel export, so it matches the downloadable blank dictionary.
  const EXPORT_EXCLUDED_COLUMNS = ["Order", "Showcase Field ID"];

  // Fixed set of options offered in the Role dropdown on export.
  const ROLE_OPTIONS = ["Exposure", "Outcome", "Covariate", "Other"];

  function sortBasketData(data) {
    if (!basketSortColumn) return data;

    return data.slice().sort((a, b) => {
      let valA = a[basketSortColumn] || "";
      let valB = b[basketSortColumn] || "";

      valA = valA.toString().toLowerCase();
      valB = valB.toString().toLowerCase();

      if (valA < valB) return basketSortDirection === "asc" ? -1 : 1;
      if (valA > valB) return basketSortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }

  const pageSizeSelect = document.getElementById("basketPageSize");
  if (pageSizeSelect) {
    pageSizeSelect.value = basketPageSize;
    pageSizeSelect.addEventListener("change", function (e) {
      basketPageSize = Number(e.target.value);
      basketPage = 1;
      renderBasket();
      renderBasketPagination();
      updateBasketResultsCount();
    });
  }

  // ── Toggles the "over 500 variables" banner on the basket page ─────
  // Called any time the basket's contents might have changed, so the
  // warning stays in sync with the actual count at all times.
  function updateBasketLimitWarning() {
    const basket = loadBasket();
    const warningEl = document.getElementById("basketLimitWarning");
    if (!warningEl) return;
    warningEl.classList.toggle("show", basket.length > 500);
  }

  // ── Toggles the restricted-variables banner on the basket page ─────
  // Same trigger points as updateBasketLimitWarning above, so the two
  // banners always stay in sync with each other and with the actual
  // basket contents.
  function updateBasketRestrictedWarning() {
    const basket = loadBasket();
    const restrictedItems = basket.filter(item => isRestricted(item.varName));
    const warningEl = document.getElementById("basketRestrictedWarning");
    if (!warningEl) return;
    const countEl = document.getElementById("basketRestrictedCount");
    if (countEl) countEl.textContent = restrictedItems.length;
    warningEl.style.display = restrictedItems.length > 0 ? "block" : "none";
  }

  function updateBasketResultsCount() {
    const basket = loadBasket();
    const total = basket.length;

    const start = (basketPage - 1) * basketPageSize;
    const end = Math.min(start + basketPageSize, total);

    document.getElementById("basketResultsCount").textContent =
      `Showing ${total === 0 ? 0 : start + 1}-${end} of ${total} results`;
  }

  function renderBasketPagination() {
    const basket = loadBasket();
    const totalPages = Math.ceil(basket.length / basketPageSize) || 1;

    const html = `
      <button ${basketPage === 1 ? "disabled" : ""} onclick="changeBasketPage(-1)">Prev</button>
      <span>Page ${basketPage} of ${totalPages}</span>
      <button ${basketPage === totalPages ? "disabled" : ""} onclick="changeBasketPage(1)">Next</button>
    `;

    document.getElementById("basketPaginationTop").innerHTML = html;
    document.getElementById("basketPaginationBottom").innerHTML = html;
  }

  window.changeBasketPage = function (delta) {
    basketPage += delta;
    renderBasket();
    renderBasketPagination();
    updateBasketResultsCount();
  };

  // A labeled divider row, not just colour, so the restricted group
  // reads as an intentional, explained block rather than an
  // undifferentiated wall of pink — especially important on a page
  // where every row happens to be restricted and there's nothing to
  // visually contrast it against.
  function buildDividerRow(kind, count) {
    const tr = document.createElement("tr");
    tr.classList.add("basket-divider-row");
    const td = document.createElement("td");
    td.colSpan = 3;
    if (kind === "restricted") {
      td.innerHTML = '<i class="ti ti-lock" aria-hidden="true" style="margin-right:6px;"></i>' +
        "<strong>Restricted variable" + (count === 1 ? "" : "s") + " (" + count + ")</strong> — pinned to the top";
      td.style.cssText = "background:#FCEBEB; color:#791F1F; font-weight:600; padding:6px 12px; " +
        "border-top:2px solid #E24B4A; border-bottom:2px solid #E24B4A; font-size:12.5px;";
    } else {
      td.textContent = "Other variables";
      td.style.cssText = "color:#888; font-size:11.5px; font-weight:600; text-transform:uppercase; " +
        "letter-spacing:0.04em; padding:8px 12px 4px; border-top:1px solid rgba(0,0,0,0.08);";
    }
    tr.appendChild(td);
    return tr;
  }

  function renderBasket() {
    let basket = loadBasket();
    basket = sortBasketData(basket);

    // Restricted variables are pinned to the top, ahead of everything
    // else — partitioning rather than replacing the sort means the
    // column sort the user picked is still respected *within* each
    // group. Done before pagination (not just within the current page)
    // so a restricted variable never ends up buried on page 3.
    const restrictedFirst = basket.filter(item => isRestricted(item.varName));
    const rest = basket.filter(item => !isRestricted(item.varName));
    basket = restrictedFirst.concat(rest);

    const tbody = document.querySelector("#basketTable tbody");
    const countEl = document.getElementById("basketCountPage");

    tbody.innerHTML = "";
    countEl.textContent = basket.length;

    updateBasketLimitWarning();
    updateBasketRestrictedWarning();

    const start = (basketPage - 1) * basketPageSize;
    const end = start + basketPageSize;

    basket.slice(start, end).forEach(function (item, i) {
      const globalIndex = start + i;

      // Header divider right before the very first restricted row
      // overall (only ever the first row of page 1, since restricted
      // items are always pinned to the front).
      if (globalIndex === 0 && restrictedFirst.length > 0 && isRestricted(item.varName)) {
        tbody.appendChild(buildDividerRow("restricted", restrictedFirst.length));
      }

      // Quieter divider right where the restricted block ends and
      // ordinary rows resume — checked against the FULL list's
      // boundary, not just this page, so it still shows up correctly
      // even when that boundary falls in the middle of a page rather
      // than neatly between pages.
      if (globalIndex === restrictedFirst.length && restrictedFirst.length > 0 &&
          restrictedFirst.length < basket.length) {
        tbody.appendChild(buildDividerRow("rest"));
      }

      const tr = document.createElement("tr");

      // Light tint so a restricted row is visible at a glance even
      // before noticing the lock icon next to its name (added
      // separately, site-wide, by variable-restricted-icon.js).
      // Applied to each CELL, not the row — this table gives every
      // column its own background colour (green/purple/peach), and a
      // td's own background always paints over its parent tr's, so
      // setting tr.style.background alone had no visible effect.
      // !important guarantees it wins regardless of how specific the
      // existing column-colour rule is.
      const restricted = isRestricted(item.varName);
      if (restricted) tr.classList.add("restricted-row");

      function tintIfRestricted(td) {
        if (restricted) td.style.setProperty("background", "#FCEBEB", "important");
      }

      // ============================================================
      // ⭐ REMOVE BUTTON — now uses global removeFromBasket()
      // ============================================================
      const tdRemove = document.createElement("td");
      tintIfRestricted(tdRemove);
      const btn = document.createElement("button");
      btn.textContent = "Remove";

      btn.addEventListener("click", function () {

        // ⭐ Use global remove function (this triggers shake animation)
        clearUploadDone();
        removeFromBasket(item.varName);

        // Recalculate pagination if needed
        const b = loadBasket();
        const maxPage = Math.ceil(b.length / basketPageSize) || 1;
        if (basketPage > maxPage) basketPage = maxPage;

        // Refresh UI
        renderBasket();
        renderBasketPagination();
        updateBasketResultsCount();

        // ⭐ Ensure glow + shake + count update runs
        updateBasketCountUI();
      });

      tdRemove.appendChild(btn);
      tr.appendChild(tdRemove);

	// ⭐ Variable name as link to metadata page
	const tdName = document.createElement("td");
	tintIfRestricted(tdName);
	const link = document.createElement("a");

	link.textContent = item.varName;
	link.href = `https://rmjdish.github.io/OWL/assets/variable_metadata/${item.varName}.html`;
	link.target = "_blank";  // optional: open in new tab

	tdName.appendChild(link);
	tr.appendChild(tdName);

      // Label
      const tdLabel = document.createElement("td");
      tintIfRestricted(tdLabel);
      tdLabel.textContent = item.label || "";
      tr.appendChild(tdLabel);

      tbody.appendChild(tr);
    });

    renderBasketPagination();
    updateBasketResultsCount();
  }

  // The "N new variable(s) added" message describes the basket at the moment
  // of confirming. Once the user edits the basket (removes, clears, undoes)
  // it's no longer true, so it's cleared. uploadDoneBasketCount remembers the
  // basket size right after confirming, so unrelated "basket changed" events
  // fired for the upload itself don't wipe the message straight away.
  let uploadDoneBasketCount = null;
  function clearUploadDone() {
    const el = document.getElementById("uploadDone");
    const hadMessage = !!(el && el.innerHTML.trim());
    if (el) el.innerHTML = "";
    uploadDoneBasketCount = null;
    // The panel is only still open to show that message, so close it too
    // and let the table move up. Skipped when no message was showing, so
    // editing the basket never closes an upload that's mid-preview.
    if (hadMessage) closeUploadPanel();
  }

  function clearBasket() {
    const confirmed = confirm("Are you sure you want to clear your basket?");
    if (!confirmed) return;

    saveBasket([]);
    clearUploadDone();
    basketPage = 1;
    renderBasket();
    renderBasketPagination();
    updateBasketResultsCount();
    updateBasketCountUI();
    updateBasketLimitWarning();
  }

  // ── Lazy-load ExcelJS from CDN, only when a download or upload is requested ──
  function loadExcelJS() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    if (exceljsLoadPromise) return exceljsLoadPromise;

    exceljsLoadPromise = new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      script.src = EXCELJS_CDN_URL;
      script.onload = function () {
        if (window.ExcelJS) resolve(window.ExcelJS);
        else reject(new Error("ExcelJS failed to initialise after loading."));
      };
      script.onerror = function () {
        reject(new Error("Failed to load ExcelJS from CDN."));
      };
      document.head.appendChild(script);
    });

    return exceljsLoadPromise;
  }

  // ── Load the full data dictionary (cached after first fetch) ───────
  async function loadDataDictionary() {
    if (dictionaryCache) return dictionaryCache;
    const resp = await fetch(DATA_DICTIONARY_URL);
    if (!resp.ok) {
      throw new Error(`Failed to fetch data dictionary: ${resp.status}`);
    }
    dictionaryCache = await resp.json();
    return dictionaryCache;
  }

  function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  // ── Ask the user where to save, up front, before any slow work ────
  // ── (fetching the dictionary, building the workbook). Browsers    ─
  // ── only allow showSaveFilePicker within a few seconds of the     ─
  // ── actual click — asking for it after several seconds of async   ─
  // ── work causes it to silently fail and fall back to a plain      ─
  // ── download, which is why the picker seemed to "disappear".      ─
  // ── Returns { handle } on success, { cancelled: true } if the     ─
  // ── user closed the dialog, or { handle: null } if unsupported.   ─
  async function requestSaveHandle(suggestedName) {
    if (!window.showSaveFilePicker) {
      return { handle: null };
    }
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: suggestedName,
        types: [
          {
            description: "Excel Workbook",
            accept: {
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"]
            }
          }
        ]
      });
      return { handle };
    } catch (err) {
      if (err && err.name === "AbortError") {
        return { cancelled: true };
      }
      console.warn("showSaveFilePicker unavailable, will fall back to a standard download:", err);
      return { handle: null };
    }
  }

  // ── Write the finished blob to an already-obtained file handle,  ──
  // ── or fall back to a normal browser download if none was given. ──
  async function writeBlobToHandle(blob, handle, suggestedName) {
    if (handle) {
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    }
    triggerBlobDownload(blob, suggestedName);
  }

  // ── Build and download the full Data Dictionary as .xlsx, with a ──
  // ── "Request variable" column: Y for basket variables, blank for ──
  // ── every other row. Formatting mirrors the original workbook.   ──
  async function downloadBasketCSV() {
    const basket = loadBasket();
    if (!basket.length) {
      alert("Basket is empty");
      return;
    }

    // ── Heads-up at the point of download: Condor now accepts larger ──
    // ── baskets and splits them into smaller baskets of 500, which  ──
    // ── are assessed collectively, so turnaround may be longer.      ──
    // ── Shown as a confirm() so the user can back out and trim the  ──
    // ── basket first if they'd rather keep it under 500.            ──
    if (basket.length > 500) {
      const proceed = confirm(
        `Your basket has ${basket.length} variables. Condor will split baskets of more than 500 variables into smaller baskets of 500.\n\n` +
        `These smaller baskets are assessed collectively, so your request may take longer to turn around. ` +
        `Continue with the download?`
      );
      if (!proceed) return;
    }

    const suggestedName = "NSHD_Data_Dictionary_Saved.xlsx";

    // Ask where to save FIRST, while the click's user activation is
    // still fresh — before any fetching or workbook building begins.
    const saveTarget = await requestSaveHandle(suggestedName);
    if (saveTarget.cancelled) {
      // User closed the save dialog — nothing more to do.
      return;
    }

    const downloadBtn = document.getElementById("downloadBasketCsvBtn");
    const originalBtnText = downloadBtn ? downloadBtn.textContent : null;
    if (downloadBtn) {
      downloadBtn.disabled = true;
      downloadBtn.textContent = "Preparing download…";
    }

    try {
      const [ExcelJS, dictionary] = await Promise.all([
        loadExcelJS(),
        loadDataDictionary()
      ]);

      const requestedByName = new Map(basket.map(item => [item.varName, item]));

      // Dictionary columns as they appear in the JSON, minus the ones that
      // aren't in the downloadable blank dictionary (Order is only used
      // for sorting on the website; Showcase Field ID has been retired).
      const baseColumns = (dictionary.length
        ? Object.keys(dictionary[0])
        : ["NSHD Variable Name", "Variable Label"]
      ).filter(col => !EXPORT_EXCLUDED_COLUMNS.includes(col));

      // Layout matches the blank dictionary: "Request variable" sits
      // straight after "NSHD Variable Name". The pre-filled extras
      // (Variable Role, Researcher's Notes) go at the far right, after
      // the dictionary's own Notes column.
      const columns = baseColumns.slice();
      const nameColPos = columns.indexOf("NSHD Variable Name");
      columns.splice(nameColPos === -1 ? columns.length : nameColPos + 1, 0, "Request variable");
      columns.push("Variable Role", "Researcher's Notes");

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Data_dictionary", {
        views: [{ state: "frozen", ySplit: 1 }]
      });

      // Dropdown column shows its actual options directly in the header
      // text (on a second line) so they're visible at a glance, without
      // needing to click into a cell or hover a comment to find them.
      const ROLE_HEADER_TEXT = "Variable Role \u25BE\n(" + ROLE_OPTIONS.join(" / ") + ")";
      sheet.columns = columns.map(function (colName) {
        const displayHeader = colName === "Variable Role" ? ROLE_HEADER_TEXT : colName;
        return { header: displayHeader, key: colName, width: COLUMN_WIDTHS[colName] || 18 };
      });

      // ── Column-level highlight for the Request variable column: ────
      // ── bold, centered, filled for every row (header keeps its own ─
      // ── distinct colour below, since cell-level style wins there). ─
      const reqColIndex = columns.indexOf("Request variable") + 1;
      const reqColumn = sheet.getColumn(reqColIndex);
      reqColumn.font = { bold: true };
      reqColumn.alignment = { horizontal: "center", vertical: "middle" };
      reqColumn.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFF2CC" }
      };

      // ── Role column: dropdown list, applied to the whole data range ─
      // ── in one call rather than per-cell (fast even at 28k+ rows). ──
      const roleColIndex = columns.indexOf("Variable Role") + 1;
      const roleColLetter = sheet.getColumn(roleColIndex).letter;
      sheet.dataValidations.add(
        `${roleColLetter}2:${roleColLetter}${dictionary.length + 1}`,
        {
          type: "list",
          allowBlank: true,
          formulae: [`"${ROLE_OPTIONS.join(",")}"`],
          showErrorMessage: true,
          errorStyle: "stop",
          errorTitle: "Invalid role",
          error: `Please choose a value from the list: ${ROLE_OPTIONS.join(", ")}.`
        }
      );

      // ── Header row styling, matching the original workbook ──────────
      const headerRow = sheet.getRow(1);
      headerRow.height = 56;
      columns.forEach(function (colName, idx) {
        const cell = headerRow.getCell(idx + 1);
        cell.font = { bold: true };
        cell.alignment = { horizontal: "center", vertical: "bottom", wrapText: true };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: HEADER_FILLS[colName] || "FFD9D9D9" }
        };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" }
        };

        if (colName === "Variable Role") {
          cell.note = {
            texts: [{
              text: `Optional — fill in yourself. Choose how this variable is used in your analysis: ${ROLE_OPTIONS.join(", ")}.`
            }]
          };
        } else if (colName === "Researcher's Notes") {
          cell.note = {
            texts: [{
              text: "Optional — fill in yourself. Add any free-text notes about how you plan to use this variable."
            }]
          };
        }
      });

      // ── Data rows: every dictionary row, Request variable = Y only ──
      // ── for basket matches, blank for everything else.             ──
      dictionary.forEach(function (dictRow) {
        const rowValues = {};
        baseColumns.forEach(function (col) {
          rowValues[col] = dictRow[col];
        });
        const matchedItem = requestedByName.get(dictRow["NSHD Variable Name"]);
        rowValues["Request variable"] = matchedItem ? "Y" : "";
        rowValues["Variable Role"] = matchedItem ? (matchedItem.role || "") : "";
        rowValues["Researcher's Notes"] = matchedItem ? (matchedItem.note || "") : "";
        sheet.addRow(rowValues);
      });

      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: dictionary.length + 1, column: columns.length }
      };

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });

      await writeBlobToHandle(blob, saveTarget.handle, suggestedName);

      const savedName = (saveTarget.handle && saveTarget.handle.name) || suggestedName;
      if (saveTarget.handle) {
        alert(`Done! "${savedName}" has been saved to the location you chose.`);
      } else {
        alert(`Done! "${savedName}" has been downloaded — check your browser's downloads bar or your default Downloads folder.`);
      }
    } catch (err) {
      console.error("Could not build the full data dictionary export:", err);
      alert("Something went wrong preparing your download. Please try again.");
    } finally {
      if (downloadBtn) {
        downloadBtn.disabled = false;
        downloadBtn.textContent = originalBtnText;
      }
    }
  }

  // ================================================================
  // ── UPLOAD BASKET ────────────────────────────────────────────────
  // Restore a previous basket from either:
  //  (a) a basket file downloaded earlier from OWL (the full Data
  //      Dictionary .xlsx, with "Request variable" = Y for saved items), or
  //  (b) a plain CSV with NSHD Variable Name (+ optional label) columns.
  // Auto-detected by file extension and by whether a "Request variable"
  // column is present. Nothing is written to the basket until the user
  // reviews the preview list and clicks "Confirm & Add to Basket".
  // OWL itself has no hard basket-size limit — unlike downloadBasketCSV(),
  // this only *notes* if the resulting basket would exceed 500 variables
  // (which Condor splits into smaller baskets); it never blocks adding here.
  // ================================================================

  const CONDOR_BASKET_LIMIT = 500;
  const NAME_COL = "nshd variable name";
  const REQUEST_COL = "request variable";
  const LABEL_COL_CANDIDATES = ["variable label", "variable_label", "label"];

  let uploadParsedItems = []; // { name, label, isNew }
  let uploadLinkedSiblings = []; // [{ varName, label }, ...] — computed per file, before confirm
  // The file's own rows, split by restriction status. Kept as data
  // rather than pre-built HTML so rebuildPreviewTableBody() can number
  // them continuously alongside the sync rows, whose own count can
  // change independently (the "include linked" checkbox can be toggled
  // without re-parsing the file).
  let uploadRestrictedFileItems = []; // { name, label, isNew }
  let uploadNormalFileItems = []; // { name, label, isNew }
  let uploadExistingVarNames = new Set(); // basket contents at the moment this file was parsed

  function normCell(v) {
    return (v === null || v === undefined) ? "" : String(v).trim();
  }

  function findColIndex(headerRow, targetLower) {
    for (let i = 0; i < headerRow.length; i++) {
      if (normCell(headerRow[i]).toLowerCase() === targetLower) return i;
    }
    return -1;
  }

  function findFirstColIndex(headerRow, candidatesLower) {
    for (const c of candidatesLower) {
      const idx = findColIndex(headerRow, c);
      if (idx !== -1) return idx;
    }
    return -1;
  }

  function showUploadProgress(pct, label, indeterminate) {
    const container = document.getElementById("uploadProgressContainer");
    const fill = document.getElementById("uploadProgressFill");
    const labelEl = document.getElementById("uploadProgressLabel");
    container.style.display = "block";
    labelEl.style.display = "block";
    labelEl.textContent = label;
    if (indeterminate) {
      fill.classList.add("indeterminate");
      fill.textContent = "";
    } else {
      fill.classList.remove("indeterminate");
      fill.style.width = pct + "%";
      fill.textContent = pct + "%";
    }
  }

  function hideUploadProgress() {
    document.getElementById("uploadProgressContainer").style.display = "none";
    document.getElementById("uploadProgressLabel").style.display = "none";
    const fill = document.getElementById("uploadProgressFill");
    fill.classList.remove("indeterminate");
    fill.style.width = "0%";
    fill.textContent = "0%";
  }

  function resetUploadPanel() {
    document.getElementById("uploadStatus").textContent = "";
    document.getElementById("uploadMissingNameBox").style.display = "none";
    document.getElementById("uploadInvalidValueBox").style.display = "none";
    document.getElementById("uploadDuplicateBox").style.display = "none";
    document.getElementById("uploadLimitWarningBox").style.display = "none";
    const restrictedBanner = document.getElementById("uploadRestrictedBanner");
    if (restrictedBanner) restrictedBanner.style.display = "none";
    document.getElementById("uploadPreview").style.display = "none";
    document.getElementById("uploadDone").innerHTML = "";
    uploadLinkedSiblings = [];
    uploadExistingVarNames = new Set();
    uploadRestrictedFileItems = [];
    uploadNormalFileItems = [];
    const linkedRow = document.getElementById("uploadIncludeLinkedRow");
    if (linkedRow) linkedRow.style.display = "none";
    const syncAddedBox = document.getElementById("uploadSyncAddedBox");
    if (syncAddedBox) syncAddedBox.style.display = "none";
    const syncNote = document.getElementById("uploadSyncNote");
    if (syncNote) syncNote.style.display = "none";
  }

  function setUploadIntroVisible(visible) {
    const intro = document.querySelector(".upload-basket-intro");
    if (intro) intro.style.display = visible ? "" : "none";
  }

  function closeUploadPanel() {
    document.getElementById("uploadBasketPanel").style.display = "none";
    const fileInput = document.getElementById("uploadBasketFile");
    if (fileInput) fileInput.value = "";
    uploadParsedItems = [];
    resetUploadPanel();
    hideUploadProgress();
    setUploadIntroVisible(true);
  }

  function handleUploadFile(file, uploadBtn) {
    resetUploadPanel();
    document.getElementById("uploadBasketPanel").style.display = "block";
    uploadBtn.disabled = true;
    // Pre-upload guidance has served its purpose the moment there's an
    // actual file being processed — from here on the screen fills with
    // real, specific outcomes (progress, checks, banners, preview), and
    // the generic "here's what you can upload" text is just competing
    // with them for attention rather than adding anything new.
    setUploadIntroVisible(false);
    showUploadProgress(0, "Reading file... 0%", false);

    const isCsv = /\.csv$/i.test(file.name);
    const reader = new FileReader();

    reader.onprogress = function (e) {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        showUploadProgress(pct, "Reading file... " + pct + "%", false);
      }
    };

    reader.onerror = function () {
      hideUploadProgress();
      document.getElementById("uploadStatus").textContent = "Could not read the file.";
      uploadBtn.disabled = false;
    };

    reader.onload = function (e) {
      showUploadProgress(100, "Parsing file, please wait...", true);
      setTimeout(function () {
        if (isCsv) {
          parseUploadCsv(e.target.result, uploadBtn);
        } else {
          parseUploadXlsx(e.target.result, uploadBtn);
        }
      }, 30);
    };

    if (isCsv) {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  }

  function parseUploadCsv(text, uploadBtn) {
    const rows = text.split(/\r?\n/)
      .filter(l => l.trim() !== "")
      .map(l => l.split(",").map(c => c.replace(/^"|"$/g, "").trim()));
    processUploadRows(rows, uploadBtn);
  }

  async function parseUploadXlsx(arrayBuffer, uploadBtn) {
    function fail(msg) {
      hideUploadProgress();
      document.getElementById("uploadStatus").textContent = msg;
      uploadBtn.disabled = false;
    }

    let ExcelJS;
    try {
      ExcelJS = await loadExcelJS();
    } catch (err) {
      fail("Could not load the spreadsheet reader. Check your connection and try again.");
      return;
    }

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(arrayBuffer);
    } catch (err) {
      fail("Could not parse this file as a spreadsheet.");
      return;
    }

    const sheet = workbook.getWorksheet("Data_dictionary") || workbook.worksheets[0];
    if (!sheet) {
      fail("No sheet found in this spreadsheet.");
      return;
    }

    const rows = [];
    sheet.eachRow({ includeEmpty: false }, function (row) {
      const values = row.values.slice(1); // ExcelJS rows are 1-indexed; drop the leading undefined
      rows.push(values.map(function (v) {
        if (v === null || v === undefined) return "";
        if (typeof v === "object" && v.text !== undefined) return v.text; // rich text cells
        return v;
      }));
    });

    if (rows.length < 2) {
      fail("No data rows found in the spreadsheet.");
      return;
    }

    processUploadRows(rows, uploadBtn);
  }

  function renderUploadLinkedOption(count) {
    let row = document.getElementById("uploadIncludeLinkedRow");
    if (count === 0) {
      if (row) row.style.display = "none";
      updateSyncAddedBox();
      return;
    }
    if (!row) {
      row = document.createElement("label");
      row.id = "uploadIncludeLinkedRow";
      Object.assign(row.style, {
        display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px",
        background: "#F3E5F5", borderRadius: "6px", fontSize: "13px",
        margin: "10px 0", cursor: "pointer"
      });
      const input = document.createElement("input");
      input.type = "checkbox";
      input.id = "uploadIncludeLinkedCheckbox";
      input.checked = (typeof getAutoAddSiblings === "function") ? getAutoAddSiblings() : true;
      input.addEventListener("change", updateSyncAddedBox);
      const text = document.createElement("span");
      text.id = "uploadIncludeLinkedLabel";
      row.appendChild(input);
      row.appendChild(text);

      const previewBody = document.getElementById("uploadPreviewBody");
      const table = previewBody ? previewBody.closest("table") : null;
      if (table && table.parentNode) {
        table.parentNode.insertBefore(row, table);
      } else {
        document.getElementById("uploadPreview").insertBefore(row, document.getElementById("uploadPreview").firstChild);
      }
    }
    row.style.display = "flex";
    document.getElementById("uploadIncludeLinkedLabel").textContent =
      `Also include ${count} linked sweep${count === 1 ? "" : "s"} of longitudinal variables in this file`;
    updateSyncAddedBox();
  }

  // ── "Extra variables added because of Sync linked sweeps" check ─────────
  // Deliberately narrower than uploadLinkedSiblings: that list is every
  // sibling of a variable in the file, full stop. This box should only
  // ever show siblings that would be a genuinely NEW addition — i.e. not
  // already sitting in the user's basket before this upload, and not
  // already one of the file's own listed variables (uploadLinkedSiblings
  // already excludes the latter). Showing a sibling here that the user
  // already had in their basket for unrelated reasons would overstate
  // what this specific upload is actually adding.
  // The siblings that WOULD be new additions if included — independent of
  // whether the checkbox happens to be ticked right now. Used to decide
  // whether the detail box has anything to say at all.
  function getSyncCandidateItems() {
    return uploadLinkedSiblings.filter(s => !uploadExistingVarNames.has(s.varName));
  }

  function isIncludeLinkedChecked() {
    const checkbox = document.getElementById("uploadIncludeLinkedCheckbox");
    return checkbox ? checkbox.checked : false;
  }

  // Rebuilds the preview table with sync-added rows at the top, then
  // restricted rows from the file, then everything else — all three
  // groups sharing one continuous row count (1, 2, 3, ...) rather than
  // each starting its own. Sync rows only appear here when they'll
  // actually be added — i.e. the checkbox is ticked — since the table
  // represents what confirming will really do, not what's merely possible.
  function rebuildPreviewTableBody() {
    const syncItems = isIncludeLinkedChecked() ? getSyncCandidateItems() : [];
    let idx = 0;
    let html = "";

    syncItems.forEach(function (s) {
      idx++;
      // A restricted tint wins over the usual sync-added mint background —
      // restriction is the more important thing to notice, and a linked
      // sibling can be restricted just like any other variable.
      // Same fix as the main basket table: apply to each cell with
      // !important, not just the row, in case this table's own CSS
      // also colours cells individually (e.g. the status column).
      const restrictedBg = isRestricted(s.varName) ? "background:#FCEBEB !important;" : "";
      const cellStyle = restrictedBg ? ' style="' + restrictedBg + '"' : '';
      html += '<tr class="sync-added-row">' +
        '<td style="text-align:center;' + restrictedBg + '">' + idx +
        ' <i class="ti ti-link" aria-hidden="true" title="Added because of Sync linked sweeps"></i></td>' +
        "<td" + cellStyle + ">" + s.varName + "</td><td" + cellStyle + ">" + (s.label || "") + "</td>" +
        '<td class="status-sync"' + cellStyle + ">Linked sweep (auto)</td></tr>";
    });

    uploadRestrictedFileItems.forEach(function (item) {
      idx++;
      const statusText = (item.isNew ? "New" : "Already in basket") + " — Restricted variable";
      html += "<tr>" +
        '<td style="text-align:center;background:#FCEBEB !important;">' + idx +
        ' <i class="ti ti-lock" aria-hidden="true" title="Restricted variable" style="color:hsl(4 70% 45%);"></i></td>' +
        '<td style="background:#FCEBEB !important;">' + item.name + "</td>" +
        '<td style="background:#FCEBEB !important;">' + item.label + "</td>" +
        '<td class="' + (item.isNew ? "status-new" : "status-existing") +
        '" style="background:#FCEBEB !important;">' + statusText + "</td></tr>";
    });

    uploadNormalFileItems.forEach(function (item) {
      idx++;
      html += "<tr><td>" + idx + "</td><td>" + item.name + "</td><td>" + item.label + "</td>" +
        '<td class="' + (item.isNew ? "status-new" : "status-existing") + '">' +
        (item.isNew ? "New" : "Already in basket") + "</td></tr>";
    });

    document.getElementById("uploadPreviewBody").innerHTML = html;
  }

  function updateSyncAddedBox() {
    const box = document.getElementById("uploadSyncAddedBox");
    const summary = document.getElementById("uploadSyncAddedSummary");
    const detail = document.getElementById("uploadSyncAddedDetail");
    if (!box || !summary || !detail) return;

    rebuildPreviewTableBody();

    const candidates = getSyncCandidateItems();
    if (candidates.length === 0) {
      box.style.display = "none";
      return;
    }

    const names = candidates.map(s => s.varName);
    const nameList = names.slice(0, 50).join(", ") +
      (names.length > 50 ? ", ...and " + (names.length - 50) + " more" : "");

    box.style.display = "block";

    if (isIncludeLinkedChecked()) {
      document.getElementById("uploadSyncAddedSummary").textContent =
        candidates.length + " extra variable(s) will be added because of Sync linked sweeps:";
      detail.textContent =
        "These aren't in the file itself and aren't already in your basket — they're sibling sweeps included because Sync linked sweeps is on: " +
        nameList +
        ". Untick \"Also include linked sweeps\" above to add only what's literally in the file. They're also shown at the top of the table below.";
    } else {
      document.getElementById("uploadSyncAddedSummary").textContent =
        candidates.length + " linked sweep(s) found, but won't be added — Sync linked sweeps is off:";
      detail.textContent =
        "These sibling sweeps of variables in your file won't be added, because Sync linked sweeps is off for this upload: " +
        nameList +
        ". Turn on the toggle next to the basket icon if you want this on generally, or tick \"Also include linked sweeps\" above to include them for this upload only.";
    }
  }

  function processUploadRows(rows, uploadBtn) {
    function fail(msg) {
      hideUploadProgress();
      document.getElementById("uploadStatus").textContent = msg;
      uploadBtn.disabled = false;
    }

    const headerRow = rows[0];
    const nameIdx = findColIndex(headerRow, NAME_COL);
    const labelIdx = findFirstColIndex(headerRow, LABEL_COL_CANDIDATES);
    // The pre-filled export calls it "Request variable"; the blank
    // dictionary calls it "Request Variable (Y)". Accept either, otherwise
    // a marked-up blank would look like it has no request column and every
    // row in it would be added to the basket.
    let reqIdx = findColIndex(headerRow, REQUEST_COL);
    if (reqIdx === -1) reqIdx = findColIndex(headerRow, "request variable (y)");

    if (nameIdx === -1) {
      fail('Could not find a "NSHD Variable Name" column. Check the column headers in the file.');
      return;
    }

    const requireY = reqIdx !== -1;
    const existingBasket = loadBasket();
    const existingSet = new Set(existingBasket.map(item => item.varName));
    uploadExistingVarNames = existingSet;

    // The generic "Sync linked sweeps is on" explanation used to show
    // here unconditionally whenever the toggle was on. It's retired —
    // updateSyncAddedBox() (further down, via renderUploadLinkedOption)
    // already shows the concrete outcome ("N extra variable(s) will be
    // added") whenever there's actually something to say, which makes
    // this generic version pure repetition sitting above it.

    uploadParsedItems = [];
    // Split by restriction status here, at parse time — but the actual
    // HTML (including row numbers) is built later in
    // rebuildPreviewTableBody(), where sync rows are also known, so all
    // three groups can share one continuous numbering sequence.
    uploadRestrictedFileItems = [];
    uploadNormalFileItems = [];
    const invalidRequestValues = [];
    const missingNameRows = [];
    const duplicateNames = [];
    const seen = new Set();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const name = normCell(row[nameIdx]);
      const reqVal = requireY ? normCell(row[reqIdx]) : "";

      if (requireY) {
        if (reqVal === "") continue; // not requested, skip silently
        if (reqVal !== "Y") {
          invalidRequestValues.push({ row: i + 1, name: name, value: reqVal });
          continue;
        }
        if (name === "") {
          missingNameRows.push(i + 1);
          continue;
        }
      } else {
        if (name === "") continue; // blank row in a plain basket file, skip silently
      }

      if (seen.has(name)) {
        duplicateNames.push(name);
        continue;
      }
      seen.add(name);

      const label = labelIdx !== -1 ? normCell(row[labelIdx]) : "";
      const isNew = !existingSet.has(name);
      uploadParsedItems.push({ name: name, label: label, isNew: isNew });

      const item = { name: name, label: label, isNew: isNew };
      if (isRestricted(name)) uploadRestrictedFileItems.push(item);
      else uploadNormalFileItems.push(item);
    }


    if (missingNameRows.length > 0) {
      document.getElementById("uploadMissingNameSummary").textContent =
        missingNameRows.length + " row(s) marked Y have no NSHD Variable Name (skipped):";
      document.getElementById("uploadMissingNameDetail").textContent =
        "Rows: " + missingNameRows.slice(0, 50).join(", ") +
        (missingNameRows.length > 50 ? ", ...and " + (missingNameRows.length - 50) + " more" : "");
      document.getElementById("uploadMissingNameBox").style.display = "block";
    }

    if (invalidRequestValues.length > 0) {
      document.getElementById("uploadInvalidValueSummary").textContent =
        invalidRequestValues.length + ' variable(s) have something other than Y in "Request variable" (skipped):';
      const list = invalidRequestValues.slice(0, 50).map(function (r) {
        return (r.name !== "" ? r.name : "row " + r.row + " (no name)") + " \u2192 \"" + r.value + "\"";
      });
      document.getElementById("uploadInvalidValueDetail").textContent =
        list.join(", ") + (invalidRequestValues.length > 50 ? ", ...and " + (invalidRequestValues.length - 50) + " more" : "");
      document.getElementById("uploadInvalidValueBox").style.display = "block";
    }

    if (duplicateNames.length > 0) {
      document.getElementById("uploadDuplicateSummary").textContent =
        duplicateNames.length + " duplicate variable name(s) in the file were skipped after the first occurrence:";
      document.getElementById("uploadDuplicateDetail").textContent =
        duplicateNames.slice(0, 50).join(", ") +
        (duplicateNames.length > 50 ? ", ...and " + (duplicateNames.length - 50) + " more" : "");
      document.getElementById("uploadDuplicateBox").style.display = "block";
    }

    hideUploadProgress();
    uploadBtn.disabled = false;

    if (uploadParsedItems.length === 0) {
      document.getElementById("uploadStatus").textContent = requireY
        ? 'No valid rows marked "Y" with a variable name were found.'
        : "No variable names were found in this file.";
      return;
    }

    const newCount = uploadParsedItems.filter(v => v.isNew).length;
    const projectedTotal = existingBasket.length + newCount;

    // Non-blocking: OWL itself has no hard basket-size limit. This is
    // purely a heads-up that Condor will split anything over 500 into
    // smaller baskets, assessed collectively, when this basket is uploaded.
    if (projectedTotal > CONDOR_BASKET_LIMIT) {
      document.getElementById("uploadLimitSummary").textContent =
        "Heads up: adding these would bring your basket to " + projectedTotal + " variables.";
      document.getElementById("uploadLimitDetail").textContent =
        "That's fine here on OWL. Condor will split baskets of more than " + CONDOR_BASKET_LIMIT +
        " variables into smaller baskets of " + CONDOR_BASKET_LIMIT +
        ", which are assessed collectively and may take longer to turn around.";
      document.getElementById("uploadLimitWarningBox").style.display = "block";
    }

    // Not collapsible, unlike the checks above — this one stays visible
    // for the whole review step rather than needing a click to expand,
    // since it's the one thing worth seeing at a glance before confirming.
    const restrictedInFile = uploadParsedItems.filter(v => isRestricted(v.name));
    const restrictedBanner = document.getElementById("uploadRestrictedBanner");
    if (restrictedBanner) {
      if (restrictedInFile.length > 0) {
        document.getElementById("uploadRestrictedList").textContent =
          restrictedInFile.map(v => v.name).join(", ");
        restrictedBanner.style.display = "block";
      } else {
        restrictedBanner.style.display = "none";
      }
    }

    document.getElementById("uploadVarCount").textContent = uploadParsedItems.length;
    document.getElementById("uploadNewCount").textContent = newCount;
    document.getElementById("uploadAlreadyCount").textContent = uploadParsedItems.length - newCount;
    document.getElementById("uploadCurrentCount").textContent = existingBasket.length;
    rebuildPreviewTableBody();

    uploadLinkedSiblings = [];
    renderUploadLinkedOption(0);
    document.getElementById("uploadPreview").style.display = "block";

    const previewItems = uploadParsedItems.map(v => ({ varName: v.name, label: v.label }));
    expandBasketItemsWithSiblings(previewItems).then(function (siblings) {
      uploadLinkedSiblings = siblings;
      renderUploadLinkedOption(siblings.length);
    });
  }

  const uploadBtn = document.getElementById("uploadBasketBtn");
  const uploadFileInput = document.getElementById("uploadBasketFile");

  if (uploadBtn && uploadFileInput) {
    uploadBtn.addEventListener("click", function () {
      document.getElementById("uploadBasketPanel").style.display = "block";
      resetUploadPanel();
      setUploadIntroVisible(true);
      uploadFileInput.click();
    });

    uploadFileInput.addEventListener("change", function () {
      if (uploadFileInput.files[0]) {
        handleUploadFile(uploadFileInput.files[0], uploadBtn);
      }
    });
  }

  const confirmUploadBtn = document.getElementById("confirmUploadBtn");
  if (confirmUploadBtn) {
    confirmUploadBtn.addEventListener("click", function () {
      if (uploadParsedItems.length === 0) return;

      const items = uploadParsedItems.map(v => ({ varName: v.name, label: v.label }));
      const includeLinkedEl = document.getElementById("uploadIncludeLinkedCheckbox");
      const includeLinked = includeLinkedEl ? includeLinkedEl.checked : false;
      const finalItems = includeLinked ? items.concat(uploadLinkedSiblings) : items;

      // expandSiblings: false — we've already decided inclusion above via the checkbox
      const addedNames = batchAddToBasket(finalItems, { expandSiblings: false });

      document.getElementById("uploadPreview").style.display = "none";

      // All of these describe the file as it stood BEFORE confirming —
      // once the items are actually in the basket, none of them are
      // still true (the sync box says what "will be" added; the
      // restricted banner says what's "found in this file", both now
      // past tense) or still useful (the four checks below were about
      // deciding whether to proceed, a decision that's now made). Only
      // the success message below should remain.
      ["uploadMissingNameBox", "uploadInvalidValueBox", "uploadDuplicateBox",
       "uploadLimitWarningBox", "uploadSyncAddedBox", "uploadRestrictedBanner"]
        .forEach(function (id) {
          const el = document.getElementById(id);
          if (el) el.style.display = "none";
        });

      document.getElementById("uploadDone").innerHTML =
        "<b>" + addedNames.length + " new variable(s) added to your basket.</b> Your basket now has " +
        loadBasket().length + " variable(s).";
      uploadDoneBasketCount = loadBasket().length;

      uploadParsedItems = [];
      uploadLinkedSiblings = [];
      if (uploadFileInput) uploadFileInput.value = "";

      basketPage = 1;
      renderBasket();
      renderBasketPagination();
      updateBasketResultsCount();
      updateBasketCountUI();
      updateBasketLimitWarning();
    });
  }

  const cancelUploadBtn = document.getElementById("cancelUploadBtn");
  if (cancelUploadBtn) {
    cancelUploadBtn.addEventListener("click", closeUploadPanel);
  }

  document.getElementById("clearBasketBtn").addEventListener("click", clearBasket);
  document.getElementById("downloadBasketCsvBtn").addEventListener("click", downloadBasketCSV);

  document.querySelectorAll("th[data-sort]").forEach(th => {
    th.addEventListener("click", () => {
      const col = th.getAttribute("data-sort");

      if (basketSortColumn === col) {
        basketSortDirection = basketSortDirection === "asc" ? "desc" : "asc";
      } else {
        basketSortColumn = col;
        basketSortDirection = "asc";
      }

      document.querySelectorAll("th[data-sort]").forEach(h => {
        h.classList.remove("asc", "desc");
      });
      th.classList.add(basketSortDirection);

      renderBasket();
      renderBasketPagination();
      updateBasketResultsCount();
    });
  });

  renderBasket();
  updateBasketLimitWarning();
  updateBasketRestrictedWarning();
  loadRestrictedLookup();

  // ── Keep the visible list in sync with async basket changes ─────────────
  // The Remove button above calls renderBasket() synchronously right after
  // removeFromBasket() — but sibling removal (when Sync linked sweeps is
  // on) happens asynchronously afterward, once the dictionary lookup in
  // basket_header.js resolves. That's why the toast and header counter
  // updated correctly (they're driven directly by that same async code)
  // while this page's own table kept showing rows that were already gone
  // from storage. This listener re-renders once that async step lands,
  // for removals, additions (e.g. an upload's linked-sweeps expansion),
  // or a toast's Undo — any of which can change the basket after this
  // page's own handlers have already finished running.
  window.addEventListener("nshd-basket-changed", () => {
    const b = loadBasket();
    // Edited since the upload message was shown (remove, undo, sibling removal)
    if (uploadDoneBasketCount !== null && b.length !== uploadDoneBasketCount) clearUploadDone();
    const maxPage = Math.ceil(b.length / basketPageSize) || 1;
    if (basketPage > maxPage) basketPage = maxPage;
    renderBasket();
    renderBasketPagination();
    updateBasketResultsCount();
  });

  // ── Mirror the global Sync toggle into an open upload panel ──────────────
  // One-directional: the toggle drives the checkbox (on → checked, off →
  // unchecked), but ticking/unticking the checkbox itself never touches the
  // toggle — it's meant as a one-time, this-upload-only override, not a
  // way to change the persistent site-wide setting.
  window.addEventListener("nshd-sync-toggle-changed", (e) => {
    const checkbox = document.getElementById("uploadIncludeLinkedCheckbox");
    if (!checkbox) return;
    checkbox.checked = !!(e.detail && e.detail.on);
    updateSyncAddedBox();
  });

});