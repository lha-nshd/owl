// ============================================================
// NSHD Search by Year of Data Collection – Search, Filters,
// Table, Basket. Mirrors data_dictionary.js patterns.
// ============================================================

// BASKET_KEY, loadBasket, addToBasket, removeFromBasket,
// batchAddToBasket, batchRemoveFromBasket, updateBasketCountUI
// are all defined globally in basket_header.js — reused as-is.

// ============================================================
// CONFIG — CONFIRM THESE AGAINST YOUR ACTUAL JSON KEYS
// ============================================================

const YEAR_FIELD = "Year of collection";      // raw year/range field, e.g. "2006-10"
const FORM_FIELD = "Form";

// Subtopic 1 is the reliable field for identifying these sub-studies —
// Form is NOT reliable (e.g. a Covid row's Form can be "Blood assays").
// Matching strips apostrophes so straight/curly quotes don't matter,
// though neither of these particular keywords currently needs one.
const IDENTIFY_FIELD = "Subtopic 1";
const WOMENS_HEALTH_KEYWORDS = ["womens health"];   // matches "Womens health questionnaire [700]"
const COVID_KEYWORDS = ["covid"];                    // matches "Covid questionnaires [602]"

function normalizeForMatch(str) {
  return String(str || "").toLowerCase().replace(/['’‘‛]/g, "");
}

// Returns "wh", "covid", or "gen" for a row — drives both which pill
// it falls into and what colour that pill gets.
function categorizeRow(row) {
  const val = normalizeForMatch(row[IDENTIFY_FIELD]);
  if (WOMENS_HEALTH_KEYWORDS.some(k => val.includes(normalizeForMatch(k)))) return "wh";
  if (COVID_KEYWORDS.some(k => val.includes(normalizeForMatch(k)))) return "covid";

  // Some Covid variables sit outside the "Specialist questionnaire" subtopic
  // and so don't match on Subtopic 1 — but they do carry "Covid" in Form,
  // so check that too before falling back to general.
  const formVal = normalizeForMatch(row[FORM_FIELD]);
  if (COVID_KEYWORDS.some(k => formVal.includes(normalizeForMatch(k)))) return "covid";

  return "gen";
}

// Columns shown in the table, in this exact order.
// type: "varlink" | "text" | "yearbadge"
const COLUMNS_CONFIG = [
  { key: "NSHD Variable Name", label: "Variable name",   type: "varlink" },
  { key: "Variable Label",     label: "Variable Label",  type: "text" },
  { key: "Units",              label: "Units",           type: "text" },
  { key: "Form",               label: "Form",            type: "text" },
  { key: "Question Number",    label: "Question number", type: "text" },
  { key: YEAR_FIELD,           label: "Year",            type: "yearbadge" }
];

// Keys that live on each row object but must never be searched or exported:
// Showcase Field ID has been retired from the table, and "__"-prefixed keys
// are the cached helper values added by precomputeRowMetadata().
const HIDDEN_KEYS = ["Showcase Field ID"];
function isVisibleKey(k) {
  return !k.startsWith("__") && !HIDDEN_KEYS.includes(k);
}

// Same 5-level topic hierarchy as the Search Data Dictionary page.
const filterColumns = [
  "Topic",
  "Subtopic 1",
  "Subtopic 2",
  "Subtopic 3",
  "Subtopic 4"
];

// The cohort was born in 1946 — used to compute "Age X" or "Age X–Y"
// automatically for every pill, including sub-studies and any future
// year added to the data. No per-year lookup table needed.
const BIRTH_YEAR = 1946;

function ageLabelForRange(start, end) {
  if (start === BIRTH_YEAR && end === BIRTH_YEAR) return "Birth";
  const ageStart = start - BIRTH_YEAR;
  const ageEnd = end - BIRTH_YEAR;
  return ageStart === ageEnd ? `Age ${ageStart}` : `Age ${ageStart}–${ageEnd}`;
}

// Sub-studies are pills that don't correspond to one simple year — either
// identified by Form text (Women's health) or spanning specific known
// ranges (Insight46, MyoFit, Covid). `sortStart` controls where they land
// among the auto-generated year pills below. `ageRange` drives the
// automatic age subtitle.
// Insight46 and MyoFit are still matched on fixed known ranges — if
// these turn out to need Subtopic 1 matching too (like Women's health
// and Covid did), tell me their Subtopic 1 text and I'll switch them
// over the same way.
const SUBSTUDY_DEFINITIONS = [
  { id: "insight46-1", label1: "2015–18",   ageRange: { start: 2015, end: 2018 }, ranges: [{ start: 2015, end: 2018 }], color: "wave-insight", sortStart: 2015 },
  { id: "insight46-2", label1: "2018–21",   ageRange: { start: 2018, end: 2021 }, ranges: [{ start: 2018, end: 2021 }], color: "wave-insight", sortStart: 2018 },
  { id: "myofit",      label1: "2020–25",   ageRange: { start: 2020, end: 2025 }, ranges: [{ start: 2020, end: 2025 }], color: "wave-myofit", sortStart: 2020 }
];
SUBSTUDY_DEFINITIONS.forEach(w => {
  w.label2 = ageLabelForRange(w.ageRange.start, w.ageRange.end);
});

// Legend text + dot colour for each sub-study, shown below the pill bar
// since pills themselves now show age rather than the study name.
const LEGEND_DOT_COLORS = {
  "wave-womens": "#D4537E",
  "wave-insight": "#7F77DD",
  "wave-myofit": "#1D9E75",
  "wave-covid": "#BA7517"
};
const LEGEND_NAMES = {
  "insight46-1": "Insight46",
  "insight46-2": "Insight46",
  myofit: "MyoFit",
  covid: "Covid"
};

// Built once the data loads — see buildAllWaves() below.
let ALL_WAVES = [];
let WAVE_BY_ID = new Map(); // id -> wave, for O(1) lookups instead of scanning ALL_WAVES

// ============================================================
// State
// ============================================================

let rawData = [];
let filteredData = [];
let currentPage = 1;
let pageSize = 15;
let sortColumn = null;
let sortDirection = 1;
let currentSearch = "";
let searchDebounce;
let sortDirty = true;
let activeWaveIds = new Set(); // empty = "All" (no year filter)

let _basketCache = new Set();
function refreshBasketCache() {
  _basketCache = new Set(loadBasket().map(item => item.varName));
}
function inBasketFast(varName) {
  return _basketCache.has(varName);
}

// ============================================================
// Year normalisation + wave matching
// ============================================================

// Parses "2006", "2006-10", or "2006-2010" into { start, end }.
// A two-digit end year is expanded using the century of the start year.
function parseYearField(raw) {
  const s = String(raw || "").trim().replace(/–/g, "-");
  if (!s) return null;

  const parts = s.split("-").map(p => p.trim()).filter(Boolean);
  if (parts.length === 1) {
    const y = parseInt(parts[0], 10);
    return isNaN(y) ? null : { start: y, end: y };
  }

  const startY = parseInt(parts[0], 10);
  let endY;
  if (parts[1].length <= 2) {
    const century = Math.floor(startY / 100) * 100;
    endY = century + parseInt(parts[1], 10);
    if (endY < startY) endY += 100;
  } else {
    endY = parseInt(parts[1], 10);
  }

  if (isNaN(startY) || isNaN(endY)) return null;
  return { start: startY, end: endY };
}

// Runs ONCE when data loads. Caches each row's parsed year, category,
// and matched wave id directly on the row object, so every later click
// is a cheap property/Set lookup instead of re-parsing and re-matching
// the whole dataset against every pill.
function precomputeRowMetadata() {
  rawData.forEach(row => {
    const parsed = parseYearField(row[YEAR_FIELD]);
    row.__parsedYear = parsed;
    row.__category = categorizeRow(row);

    if (!parsed) {
      row.__waveId = null;
      return;
    }

    const substudy = SUBSTUDY_DEFINITIONS.find(w =>
      w.ranges.some(r => r.start === parsed.start && r.end === parsed.end)
    );

    row.__waveId = substudy ? substudy.id : `yr-${parsed.start}-${parsed.end}|${row.__category}`;
  });
}

// Scans the cached per-row wave ids (computed once in
// precomputeRowMetadata) and builds one pill per distinct year/range —
// any year present in the data automatically gets a pill, no code
// changes needed for new sweeps.
function buildAllWaves() {
  const rangesMap = new Map();

  rawData.forEach(row => {
    const id = row.__waveId;
    if (!id || !id.startsWith("yr-")) return; // substudy-claimed or unparsed
    if (!rangesMap.has(id)) {
      rangesMap.set(id, {
        id,
        start: row.__parsedYear.start,
        end: row.__parsedYear.end,
        category: row.__category
      });
    }
  });

  const CATEGORY_COLOR = { wh: "wave-womens", covid: "wave-covid" };
  const CATEGORY_LABEL = { wh: "Women's health", covid: "Covid" };

  const autoYearWaves = [...rangesMap.values()].map(r => ({
    id: r.id,
    label1: r.start === r.end ? String(r.start) : `${r.start}–${String(r.end).slice(-2)}`,
    label2: CATEGORY_LABEL[r.category] || ageLabelForRange(r.start, r.end),
    ranges: [{ start: r.start, end: r.end }],
    category: r.category,
    color: CATEGORY_COLOR[r.category],
    sortStart: r.start
  }));

  ALL_WAVES = [...autoYearWaves, ...SUBSTUDY_DEFINITIONS]
    .sort((a, b) => a.sortStart - b.sortStart);

  WAVE_BY_ID = new Map(ALL_WAVES.map(w => [w.id, w]));
}

function getWaveForRow(row) {
  return WAVE_BY_ID.get(row.__waveId) || null;
}

// Debug helper — run logUniqueYears() in the browser console to see
// every raw value in YEAR_FIELD.
function logUniqueYears() {
  const vals = [...new Set(rawData.map(r => r[YEAR_FIELD]).filter(Boolean))].sort();
  console.log("Unique raw year values:", vals);
}
window.logUniqueYears = logUniqueYears;

// Debug helper — run logSubtopicValues() in the console to see every
// distinct Subtopic 1 value in your data, and which ones get
// categorized as Women's health / Covid / general.
function logSubtopicValues() {
  const vals = [...new Set(rawData.map(r => r[IDENTIFY_FIELD]).filter(Boolean))].sort();
  console.log("Unique Subtopic 1 values:", vals);
  console.log("Matched as Women's health:", vals.filter(v => categorizeRow({ [IDENTIFY_FIELD]: v }) === "wh"));
  console.log("Matched as Covid:", vals.filter(v => categorizeRow({ [IDENTIFY_FIELD]: v }) === "covid"));
}
window.logSubtopicValues = logSubtopicValues;

// ============================================================
// Data load
// ============================================================

fetch("/OWL/assets/data/search_methods/search_by_year/NSHD_Data_Dictionary_Public_full.json")
  .then(r => r.json())
  .then(data => {
    rawData = data;
    filteredData = [...rawData];
    sortDirty = true;

    precomputeRowMetadata();
    buildAllWaves();
    buildWaveBar();
    buildTopicFilters();
    buildTableHeader();
    applyFilters();

    document.getElementById("loadingScreen").style.display = "none";
    document.getElementById("dataUI").style.display = "block";

    updateBasketCountUI();
  });

// ============================================================
// Year pill bar
// ============================================================

function buildWaveBar() {
  const bar = document.getElementById("year-pill-bar");
  bar.innerHTML = "";

  const allPill = document.createElement("button");
  allPill.type = "button";
  allPill.className = "year-pill year-pill-all active";
  allPill.dataset.waveId = "all";
  allPill.innerHTML = `<span class="pill-line1">All</span>`;
  allPill.addEventListener("click", () => clearWaveSelection());
  bar.appendChild(allPill);

  ALL_WAVES.forEach(wave => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "year-pill" + (wave.color ? " " + wave.color : "");
    pill.dataset.waveId = wave.id;
    pill.innerHTML = `
      <span class="pill-line1">${wave.label1}</span>
      ${wave.label2 ? `<span class="pill-line2">${wave.label2}</span>` : ""}
    `;
    pill.addEventListener("click", () => toggleWave(wave.id));
    bar.appendChild(pill);
  });

  buildWaveLegend();
}

function buildWaveLegend() {
  const legend = document.getElementById("wave-legend");
  if (!legend) return;
  legend.innerHTML = "";

  const generalItem = document.createElement("span");
  generalItem.className = "legend-item";
  generalItem.innerHTML = `<span class="legend-dot legend-dot-general"></span>General survey years`;
  legend.appendChild(generalItem);

  // Women's health and Covid don't have one fixed pill each — they
  // split out of whichever year(s) they were actually collected in
  // alongside general survey rows, so they need manual legend entries
  // even though they're not in SUBSTUDY_DEFINITIONS.
  const whsItem = document.createElement("span");
  whsItem.className = "legend-item";
  whsItem.innerHTML = `<span class="legend-dot" style="background:${LEGEND_DOT_COLORS["wave-womens"]}"></span>Women's health`;
  legend.appendChild(whsItem);

  const covidItem = document.createElement("span");
  covidItem.className = "legend-item";
  covidItem.innerHTML = `<span class="legend-dot" style="background:${LEGEND_DOT_COLORS["wave-covid"]}"></span>Covid`;
  legend.appendChild(covidItem);

  const seenNames = new Set();
  SUBSTUDY_DEFINITIONS.forEach(wave => {
    const dotColor = LEGEND_DOT_COLORS[wave.color] || "#999";
    const name = LEGEND_NAMES[wave.id] || wave.id;
    if (seenNames.has(name)) return; // e.g. insight46-1 / insight46-2 share one entry
    seenNames.add(name);

    const item = document.createElement("span");
    item.className = "legend-item";
    item.innerHTML = `<span class="legend-dot" style="background:${dotColor}"></span>${name}`;
    legend.appendChild(item);
  });
}

function refreshPillActiveStates() {
  document.querySelectorAll(".year-pill").forEach(p => {
    const id = p.dataset.waveId;
    if (id === "all") {
      p.classList.toggle("active", activeWaveIds.size === 0);
    } else {
      p.classList.toggle("active", activeWaveIds.has(id));
    }
  });
}

function toggleWave(waveId) {
  if (activeWaveIds.has(waveId)) {
    activeWaveIds.delete(waveId);
  } else {
    activeWaveIds.add(waveId);
  }
  refreshPillActiveStates();
  applyFilters();
  updateAllFilters();
}

function clearWaveSelection() {
  activeWaveIds.clear();
  refreshPillActiveStates();
  applyFilters();
  updateAllFilters();
}

// ============================================================
// Topic filters (5 levels, same pattern as Search Data Dictionary)
// ============================================================

function buildTopicFilters() {
  const bar = document.getElementById("topic-filter-bar");
  bar.innerHTML = "";

  filterColumns.forEach(col => {
    const select = document.createElement("select");
    select.dataset.column = col;
    select.innerHTML = `<option value="">${col}</option>`;

    const uniqueValues = [...new Set(rawData.map(r => r[col]).filter(v => v))];
    uniqueValues.forEach(v => {
      select.innerHTML += `<option value="${v}">${v}</option>`;
    });

    select.addEventListener("change", () => {
      applyFilters();
      updateAllFilters();
    });

    bar.appendChild(select);
  });
}

function applyFilters() {
  const activeTopicFilters = {};
  document.querySelectorAll("#topic-filter-bar select").forEach(sel => {
    if (sel.value !== "") activeTopicFilters[sel.dataset.column] = sel.value;
  });

  // Topic + search filtering, independent of which year pill(s) are
  // selected — this subset is what drives which pills get highlighted.
  let topicSearchFiltered = rawData.filter(row =>
    Object.entries(activeTopicFilters).every(([col, val]) => row[col] === val)
  );

  const q = currentSearch.toLowerCase().trim();
  if (q !== "") {
    topicSearchFiltered = topicSearchFiltered.filter(row =>
      Object.entries(row).some(([k, v]) => isVisibleKey(k) && String(v).toLowerCase().includes(q))
    );
  }

  // Then narrow further by any selected year pill(s) for the actual table.
  // Uses the __waveId cached once at load — O(1) Set lookup per row.
  let base = topicSearchFiltered;
  if (activeWaveIds.size > 0) {
    base = base.filter(row => activeWaveIds.has(row.__waveId));
  }

  filteredData = base;
  sortDirty = true;
  currentPage = 1;

  renderTable();
  renderPagination();
  updateResultsCount();
  updatePillHighlights(topicSearchFiltered);
}

// Dims out any year pill with zero matches in the current topic/search
// subset. Builds one Set of present wave ids in a single pass over the
// subset (O(rows)), then does a cheap Set lookup per pill (O(pills)) —
// instead of the old approach of re-matching every row against every
// pill from scratch (O(rows * pills)), which is what made this slow.
function updatePillHighlights(topicSearchFiltered) {
  const matchedIds = new Set();
  topicSearchFiltered.forEach(row => {
    if (row.__waveId) matchedIds.add(row.__waveId);
  });

  document.querySelectorAll(".year-pill:not(.year-pill-all)").forEach(pillEl => {
    const hasMatch = matchedIds.has(pillEl.dataset.waveId);
    pillEl.classList.toggle("pill-no-match", !hasMatch);
  });
}

// Recompute each topic dropdown's options from the currently
// wave-and-search-filtered subset, so filters cascade the same way
// as on the Search Data Dictionary page.
function updateAllFilters() {
  const rows = filteredData;

  filterColumns.forEach(col => {
    const select = document.querySelector(`#topic-filter-bar select[data-column="${col}"]`);
    const currentValue = select.value;

    const values = [...new Set(rows.map(r => r[col]).filter(v => v && v !== ""))].sort();

    select.innerHTML = `<option value="">${col}</option>`;
    values.forEach(v => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    });

    if (values.includes(currentValue)) {
      select.value = currentValue;
    }
  });
}

// ============================================================
// Sorting
// ============================================================

function sortData() {
  if (!sortColumn) return;
  if (!sortDirty) return;

  filteredData.sort((a, b) => {
    const valA = a[sortColumn] ?? "";
    const valB = b[sortColumn] ?? "";

    if (!isNaN(valA) && !isNaN(valB) && valA !== "" && valB !== "") {
      return (Number(valA) - Number(valB)) * sortDirection;
    }
    return String(valA).localeCompare(String(valB)) * sortDirection;
  });

  sortDirty = false;
}

function updateSortIcons() {
  document.querySelectorAll("#table-header th").forEach(th => {
    const labelEl = th.querySelector(".header-label");
    const icon = th.querySelector(".sort-icon");
    if (!labelEl || !icon) return;

    if (th.dataset.key === sortColumn) {
      icon.textContent = sortDirection === 1 ? "▲" : "▼";
      icon.style.opacity = 1;
    } else {
      icon.textContent = "⇅";
      icon.style.opacity = 0.3;
    }
  });
}

// ============================================================
// Global search, page size, reset
// ============================================================

document.getElementById("globalSearch").addEventListener("input", e => {
  currentSearch = e.target.value || "";

  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    applyFilters();
    updateAllFilters();
  }, 250);
});

document.getElementById("pageSize").addEventListener("change", e => {
  pageSize = Number(e.target.value);
  currentPage = 1;
  renderTable();
  renderPagination();
  updateResultsCount();
});

document.getElementById("resetFiltersBtn").addEventListener("click", resetAllFilters);

function resetAllFilters() {
  document.querySelectorAll("#topic-filter-bar select").forEach(sel => {
    sel.value = "";
  });
  document.getElementById("globalSearch").value = "";
  currentSearch = "";

  activeWaveIds.clear();
  refreshPillActiveStates();
  document.querySelectorAll(".year-pill").forEach(p => p.classList.remove("pill-no-match"));

  filteredData = [...rawData];
  sortDirty = true;
  currentPage = 1;

  updateAllFilters();
  renderTable();
  renderPagination();
  updateResultsCount();
}

// ============================================================
// Table header
// ============================================================

function buildTableHeader() {
  const headerRow = document.getElementById("table-header");
  headerRow.innerHTML = "";

  const table = document.getElementById("myTable");
  const existingColgroup = table.querySelector("colgroup");
  if (existingColgroup) existingColgroup.remove();

  const colgroup = document.createElement("colgroup");
  colgroup.innerHTML =
    `<col class="col-select">` +
    COLUMNS_CONFIG.map((_, i) => `<col class="col-${i + 1}">`).join("");
  table.prepend(colgroup);

  const thSelect = document.createElement("th");
  thSelect.classList.add("select-header");
  thSelect.innerHTML = `<div class="th-inner"><span class="header-label">Add variable</span></div>`;
  headerRow.appendChild(thSelect);

  COLUMNS_CONFIG.forEach(cfg => {
    const th = document.createElement("th");
    th.classList.add("sortable-header");
    th.dataset.key = cfg.key;

    th.innerHTML = `
      <div class="th-inner">
        <span class="header-label">${cfg.label}</span>
        <span class="sort-icon">⇅</span>
      </div>
    `;

    th.addEventListener("click", () => {
      if (sortColumn === cfg.key) {
        sortDirection *= -1;
      } else {
        sortColumn = cfg.key;
        sortDirection = 1;
      }
      sortDirty = true;
      updateSortIcons();
      currentPage = 1;
      renderTable();
      renderPagination();
    });

    headerRow.appendChild(th);
  });
}

// ============================================================
// Add/Remove All Helpers
// ============================================================

function allVisibleRowsSelected() {
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  const visibleRows = filteredData.slice(start, end);
  if (visibleRows.length === 0) return false;

  return visibleRows.every(row => {
    const varName = row["NSHD Variable Name"];
    return varName && inBasketFast(varName);
  });
}

function updateAddAllButtonLabel() {
  const btn = document.getElementById("addAllBtn");
  if (!btn) return;

  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  const visibleRows = filteredData.slice(start, end);

  if (visibleRows.length === 0) {
    btn.textContent = "No visible variables to add";
    btn.classList.remove("remove-mode");
    btn.disabled = true;
  } else if (allVisibleRowsSelected()) {
    btn.textContent = "Remove all visible variables";
    btn.classList.add("remove-mode");
    btn.disabled = false;
  } else {
    btn.textContent = "Add all visible variables";
    btn.classList.remove("remove-mode");
    btn.disabled = false;
  }
}

// ============================================================
// Render table
// ============================================================

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderYearBadge(row) {
  const rawVal = row[YEAR_FIELD] ?? "";
  const wave = getWaveForRow(row);
  const cls = wave && wave.color ? wave.color : "wave-general";
  return `<span class="year-badge ${cls}">${escapeHtml(rawVal)}</span>`;
}

function renderTable() {
  sortData();
  refreshBasketCache();

  const body = document.getElementById("table-body");
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;

  const rowsHtml = filteredData.slice(start, end).map(row => {
    const varName = row["NSHD Variable Name"];
    const label = (row["Variable Label"] || "").toString();
    const checked = varName && inBasketFast(varName);

    const selectCell = `
      <td class="select-cell">
        <input type="checkbox" class="row-select"
               data-var-name="${varName || ""}"
               data-label="${label.replace(/"/g, "&quot;")}"
               ${checked ? "checked" : ""}>
      </td>
    `;

    const dataCells = COLUMNS_CONFIG.map(cfg => {
      const value = row[cfg.key] ?? "";

      if (cfg.type === "varlink" && value !== "") {
        return `<td><a href="https://rmjdish.github.io/OWL/assets/variable_metadata/${value}" target="_blank" class="field-link">${value}</a></td>`;
      }
      if (cfg.type === "yearbadge") {
        return `<td>${renderYearBadge(row)}</td>`;
      }
      return `<td>${escapeHtml(value)}</td>`;
    }).join("");

    return `<tr>${selectCell}${dataCells}</tr>`;
  }).join("");

  body.innerHTML = rowsHtml;

  document.querySelectorAll(".row-select").forEach(cb => {
    cb.addEventListener("change", e => {
      const varName = e.target.dataset.varName;
      const label = e.target.dataset.label || "";
      if (!varName) return;

      if (e.target.checked) {
        addToBasket(varName, label);
      } else {
        removeFromBasket(varName);
      }

      refreshBasketCache();
      updateBasketCountUI();
      updateAddAllButtonLabel();
    });
  });

  updateAddAllButtonLabel();
  document.getElementById("myTable").style.tableLayout = "fixed";
}

// ============================================================
// Pagination
// ============================================================

function renderPagination() {
  const totalPages = Math.ceil(filteredData.length / pageSize) || 1;
  const top = document.getElementById("paginationTop");
  const bottom = document.getElementById("paginationBottom");

  const html = `
    <button ${currentPage === 1 ? "disabled" : ""} onclick="changePage(-1)">Prev</button>
    <span>Page ${currentPage} of ${totalPages}</span>
    <button ${currentPage === totalPages ? "disabled" : ""} onclick="changePage(1)">Next</button>
  `;

  top.innerHTML = html;
  bottom.innerHTML = html;
}

function changePage(delta) {
  currentPage += delta;
  renderTable();
  renderPagination();
  updateResultsCount();
}

// ============================================================
// Results counter
// ============================================================

function updateResultsCount() {
  const total = rawData.length;
  const filtered = filteredData.length;
  document.getElementById("resultsCount").textContent =
    `Showing ${filtered} of ${total} results`;
}

// ============================================================
// Download filtered CSV
// ============================================================

function downloadFilteredCSV() {
  if (!filteredData || filteredData.length === 0) {
    alert("No data to download");
    return;
  }

  const headers = Object.keys(filteredData[0]).filter(isVisibleKey);
  let csvContent = headers.join(",") + "\n";

  filteredData.forEach(row => {
    const line = headers.map(h => {
      const value = row[h] ?? "";
      return `"${String(value).replace(/"/g, '""')}"`;
    }).join(",");
    csvContent += line + "\n";
  });

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = "NSHD_Search_by_Year_filtered_results.csv";
  link.click();

  URL.revokeObjectURL(url);
}

document.getElementById("downloadCsvBtn").addEventListener("click", downloadFilteredCSV);

// ============================================================
// Add/Remove All Visible Rows
// ============================================================

document.getElementById("addAllBtn").addEventListener("click", () => {
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  const visibleRows = filteredData.slice(start, end);

  if (allVisibleRowsSelected()) {
    const varNames = visibleRows.map(row => row["NSHD Variable Name"]).filter(Boolean);
    batchRemoveFromBasket(varNames);
  } else {
    const items = visibleRows
      .filter(row => row["NSHD Variable Name"])
      .map(row => ({
        varName: row["NSHD Variable Name"],
        label: row["Variable Label"] || ""
      }));
    batchAddToBasket(items);
  }

  refreshBasketCache();
  renderTable();
});

// ============================================================
// Nav highlight
// ============================================================

document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.nav-list-link.active').forEach(function (link) {
    if (link.textContent.trim() === 'Search by Year') {
      const item = link.closest('.nav-list-item');
      if (item) item.setAttribute('data-year-active', 'true');
    }
  });
});