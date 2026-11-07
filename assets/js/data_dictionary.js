// ============================================================
// NSHD Data Dictionary – Search, Filters, Table, Basket
// Production‑ready, cleaned, single‑source JS
// ============================================================

// BASKET_KEY is defined globally in basket_header.js

let rawData = [];
let filteredData = [];
let currentPage = 1;
let pageSize = 15;
let sortColumn = null;
let sortDirection = 1; // 1 = asc, -1 = desc
let currentSearch = ""; // 🔹 track current text search
let searchDebounce;

// ── Sort cache ──────────────────────────────────────────────────────────────
// sortData() is expensive on large datasets. Only re-sort when the sort
// state actually changed (column/direction clicked) or filteredData was
// rebuilt (applyFilters/resetAllFilters). Pagination, checkbox toggles, and
// "add/remove all visible" just re-render off the already-sorted array.
let sortDirty = true;

const filterColumns = [
  "Topic",
  "Subtopic 1",
  "Subtopic 2",
  "Subtopic 3",
  "Subtopic 4"
];

let tableColumns = [];

// ── Basket cache ────────────────────────────────────────────────────────────
// Instead of calling isInBasket() (which re-reads localStorage) once per row
// on every render, we load the basket ONCE into a Set at the start of each
// renderTable() call. O(1) lookups, single localStorage read per render.
// Updated by refreshBasketCache() after any add/remove action.
let _basketCache = new Set();

function refreshBasketCache() {
  _basketCache = new Set(loadBasket().map(item => item.varName));
}

function inBasketFast(varName) {
  return _basketCache.has(varName);
}

// ============================================================
// TAWNY HAND-OFF
// When someone chooses "Open all results in the data dictionary" in Tawny
// (the help assistant), Tawny saves the matching variable names in the
// browser and opens this page with ?tawny=1. This page then shows only those
// variables, in Tawny's order (most requested first), with a banner that
// can add them all to the basket and filter by what is already in it.
// Nothing here runs unless the address contains ?tawny=1 and Tawny's list
// is under an hour old, so the page behaves exactly as before otherwise.
// ============================================================
const TAWNY_RESULTS_KEY = "owlHelpBot.results";
const TAWNY_MAX_AGE_MS = 60 * 60 * 1000;
let tawny = null; // { q, names: [...], set: Set, order: Map, basketFilter: "all"|"in"|"out" }

function loadTawnyResults() {
  try {
    if (!/[?&]tawny=1\b/.test(location.search)) return null;
    const raw = JSON.parse(localStorage.getItem(TAWNY_RESULTS_KEY) || "null");
    if (!raw || !Array.isArray(raw.names) || !raw.names.length) return null;
    if (!raw.ts || Date.now() - raw.ts > TAWNY_MAX_AGE_MS) return null;
    const names = raw.names.filter(n => typeof n === "string").slice(0, 1000);
    if (!names.length) return null;
    return {
      q: typeof raw.q === "string" ? raw.q.slice(0, 120) : "",
      names,
      set: new Set(names),
      order: new Map(names.map((n, i) => [n, i])),
      basketFilter: "all"
    };
  } catch (e) {
    return null;
  }
}

function clearTawnyResults() {
  tawny = null;
  const b = document.getElementById("tawnyBanner");
  if (b) b.remove();
  try {
    const url = new URL(location.href);
    url.searchParams.delete("tawny");
    history.replaceState(null, "", url.pathname + (url.search ? url.search : "") + url.hash);
  } catch (e) { }
}

function tawnyRowName(row) { return row["NSHD Variable Name"]; }

function buildTawnyBanner() {
  const old = document.getElementById("tawnyBanner");
  if (old) old.remove();
  if (!tawny) return;

  const banner = document.createElement("div");
  banner.id = "tawnyBanner";
  banner.className = "tawny-banner";
  banner.innerHTML = `
    <div class="tawny-banner-text">
      <strong>From Tawny:</strong>
      <span id="tawnyBannerMsg"></span>
    </div>
    <div class="tawny-banner-actions">
      <label class="tawny-basket-filter">Show
        <select id="tawnyBasketFilter">
          <option value="all">all of these</option>
          <option value="in">only those in my basket</option>
          <option value="out">only those not in my basket</option>
        </select>
      </label>
      <button id="tawnyAddAllBtn" class="add-all-btn" type="button"></button>
      <button id="tawnyShowAllBtn" class="tawny-show-all" type="button">Show whole data dictionary</button>
    </div>
  `;
  const anchor = document.getElementById("search-pagination-top");
  anchor.parentNode.insertBefore(banner, anchor);

  document.getElementById("tawnyBasketFilter").addEventListener("change", e => {
    tawny.basketFilter = e.target.value;
    applyFilters();
    updateAllFilters(); // keep the dropdowns in step with what is now shown
  });
  document.getElementById("tawnyShowAllBtn").addEventListener("click", () => {
    clearTawnyResults();
    applyFilters();
    updateAllFilters();
  });
  document.getElementById("tawnyAddAllBtn").addEventListener("click", () => {
    // every variable in Tawny's list that is on this dictionary (all pages, not just the visible one)
    const rows = rawData.filter(r => tawnyRowName(r) && tawny.set.has(tawnyRowName(r)));
    const allIn = rows.length > 0 && rows.every(r => inBasketFast(tawnyRowName(r)));
    if (allIn) {
      batchRemoveFromBasket(rows.map(tawnyRowName));
    } else {
      batchAddToBasket(rows.map(r => ({ varName: tawnyRowName(r), label: r["Variable Label"] || "" })));
    }
    refreshBasketCache();
    renderTable();
    updateTawnyBanner();
  });
  updateTawnyBanner();
}

// Keeps the banner text, the add/remove-all label and the in-basket count current
function updateTawnyBanner() {
  if (!tawny) return;
  const msg = document.getElementById("tawnyBannerMsg");
  const btn = document.getElementById("tawnyAddAllBtn");
  if (!msg || !btn) return;
  const rows = rawData.filter(r => tawnyRowName(r) && tawny.set.has(tawnyRowName(r)));
  const inCount = rows.filter(r => inBasketFast(tawnyRowName(r))).length;
  const q = tawny.q ? ` for \u201c${escapeHtml(tawny.q)}\u201d` : "";
  msg.innerHTML = `${rows.length} variable${rows.length === 1 ? "" : "s"}${q}, most requested first. ` +
    `<b>${inCount}</b> of them ${inCount === 1 ? "is" : "are"} already in your basket.`;
  if (rows.length === 0) {
    btn.textContent = "Nothing to add";
    btn.disabled = true;
    btn.classList.remove("remove-mode");
  } else if (inCount === rows.length) {
    btn.textContent = `Remove all ${rows.length} from basket`;
    btn.disabled = false;
    btn.classList.add("remove-mode");
  } else {
    btn.textContent = `Add all ${rows.length} to basket`;
    btn.disabled = false;
    btn.classList.remove("remove-mode");
  }
}

// ============================================================
// Data load
// ============================================================

fetch(SITE_BASEURL + "/assets/data/search_methods/data_dictionary/NSHD_Data_Dictionary_Public.json")
  .then(r => r.json())
  .then(data => {
    rawData = data;
    filteredData = [...rawData];
    sortDirty = true;

    // Drop first 5 metadata fields, then remove Order
    tableColumns = Object.keys(rawData[0]).slice(5).filter(col => col !== "Order");

    tawny = loadTawnyResults(); // null unless opened from Tawny

    buildFilters();
    buildTableHeader();
    refreshBasketCache();
    buildTawnyBanner();
    applyFilters(); // 🔹 initial filter + search pass
    if (tawny) updateAllFilters(); // TAWNY HAND-OFF: dropdowns list only what is in Tawny's results

    // Hide loading, show UI
    document.getElementById("loadingScreen").style.display = "none";
    document.getElementById("dataUI").style.display = "block";

    updateBasketCountUI(); // global glow logic now runs
  });

// ============================================================
// Filters
// ============================================================

function buildFilters() {
  const bar = document.getElementById("filter-bar");
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
  const activeFilters = {};
  document.querySelectorAll("#filter-bar select").forEach(sel => {
    if (sel.value !== "") activeFilters[sel.dataset.column] = sel.value;
  });

  // 1) Apply dropdown filters to rawData
  let base = rawData.filter(row =>
    Object.entries(activeFilters).every(([col, val]) => row[col] === val)
  );

  // 2) Apply current text search on top of filtered subset
  const q = currentSearch.toLowerCase().trim();
  if (q !== "") {
    base = base.filter(row =>
      Object.values(row).some(v => String(v).toLowerCase().includes(q))
    );
  }

  // TAWNY HAND-OFF: only the variables Tawny found, optionally split by basket
  if (tawny) {
    base = base.filter(row => tawny.set.has(tawnyRowName(row)));
    if (tawny.basketFilter !== "all") {
      refreshBasketCache();
      const wantIn = tawny.basketFilter === "in";
      base = base.filter(row => inBasketFast(tawnyRowName(row)) === wantIn);
    }
    // Tawny's order (most requested first) until someone sorts by a column
    base.sort((a, b) => tawny.order.get(tawnyRowName(a)) - tawny.order.get(tawnyRowName(b)));
  }

  filteredData = base;
  sortDirty = true; // 🔹 filteredData rebuilt — sort cache is stale

  currentPage = 1;
  renderTable();
  renderPagination();
  updateResultsCount();
}

function updateAllFilters() {
  const rows = filteredData;

  filterColumns.forEach(col => {
    const select = document.querySelector(`#filter-bar select[data-column="${col}"]`);
    const currentValue = select.value;

    // TAWNY HAND-OFF: count how many of the shown variables each option covers
    const counts = new Map();
    rows.forEach(r => {
      const v = r[col];
      if (v && v !== "") counts.set(v, (counts.get(v) || 0) + 1);
    });
    const values = [...counts.keys()].sort();
    // never drop the option someone has chosen, even if no rows are left
    if (tawny && currentValue && !counts.has(currentValue)) values.unshift(currentValue);

    select.innerHTML = `<option value="">${col}</option>`;
    values.forEach(v => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = tawny ? `${v} (${counts.get(v) || 0})` : v;
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
  if (!sortDirty) return; // 🔹 already sorted for current column/direction/dataset

  filteredData.sort((a, b) => {
    const valA = a[sortColumn] ?? "";
    const valB = b[sortColumn] ?? "";

    if (!isNaN(valA) && !isNaN(valB)) {
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

    const label = labelEl.textContent;

    if (label === sortColumn) {
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
  applyFilters();      // 🔹 re-run filters + search together

  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    updateAllFilters();   // ⭐ update filters AFTER user stops typing
  }, 300);
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
  document.querySelectorAll("#filter-bar select").forEach(sel => {
    sel.value = "";
  });

  document.getElementById("globalSearch").value = "";
  currentSearch = ""; // 🔹 clear search state
  if (tawny) clearTawnyResults(); // TAWNY HAND-OFF: Reset Filters shows the whole dictionary again

  filteredData = [...rawData];
  sortDirty = true; // 🔹 filteredData rebuilt — sort cache is stale
  currentPage = 1;

  updateAllFilters();
  renderTable();
  renderPagination();
  updateResultsCount();
}

// ============================================================
// Table header (with checkbox column)
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
    tableColumns.map((_, i) => `<col class="col-${i + 1}">`).join("");
  table.prepend(colgroup);

  // Checkbox header
  const thSelect = document.createElement("th");
  thSelect.classList.add("select-header");
  thSelect.innerHTML = `
    <div class="th-inner">
      <span class="header-label">Add variable</span>
    </div>
  `;
  headerRow.appendChild(thSelect);

  // Sortable headers
  tableColumns.forEach(col => {
    const th = document.createElement("th");
    th.classList.add("sortable-header");

    th.innerHTML = `
      <div class="th-inner">
        <span class="header-label">${col}</span>
        <span class="sort-icon">⇅</span>
      </div>
    `;

    th.addEventListener("click", () => {
      if (sortColumn === col) {
        sortDirection *= -1;
      } else {
        sortColumn = col;
        sortDirection = 1;
      }

      sortDirty = true; // 🔹 sort state changed — recompute on next render
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

  // Uses the cache — no extra localStorage reads
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
    btn.style.color = "";
    btn.disabled = true;
  } else if (allVisibleRowsSelected()) {
    btn.textContent = "Remove all visible variables";
    btn.classList.add("remove-mode");
    btn.style.color = "";
    btn.disabled = false;
  } else {
    btn.textContent = "Add all visible variables";
    btn.classList.remove("remove-mode");
    btn.style.color = "";
    btn.disabled = false;
  }
}

// ============================================================
// Render table
// ============================================================

// Escape values that get interpolated as HTML text content (not attributes).
// Attributes already go through the existing quote-escaping below.
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderTable() {
  sortData(); // 🔹 no-op unless sortDirty is true

  // ── Load basket ONCE per render ──────────────────────────────────────────
  // Single localStorage read, O(1) lookups per row via the shared Set cache.
  refreshBasketCache();

  const body = document.getElementById("table-body");

  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;

  // 🔹 Build the whole page as one HTML string and assign innerHTML ONCE,
  // instead of createElement/appendChild per cell (which was ~8 DOM ops ×
  // pageSize, each risking a layout/reflow). This is what browse.js already
  // does and is the main reason it stayed fast at pageSize 100.
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

    const dataCells = tableColumns.map(col => {
      const value = row[col] ?? "";

      if (col === "NSHD Variable Name" && value !== "") {
        return `<td>
          <a href="${SITE_URL}${SITE_BASEURL}/assets/variable_metadata/${value}"
             target="_blank"
             class="field-link">
             ${value}
          </a>
        </td>`;
      }

      return `<td>${escapeHtml(value)}</td>`;
    }).join("");

    return `<tr>${selectCell}${dataCells}</tr>`;
  }).join("");

  body.innerHTML = rowsHtml;

  // Checkbox change handlers — attached once after the single innerHTML write
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

      // Refresh cache after mutation, then update just the button label —
      // no full re-render needed, which was the main source of slowdown
      refreshBasketCache();
      updateBasketCountUI();
      updateAddAllButtonLabel();
      updateTawnyBanner(); // TAWNY HAND-OFF
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
  // TAWNY HAND-OFF: the total is the size of Tawny's list, not the whole dictionary
  if (tawny && tawny.total === undefined) {
    tawny.total = rawData.filter(r => tawny.set.has(tawnyRowName(r))).length;
  }
  const total = tawny ? tawny.total : rawData.length;
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

  const headers = Object.keys(filteredData[0]);
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
  link.download = "NSHD_Data_Dictionary_filtered_results.csv";
  link.click();

  URL.revokeObjectURL(url);
}

document.getElementById("downloadCsvBtn")
  .addEventListener("click", downloadFilteredCSV);

// ============================================================
// Add/Remove All Visible Rows
// ============================================================

document.getElementById("addAllBtn").addEventListener("click", () => {
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  const visibleRows = filteredData.slice(start, end);

  if (allVisibleRowsSelected()) {
    // REMOVE ALL VISIBLE — single localStorage read+write via batch function
    const varNames = visibleRows
      .map(row => row["NSHD Variable Name"])
      .filter(Boolean);
    batchRemoveFromBasket(varNames);
  } else {
    // ADD ALL VISIBLE — single localStorage read+write via batch function
    const items = visibleRows
      .filter(row => row["NSHD Variable Name"])
      .map(row => ({
        varName: row["NSHD Variable Name"],
        label:   row["Variable Label"] || ""
      }));
    batchAddToBasket(items);
  }

  // Refresh cache once, re-render once
  // Note: sortDirty is untouched here — filteredData's row order/contents
  // haven't changed (basket membership isn't a sort key), so renderTable()
  // will skip sortData() entirely, same as before the click.
  refreshBasketCache();
  renderTable();
});

// ============================================================
// Keep basket cache + "Add all" button in sync with changes made
// elsewhere on the page or on other pages — e.g. linked longitudinal
// sweeps auto-added/removed via basket_header.js after this page's own
// handlers have already run. Checkbox .checked state itself is handled
// by refreshBasketCheckboxesUI() in basket_header.js (data-var-name is
// one of the conventions it recognizes); this just keeps this page's
// own cache and button label consistent with that.
// ============================================================

window.addEventListener("nshd-basket-changed", () => {
  refreshBasketCache();
  updateAddAllButtonLabel();
  updateTawnyBanner(); // TAWNY HAND-OFF: keeps "N already in your basket" current
});

// ============================================================
// Make search methods label appear when Data Dictionary is active
// ============================================================

document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.nav-list-link.active').forEach(function (link) {
    if (link.textContent.trim() === 'Search Data Dictionary') {
      const item = link.closest('.nav-list-item');
      if (item) item.setAttribute('data-dd-active', 'true');
    }
  });
});