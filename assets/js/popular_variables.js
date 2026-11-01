document.addEventListener("DOMContentLoaded", () => {

  console.log("Popular vars table script starting…");

  // Load BOTH datasets
  Promise.all([
    fetch("/OWL/assets/data/search_methods/popular_variables/popular_vars_yr.json").then(r => r.json()),
    fetch("/OWL/assets/data/search_methods/data_dictionary/NSHD_Data_Dictionary_Public.json").then(r => r.json())
  ])
  .then(([popular, labels]) => {

    // ⭐ HIDE LOADER + SHOW UI
    document.getElementById("loadingScreen").style.display = "none";
    document.getElementById("popularUI").style.display = "block";

    // Build label + year-of-collection lookups
    const labelMap = {};
    const yearMap  = {};
    labels.forEach(row => {
      const vn = row["NSHD Variable Name"];
      labelMap[vn] = row["Variable Label"];
      yearMap[vn]  = row["Year of collection"];
    });

    // ⭐ Build a fast lookup set of valid NSHD variable names
    const dictionaryNames = new Set(labels.map(r => r["NSHD Variable Name"]));

    // ⭐ Work out which years actually exist in the data, instead of
    // hardcoding a fixed list. Each popular-vars record looks like:
    // { name, counts: {"2021": 12, "2022": 30, ...}, total }
    const availableYears = getAvailableYears(popular);

    // Default selection: every year that's present
    const selectedYears = new Set(availableYears);

    // Fill in the hero banner's year range text, e.g. "between 2021 and 2025"
    const heroYearRange = document.getElementById("heroYearRange");
    if (heroYearRange && availableYears.length > 0) {
      heroYearRange.textContent = availableYears.length === 1
        ? ` in ${availableYears[0]}`
        : ` between ${availableYears[0]} and ${availableYears[availableYears.length - 1]}`;
    }

    initUI(popular, labelMap, yearMap, dictionaryNames, availableYears, selectedYears);
  })
  .catch(err => {
    console.error("Error loading JSON:", err);
    const container = document.getElementById("table-container");
    if (container) {
      container.innerHTML = "<p>Failed to load data.</p>";
    }
  });

  // ⭐ Collect the union of year keys across every record's "counts" object,
  // sorted ascending. This is the single source of truth for which years
  // the year-pill bar offers — nothing is hardcoded.
  function getAvailableYears(popular) {
    const yearSet = new Set();
    popular.forEach(row => {
      Object.keys(row.counts || {}).forEach(y => yearSet.add(y));
    });
    return [...yearSet].sort();
  }

  // ⭐ A variable qualifies if it was added more than this many times in
  // ANY single selected year — not a total scaled by how many years are
  // selected. This is deliberate: some variables were only ever
  // collected in one (often more recent) year, and scaling the
  // threshold by year-count would unfairly exclude them.
  const MIN_PER_YEAR = 3;

  // ⭐ Build the flat, dictionary-filtered row list ONCE. Year selection
  // and search only ever slice/recompute from this — the source data
  // itself doesn't change.
  function buildAllRows(popular, labelMap, yearMap, dictionaryNames) {
    return popular
      .filter(row => dictionaryNames.has(row.name))
      .map(row => ({
        name:    row.name,
        label:   labelMap[row.name]   || "(no label found)",
        collectionYear: yearMap[row.name] || "",
        counts:  row.counts || {}
      }));
  }

  // ⭐ Turn allRows into the flat rows the table needs for a given year
  // selection. Displayed count = sum across whichever years are selected.
  // Qualification = count > MIN_PER_YEAR in at least one selected year.
  function buildRows(allRows, selectedYears) {
    return allRows
      .map(row => {
        const count = [...selectedYears].reduce(
          (sum, y) => sum + (row.counts[y] || 0),
          0
        );
        const qualifies = [...selectedYears].some(y => (row.counts[y] || 0) > MIN_PER_YEAR);
        return {
          name:    row.name,
          label:   row.label,
          collectionYear: row.collectionYear,
          count:   count,
          qualifies: qualifies
        };
      })
      .filter(row => row.qualifies);
  }

  // ⭐ Does this year have at least one row that (a) clears MIN_PER_YEAR
  // for that year and (b) matches the current search query? Drives the
  // dimmed/pill-no-match styling, same behaviour as the Search by Year page.
  function yearHasMatch(allRows, year, query) {
    return allRows.some(row => {
      if ((row.counts[year] || 0) <= MIN_PER_YEAR) return false;
      if (!query) return true;
      return row.name.toLowerCase().includes(query)  ||
             row.label.toLowerCase().includes(query);
    });
  }

  // ⭐ MAIN UI SETUP
  function initUI(popular, labelMap, yearMap, dictionaryNames, availableYears, selectedYears) {
    let sortColumn = "count";
    let sortAsc    = false;
    let pageSize   = 15;
    let currentPage = 1;

    const tbody           = document.querySelector("#vars-table tbody");
    const resultsCount    = document.getElementById("resultsCount");
    const pageSizeControl = document.getElementById("pageSize");
    const searchBox       = document.getElementById("globalSearch");
    const addAllBtn       = document.getElementById("addAllBtn");
    const yearPillBarEl   = document.getElementById("year-pill-bar");
    const countHeaderEl   = document.querySelector('#vars-table th[data-sort="count"] .header-label');

    const allRows = buildAllRows(popular, labelMap, yearMap, dictionaryNames);

    let data         = buildRows(allRows, selectedYears);
    let filteredData = [...data];

    // ⭐ YEAR PILL BAR — same markup/behaviour as the Search by Year page:
    // pills for each available year plus an "All" pill, active state via
    // the .active class, and pills with no matches for the current search
    // dimmed via .pill-no-match.
    function renderYearPillBar() {
      if (!yearPillBarEl) return;

      const query = searchBox.value.toLowerCase();
      const allSelected = availableYears.length > 0 &&
        availableYears.every(y => selectedYears.has(y));

      const allPillHtml = `
        <button type="button"
                class="year-pill year-pill-all${allSelected ? " active" : ""}"
                data-year="all">
          <span class="pill-line1">All</span>
        </button>
      `;

      const yearPillsHtml = availableYears.map(y => {
        const active  = selectedYears.has(y);
        const noMatch = !yearHasMatch(allRows, y, query);
        const classes = ["year-pill"];
        if (active) classes.push("active");
        if (noMatch) classes.push("pill-no-match");
        return `
          <button type="button" class="${classes.join(" ")}" data-year="${y}">
            <span class="pill-line1">${y}</span>
          </button>
        `;
      }).join("");

      yearPillBarEl.innerHTML = allPillHtml + yearPillsHtml;

      yearPillBarEl.querySelectorAll(".year-pill").forEach(btn => {
        btn.onclick = () => {
          const y = btn.dataset.year;
          if (y === "all") {
            if (allSelected) {
              selectedYears.clear();
            } else {
              availableYears.forEach(yr => selectedYears.add(yr));
            }
          } else {
            if (selectedYears.has(y)) {
              selectedYears.delete(y);
            } else {
              selectedYears.add(y);
            }
          }
          onYearsChanged();
        };
      });
    }

    // ⭐ Threshold text is fixed now (any single year > MIN_PER_YEAR
    // qualifies), so it's set once rather than recomputed per selection.
    const heroThresholdEl = document.getElementById("heroThreshold");
    if (heroThresholdEl) heroThresholdEl.textContent = MIN_PER_YEAR;

    // ⭐ Keep the "Count" column header reflecting the current selection
    function updateCountHeaderLabel() {
      if (!countHeaderEl) return;
      const sel = [...selectedYears].sort();
      if (sel.length === 0) {
        countHeaderEl.textContent = "Count";
      } else if (sel.length === availableYears.length) {
        countHeaderEl.textContent = "Count (all years)";
      } else if (sel.length === 1) {
        countHeaderEl.textContent = `Count (${sel[0]})`;
      } else {
        countHeaderEl.textContent = `Count (${sel[0]}–${sel[sel.length - 1]})`;
      }
    }

    // ⭐ SEARCH — re-applies the current search box value against `data`
    function applySearch() {
      const q = searchBox.value.toLowerCase();
      filteredData = data.filter(row =>
        row.name.toLowerCase().includes(q)  ||
        row.label.toLowerCase().includes(q)
      );
    }

    function onYearsChanged() {
      data = buildRows(allRows, selectedYears);
      applySearch();
      currentPage = 1;
      renderYearPillBar();
      updateCountHeaderLabel();
      renderTable();
    }

    searchBox.oninput = () => {
      applySearch();
      currentPage = 1;
      renderYearPillBar(); // re-dim pills against the new search term
      renderTable();
    };

    // ⭐ PAGE SIZE
    pageSizeControl.onchange = () => {
      pageSize = parseInt(pageSizeControl.value);
      currentPage = 1;
      renderTable();
    };

    // ⭐ CHECK IF ALL VISIBLE ARE SELECTED
    function allVisibleRowsSelected() {
      const start = (currentPage - 1) * pageSize;
      const end   = start + pageSize;
      const visibleRows = filteredData.slice(start, end);
      if (visibleRows.length === 0) return false;
      return visibleRows.every(row => isInBasket(row.name));
    }

    // ⭐ UPDATE BUTTON LABEL
    function updateAddAllButtonLabel() {
      const start = (currentPage - 1) * pageSize;
      const end   = start + pageSize;
      const visibleRows = filteredData.slice(start, end);

      if (visibleRows.length === 0) {
        addAllBtn.textContent = "No visible variables to add";
        addAllBtn.classList.remove("remove-mode");
        addAllBtn.disabled = true;
        return;
      }

      addAllBtn.disabled = false;

      if (allVisibleRowsSelected()) {
        addAllBtn.textContent = "Remove all visible variables";
        addAllBtn.classList.add("remove-mode");
      } else {
        addAllBtn.textContent = "Add all visible variables";
        addAllBtn.classList.remove("remove-mode");
      }
    }

    // ⭐ ADD / REMOVE ALL BUTTON
    addAllBtn.onclick = () => {
      const start = (currentPage - 1) * pageSize;
      const end   = start + pageSize;
      const visibleRows = filteredData.slice(start, end);

      if (allVisibleRowsSelected()) {
        // Single localStorage read+write, and a single sibling-expansion
        // pass — avoids N separate async toast calls racing each other
        // and overwriting one another's displayed count.
        const varNames = visibleRows.map(row => row.name).filter(Boolean);
        batchRemoveFromBasket(varNames);
      } else {
        const items = visibleRows
          .filter(row => row.name)
          .map(row => ({ varName: row.name, label: row.label }));
        batchAddToBasket(items);
      }

      updateBasketCountUI();
      renderTable();
    };

    // ⭐ RENDER TABLE
    function renderTable() {
      let sorted = [...filteredData];

      if (sortColumn) {
        sorted.sort((a, b) => {
          const av = a[sortColumn] ?? "";
          const bv = b[sortColumn] ?? "";
          if (av < bv) return sortAsc ? -1 : 1;
          if (av > bv) return sortAsc ?  1 : -1;
          return 0;
        });
      }

      const totalRows  = sorted.length;
      const totalPages = Math.ceil(totalRows / pageSize);
      const start      = (currentPage - 1) * pageSize;
      const pageRows   = sorted.slice(start, start + pageSize);

      resultsCount.textContent = `Showing ${totalRows} results`;

      // Build rows
      tbody.innerHTML = pageRows.map(row => {
        const checked = isInBasket(row.name);

        return `
          <tr>
            <td class="check-col">
              <input type="checkbox"
                     class="add-to-basket"
                     data-name="${row.name}"
                     data-label="${row.label}"
                     ${checked ? "checked" : ""}>
            </td>

            <td class="name-col">
              <a href="https://rmjdish.github.io/OWL/assets/variable_metadata/${row.name}"
                 target="_blank"
                 class="field-link">
                 ${row.name}
              </a>
            </td>

            <td class="label-col">${row.label}</td>
            <td class="year-col">${row.collectionYear}</td>
            <td class="count-col">${row.count}</td>
          </tr>
        `;
      }).join("");

      updateSortIcons();
      renderPagination(totalPages);
      attachBasketEvents();
      updateAddAllButtonLabel();
    }

    // ⭐ PAGINATION
    function renderPagination(totalPages) {
      const top    = document.getElementById("paginationTop");
      const bottom = document.getElementById("paginationBottom");

      const html = `
        <button ${currentPage === 1         ? "disabled" : ""} data-dir="-1">Prev</button>
        <span>Page ${currentPage} of ${totalPages}</span>
        <button ${currentPage === totalPages ? "disabled" : ""} data-dir="1">Next</button>
      `;

      top.innerHTML    = html;
      bottom.innerHTML = html;

      document.querySelectorAll("#paginationTop button, #paginationBottom button")
        .forEach(btn => {
          btn.onclick = () => {
            currentPage += parseInt(btn.dataset.dir);
            renderTable();
          };
        });
    }

    // ⭐ SORTING EVENTS
    document.querySelectorAll("#vars-table th[data-sort]").forEach(th => {
      const label = th.textContent;

      th.innerHTML = `
        <span class="header-label">${label}</span>
        <span class="sort-icon">⇅</span>
      `;

      th.onclick = () => {
        const col = th.dataset.sort;
        if (sortColumn === col) {
          sortAsc = !sortAsc;
        } else {
          sortColumn = col;
          sortAsc    = true;
        }
        currentPage = 1;
        renderTable();
      };
    });

    // ⭐ UPDATE SORT ICONS
    function updateSortIcons() {
      document.querySelectorAll("#vars-table th[data-sort]").forEach(th => {
        const col  = th.dataset.sort;
        const icon = th.querySelector(".sort-icon");
        if (col !== sortColumn) {
          icon.textContent = "⇅";
          icon.style.opacity = 0.4;
          return;
        }
        icon.style.opacity = 1;
        icon.textContent   = sortAsc ? "▲" : "▼";
      });
    }

    // ⭐ BASKET EVENTS
    function attachBasketEvents() {
      document.querySelectorAll(".add-to-basket").forEach(cb => {
        cb.onclick = () => {
          const name  = cb.dataset.name;
          const label = cb.dataset.label;
          if (cb.checked) addToBasket(name, label);
          else            removeFromBasket(name);
          updateBasketCountUI();
          updateAddAllButtonLabel();
        };
      });
    }

    // ============================================================
    // Download filtered CSV
    // ============================================================
    function downloadFilteredCSV() {
      if (!filteredData || filteredData.length === 0) {
        alert("No data to download");
        return;
      }

      const headers = ["name", "label", "collectionYear", "count"];
      const displayHeaders = ["NSHD Variable Name", "Variable Label", "Year of collection", "Count"];

      let csvContent = displayHeaders.join(",") + "\n";

      filteredData.forEach(row => {
        const line = headers.map(h => {
          const value = row[h] ?? "Not available";
          return `"${String(value).replace(/"/g, '""')}"`;
        }).join(",");
        csvContent += line + "\n";
      });

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url  = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href     = url;
      link.download = "Popular_Variables_filtered_results.csv";
      link.click();
      URL.revokeObjectURL(url);
    }

    document.getElementById("downloadCsvBtn")
      .addEventListener("click", downloadFilteredCSV);

    // ============================================================
    // Keep "Add all" button in sync with basket changes made
    // elsewhere — e.g. linked longitudinal sweeps auto-added/removed via
    // basket_header.js after this page's own handlers have already run.
    // Checkbox .checked state itself is handled by
    // refreshBasketCheckboxesUI() in basket_header.js (data-name is one
    // of the conventions it recognizes).
    // ============================================================
    window.addEventListener("nshd-basket-changed", () => {
      updateAddAllButtonLabel();
    });

    renderYearPillBar();
    updateCountHeaderLabel();
    renderTable();
  } // end initUI

}); // end DOMContentLoaded