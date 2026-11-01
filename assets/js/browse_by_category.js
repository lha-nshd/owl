document.addEventListener("DOMContentLoaded", () => {

  console.log("Browse-by-category script starting…");

  // Browse by Category home page: tree selector instead of the single-category table
  if (document.getElementById("catBrowser")) { initCategoryTree(); return; }

  const loading = document.getElementById("loadingScreen");
  const ui = document.getElementById("browseUI");

  const tbody = document.querySelector("#myTable2 tbody");
  const searchBox = document.getElementById("globalSearch");
  const pageSizeControl = document.getElementById("pageSize");
  const labelFilter = document.getElementById("labelFilterHeader");

  let allData = [];
  let filteredData = [];
  let sortedData = [];      // ← cached sort result, only recomputed when sort changes
  let currentPage = 1;
  let pageSize = 15;

  // ⭐ Sorting state
  let sortColumn = "Order";
  let sortAsc = true;
  let sortDirty = true;     // ← true when sortedData needs recomputing

  // ── Basket cache ───────────────────────────────────────────────────────────
  // Load basket ONCE per render into a Set — O(1) lookups, single
  // localStorage read per renderTable() call instead of one per row.
  let _basketCache = new Set();

  function refreshBasketCache() {
    _basketCache = new Set(loadBasket().map(item => item.varName));
  }

  function inBasketFast(varName) {
    return _basketCache.has(varName);
  }

  /* ============================================================
     RENDER TABLE
     ============================================================ */
  function renderTable() {

    // Recompute sort only when sort state actually changed — not on every render
    if (sortDirty) {
      sortedData = [...filteredData].sort((a, b) => {
        const A = a[sortColumn];
        const B = b[sortColumn];
        if (!isNaN(A) && !isNaN(B)) return sortAsc ? A - B : B - A;
        return sortAsc
          ? String(A).localeCompare(String(B))
          : String(B).localeCompare(String(A));
      });
      sortDirty = false;
    }

    // Single localStorage read for all row checkbox states
    refreshBasketCache();

    const totalRows  = sortedData.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    resultsCount.textContent = `Showing ${filteredData.length} of ${allData.length} results`;
    if (currentPage > totalPages) currentPage = totalPages;

    const start    = (currentPage - 1) * pageSize;
    const pageRows = sortedData.slice(start, start + pageSize);

    tbody.innerHTML = pageRows.map(row => {
      const name    = row["NSHD Variable Name"];
      const label   = row["Variable Label"] || "";
      const checked = inBasketFast(name);   // ← O(1) Set lookup, no localStorage read

      return `
        <tr>
          <td class="check-col" style="width:40px;">
            <input type="checkbox"
                   class="add-to-basket"
                   data-name="${name}"
                   data-label="${label.replace(/"/g, "&quot;")}"
                   ${checked ? "checked" : ""}>
          </td>
          <td style="width:40px;">${row["Order"]}</td>
          <td style="width:95px;">
            <a href="https://rmjdish.github.io/OWL/assets/variable_metadata/${name}.html"
               target="_blank">${name}</a>
          </td>
          <td style="width:400px; overflow:hidden; text-overflow:ellipsis;">
            ${label}
          </td>
        </tr>
      `;
    }).join("");

    attachBasketEvents();
    updateSortIcons();
    updateAddAllButtonLabel2();
    renderPagination(totalPages);
  }


  /* ============================================================
     ADD/REMOVE ALL HELPERS
     ============================================================ */
  function allVisibleRowsSelected2() {
    const start = (currentPage - 1) * pageSize;
    const end   = start + pageSize;
    const visibleRows = sortedData.slice(start, end);
    if (visibleRows.length === 0) return false;
    // Uses the cache — no extra localStorage reads
    return visibleRows.every(row => {
      const varName = row["NSHD Variable Name"];
      return varName && inBasketFast(varName);
    });
  }

  function updateAddAllButtonLabel2() {
    const btn = document.getElementById("addAllBtn");
    if (!btn) return;

    const start = (currentPage - 1) * pageSize;
    const end   = start + pageSize;
    const visibleRows = sortedData.slice(start, end);

    if (visibleRows.length === 0) {
      btn.textContent = "No visible variables to add";
      btn.classList.remove("remove-mode");
      btn.disabled = true;
    } else if (allVisibleRowsSelected2()) {
      btn.textContent = "Remove all visible variables";
      btn.classList.add("remove-mode");
      btn.disabled = false;
    } else {
      btn.textContent = "Add all visible variables";
      btn.classList.remove("remove-mode");
      btn.disabled = false;
    }
  }

  // ── Add/Remove All button — registered ONCE here, never inside renderPagination
  const addBtn = document.getElementById("addAllBtn");
  if (addBtn) {
    addBtn.onclick = () => {
      const start      = (currentPage - 1) * pageSize;
      const end        = start + pageSize;
      const visibleRows = sortedData.slice(start, end);

      if (allVisibleRowsSelected2()) {
        // REMOVE ALL — single read+write via batch function
        const varNames = visibleRows
          .map(row => row["NSHD Variable Name"])
          .filter(Boolean);
        batchRemoveFromBasket(varNames);
      } else {
        // ADD ALL — single read+write via batch function
        const items = visibleRows
          .filter(row => row["NSHD Variable Name"])
          .map(row => ({
            varName: row["NSHD Variable Name"],
            label:   row["Variable Label"] || ""
          }));
        batchAddToBasket(items);
      }

      refreshBasketCache();
      renderTable();
    };
  }


  /* ============================================================
     PAGINATION
     ============================================================ */
  function renderPagination(totalPages) {
    const top    = document.getElementById("paginationTop");
    const bottom = document.getElementById("paginationBottom");
    if (!top || !bottom) return;

    const html = `
      <button ${currentPage === 1 ? "disabled" : ""} data-dir="-1">Prev</button>
      <span>Page ${currentPage} of ${totalPages}</span>
      <button ${currentPage === totalPages ? "disabled" : ""} data-dir="1">Next</button>
    `;

    top.innerHTML = html;
    bottom.querySelector(".pagination-controls").innerHTML = html;

    document.querySelectorAll("#paginationTop button, #paginationBottom button")
      .forEach(btn => {
        btn.onclick = () => {
          currentPage += parseInt(btn.dataset.dir);
          renderTable();
        };
      });
  }


  /* ============================================================
     DOWNLOAD CSV
     ============================================================ */
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
    const url  = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href     = url;
    link.download = "Browse_By_Category_filtered_results.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  document.getElementById("downloadCsvBtn")
    .addEventListener("click", downloadFilteredCSV);


  /* ============================================================
     SORT ICONS
     ============================================================ */
  function updateSortIcons() {
    document.querySelectorAll("#myTable2 th[data-sort]").forEach(th => {
      const col  = th.dataset.sort;
      const icon = th.querySelector(".sort-icon");
      if (!icon) return;
      if (col !== sortColumn) {
        icon.textContent  = "⇅";
        icon.style.opacity = 0.4;
      } else {
        icon.textContent  = sortAsc ? "▲" : "▼";
        icon.style.opacity = 1;
      }
    });
  }


  /* ============================================================
     CLICK TO SORT
     ============================================================ */
  document.querySelectorAll("#myTable2 th[data-sort]").forEach(th => {
    th.addEventListener("click", (e) => {
      if (e.target.closest("select")) return;
      const col = th.dataset.sort;
      if (sortColumn === col) {
        sortAsc = !sortAsc;
      } else {
        sortColumn = col;
        sortAsc    = true;
      }
      sortDirty  = true;  // ← mark for recompute on next render
      currentPage = 1;
      renderTable();
    });
  });

  labelFilter.addEventListener("click", (e) => e.stopPropagation());


  /* ============================================================
     BASKET EVENTS
     ============================================================ */
  function attachBasketEvents() {
    document.querySelectorAll(".add-to-basket").forEach(cb => {
      cb.onclick = () => {
        const name  = cb.dataset.name;
        const label = cb.dataset.label;
        if (cb.checked) addToBasket(name, label);
        else            removeFromBasket(name);
        refreshBasketCache();
        updateBasketCountUI();
        updateAddAllButtonLabel2();
      };
    });
  }


  /* ============================================================
     SEARCH + PAGE SIZE + LABEL FILTER
     ============================================================ */
  searchBox.onkeyup = () => applyFilters();

  pageSizeControl.onchange = () => {
    pageSize    = parseInt(pageSizeControl.value);
    currentPage = 1;
    renderTable();
  };

  labelFilter.onchange = () => applyFilters();


  /* ============================================================
     APPLY ALL FILTERS
     ============================================================ */
  function applyFilters() {
    const q             = searchBox.value.toLowerCase();
    const selectedLabel = labelFilter.value;

    filteredData = allData.filter(row => {
      const matchesLabel =
        selectedLabel === "" || row["Variable Label"] === selectedLabel;
      const matchesSearch =
        row["NSHD Variable Name"].toLowerCase().includes(q) ||
        (row["Variable Label"] || "").toLowerCase().includes(q);
      return matchesLabel && matchesSearch;
    });

    sortDirty   = true;   // ← filtered data changed, re-sort needed
    currentPage = 1;
    renderTable();
  }


  /* ============================================================
     LOAD JSON + BUILD LABEL FILTER
     ============================================================ */
  const htmlFile = window.location.pathname.split("/").pop();
  const baseName = htmlFile.replace(/\.html$/, "");
  const jsonFile = `${baseName}.json`;

  fetch(jsonFile)
    .then(r => r.json())
    .then(data => {
      allData      = data;
      filteredData = data;
      sortDirty    = true;

      // Build label dropdown using a DocumentFragment — single DOM insertion
      // instead of 1,200 individual appendChild() calls which each trigger
      // a browser reflow. This is the main cause of the slow spinner.
      const labels = [...new Set(data.map(r => r["Variable Label"] || ""))]
        .filter(x => x.trim() !== "")
        .sort();

      const fragment = document.createDocumentFragment();
      labels.forEach(l => {
        const opt       = document.createElement("option");
        opt.value       = l;
        opt.textContent = l;
        fragment.appendChild(opt);
      });
      labelFilter.appendChild(fragment);   // single DOM operation

      // Reposition select if it would overflow right edge
      const rect = labelFilter.getBoundingClientRect();
      if (rect.right > window.innerWidth - 20) {
        labelFilter.style.position = "absolute";
        labelFilter.style.right    = "0";
        labelFilter.style.left     = "auto";
      }

      loading.style.display = "none";
      ui.style.visibility   = "visible";

      renderTable();
    });

  /* ============================================================
     Keep "Add all" button + basket cache in sync with changes made
     elsewhere — e.g. linked longitudinal sweeps auto-added/removed via
     basket_header.js after this page's own handlers have already run.
     Checkbox .checked state itself is handled by
     refreshBasketCheckboxesUI() in basket_header.js (data-name is one
     of the conventions it recognizes).
     ============================================================ */
  window.addEventListener("nshd-basket-changed", () => {
    refreshBasketCache();
    updateAddAllButtonLabel2();
  });


  /* ============================================================
     BROWSE BY CATEGORY HOME PAGE — checkbox tree selector
     Runs only when the page contains #catBrowser (Browse_by_Category.html).
     Loads categories_index.json + category_variables.json once; selection,
     merging, search, paging and CSV all happen in the browser.
     Uses the site basket functions from basket_header.js.
     ============================================================ */
  function initCategoryTree() {
    const root = document.getElementById("catBrowser");
    const $ = id => document.getElementById(id);
    const VAR_LINK = root.dataset.varLink;
    const CAT_BASE = root.dataset.catBase;   // folder holding the individual category pages

    const nodes = {}, roots = [], order = [];
    let vars = {};
    const sel = new Set(), expanded = new Set();
    let resultsShown = false, filterText = "";
    let rows = [], view = [], page = 1, sortKey = "cat", sortDir = 1, size = 15;

    const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    // Same order as the sidebar: nav_order, then title for ties
    const byOrder = (a, b) => (a.orda ?? 1e9) - (b.orda ?? 1e9) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) || a.id - b.id;

    // ── Basket (same helpers the category pages use) ──
    let basketSet = new Set();
    function refreshBasketSet() {
      basketSet = new Set(typeof loadBasket === "function" ? loadBasket().map(i => i.varName) : []);
    }
    window.addEventListener("nshd-basket-changed", () => {
      refreshBasketSet();
      if (resultsShown) { renderResults(); }
    });

    Promise.all([
      fetch(root.dataset.index).then(r => r.json()),
      fetch(root.dataset.vars).then(r => r.json())
    ]).then(([index, v]) => { vars = v; init(index); })
      .catch(e => { $("catLoading").textContent = "Could not load category data: " + e.message; });

    function init(index) {
      index.forEach(c => { nodes[c.id] = { id: c.id, name: c.name, parent: c.parent, orda: c.orda, own: c.own, desc: c.desc || "", kids: [] }; });
      Object.values(nodes).forEach(n => {
        if (n.parent != null && nodes[n.parent]) nodes[n.parent].kids.push(n); else roots.push(n);
      });
      (function walk(list, depth, anc) {
        list.sort(byOrder).forEach(n => { n.depth = depth; n.anc = anc; order.push(n); walk(n.kids, depth + 1, anc.concat(n.id)); });
      })(roots, 0, []);
      const totals = n => { n.sub = n.kids.reduce((s, k) => s + totals(k), 0); return n.own + n.sub; };
      roots.forEach(totals);
      // tree starts fully collapsed: only the top-level categories are shown
      $("catLoading").style.display = "none";
      $("catUI").style.display = "";
      refreshBasketSet();
      wire();
      renderSelected();
    }

    // ── Description hover (plain text; no icon when a category has no description) ──
    const infoBtn = n => n.desc
      ? ` <button type="button" class="cat-info" data-id="${n.id}" aria-label="Description of ${esc(n.name)}">i</button>` : "";
    const tip = document.createElement("div");
    tip.className = "cat-tip"; tip.setAttribute("role", "tooltip"); tip.style.display = "none";
    root.appendChild(tip);
    function hideTip() { tip.style.display = "none"; }
    function showTip(btn) {
      const n = nodes[btn.dataset.id]; if (!n || !n.desc) return;
      tip.textContent = n.desc; tip.style.display = "block";
      const r = btn.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 12));
      const top = (r.bottom + 8 + h > window.innerHeight) ? Math.max(8, r.top - h - 8) : r.bottom + 8;
      tip.style.left = left + "px"; tip.style.top = top + "px";
    }

    // ── Tree ──
    const descendants = (n, out = []) => { n.kids.forEach(k => { out.push(k); descendants(k, out); }); return out; };
    function visibleSet() {
      const f = filterText.trim().toLowerCase();
      if (!f) return null;
      const keep = new Set();
      order.forEach(n => {
        if (n.name.toLowerCase().includes(f) || String(n.id) === f) { keep.add(n.id); n.anc.forEach(a => keep.add(a)); }
      });
      return keep;
    }
    // 1 = ticked, 2 = some descendants ticked, 0 = none
    const state = n => sel.has(n.id) ? 1 : (descendants(n).some(d => sel.has(d.id)) ? 2 : 0);

    function renderTree() {
      hideTip();
      const keep = visibleSet();
      let html = "";
      order.forEach(n => {
        const vis = keep ? keep.has(n.id) : n.anc.every(a => expanded.has(a));
        if (!vis) return;
        const open = keep ? n.kids.some(k => keep.has(k.id)) : expanded.has(n.id);
        const st = state(n);
        const badge = n.kids.length
          ? `<b>[${n.id}]</b> ${n.own} here <span class="dim">· ${n.sub} in sub-categories</span>`
          : `<b>[${n.id}]</b> has ${n.own} items`;
        html += `<div class="cat-row lvl${n.depth % 5}" data-id="${n.id}" style="padding-left:${14 + n.depth * 24}px">` +
          (n.kids.length ? `<button type="button" class="cat-tog" aria-label="Expand or collapse ${esc(n.name)}">${open ? "−" : "+"}</button>` : `<span class="cat-tog-gap"></span>`) +
          `<input type="checkbox" class="cat-chk"${st === 1 ? " checked" : ""}${st === 2 ? ' data-indet="1"' : ""} aria-label="Select ${esc(n.name)}">` +
          `<span class="cat-name${n.depth === 0 ? " top" : ""}">${esc(n.name)}${infoBtn(n)}</span><span class="cat-badge">${badge}</span></div>`;
      });
      $("catTree").innerHTML = html || '<div class="cat-empty">No categories match.</div>';
      $("catTree").querySelectorAll("input[data-indet]").forEach(c => { c.indeterminate = true; });
    }

    // Ticking a node ticks its own variables and every descendant.
    // A parent with no variables of its own is auto-ticked once all its children are.
    function toggle(n, on) {
      [n, ...descendants(n)].forEach(d => on ? sel.add(d.id) : sel.delete(d.id));
      n.anc.slice().reverse().forEach(aid => {
        const a = nodes[aid];
        if (!on) { sel.delete(aid); return; }
        if (a.own === 0 && a.kids.every(k => sel.has(k.id))) sel.add(aid);
      });
    }

    // ── Selected panel ──
    const pathOf = n => n.anc.map(a => nodes[a].name).concat(n.name).join(" › ");
    const topSelected = () => order.filter(n => sel.has(n.id) && !(n.parent != null && sel.has(n.parent)));
    function countVars() { let c = 0; sel.forEach(id => { c += nodes[id].own; }); return c; }
    function renderSelected() {
      const top = topSelected();
      $("catSelTitle").textContent = `Selected (${top.length})`;
      $("catSelList").innerHTML = top.length ? top.map(n =>
        `<div class="cat-sel-item"><div><b>${esc(n.name)}</b>${infoBtn(n)} <span class="dim">[${n.id}]</span><div class="cat-sel-path">${esc(pathOf(n))}</div></div>` +
        `<button type="button" data-rm="${n.id}" aria-label="Remove ${esc(n.name)}">×</button></div>`).join("")
        : '<p class="cat-hint">Nothing selected yet. Tick one or more categories in the tree.</p>';
      const b = $("catSearchBtn");
      b.disabled = !top.length;
      b.textContent = top.length ? `Show variables (${countVars()})` : "Select a category to search";
      renderTree();
    }

    // ── Category links + header filter ──
    // Page name rule matches the generator: spaces -> "_", then "_<id>.html"
    const catPage = n => CAT_BASE + encodeURI(n.name.replace(/ /g, "_") + "_" + n.id + ".html");
    function catLinks(id) {
      const n = nodes[id];
      return n.anc.concat(n.id).map(i =>
        `<a href="${esc(catPage(nodes[i]))}" target="_blank" title="Open the ${esc(nodes[i].name)} category page">${esc(nodes[i].name)}</a>`
      ).join(' <span class="cat-sep">›</span> ');
    }
    // Dropdown lists only the categories present in the current results, with counts
    function fillCatFilter() {
      const sel2 = $("catFilter"), prev = sel2.value, counts = {};
      rows.forEach(r => { counts[r.catId] = (counts[r.catId] || 0) + 1; });
      let html = `<option value="">All categories (${rows.length})</option>`;
      order.forEach(n => {
        if (counts[n.id]) html += `<option value="${n.id}" title="${esc(pathOf(n))}">${esc(n.name)} [${n.id}] (${counts[n.id]})</option>`;
      });
      sel2.innerHTML = html;
      sel2.value = counts[prev] ? prev : "";
    }

    // ── Results ──
    function buildRows() {
      rows = [];
      order.forEach(n => {
        if (!sel.has(n.id)) return;
        (vars[n.id] || []).forEach(v => rows.push({ ord: v[0], name: v[1], label: v[2], restricted: v[3], cat: pathOf(n), catId: n.id }));
      });
    }
    function applyView() {
      const q = $("catResSearch").value.trim().toLowerCase();
      const cf = $("catFilter").value;
      view = rows.filter(r => (!cf || String(r.catId) === cf) &&
        (!q || (r.name + " " + r.label + " " + r.cat).toLowerCase().includes(q)));
      if (sortKey !== "cat") view.sort((a, b) => String(a[sortKey]).localeCompare(String(b[sortKey]), undefined, { numeric: true }) * sortDir);
      page = 1;
      renderResults();
    }
    const pageRows = () => view.slice((page - 1) * size, page * size);

    function renderResults() {
      const pages = Math.max(1, Math.ceil(view.length / size));
      if (page > pages) page = pages;
      $("catResultsCount").textContent = `Showing ${view.length} of ${rows.length} results`;
      $("catTbody").innerHTML = pageRows().map(r =>
        `<tr><td class="check-col"><input type="checkbox" class="add-to-basket" data-name="${esc(r.name)}" data-label="${esc(r.label)}"${basketSet.has(r.name) ? " checked" : ""}></td>` +
        `<td><a href="${esc(VAR_LINK.replace("{name}", encodeURIComponent(r.name)))}" target="_blank">${esc(r.name)}</a></td>` +
        `<td>${esc(r.label)}</td><td class="cat-path">${catLinks(r.catId)}</td></tr>`).join("") || '<tr><td colspan="4">No variables.</td></tr>';
      const pager = `<button type="button" data-p="${page - 1}"${page <= 1 ? " disabled" : ""}>Prev</button><span>Page ${page} of ${pages}</span>` +
                    `<button type="button" data-p="${page + 1}"${page >= pages ? " disabled" : ""}>Next</button>`;
      $("catPagerTop").innerHTML = pager; $("catPagerBottom").innerHTML = pager;
      document.querySelectorAll("#catResults th[data-sort] .sort-icon").forEach(i => {
        const k = i.parentElement.dataset.sort;
        i.textContent = k === sortKey && k !== "cat" ? (sortDir > 0 ? "▲" : "▼") : "⇅";
      });
      updateAddAll();
    }

    // Same behaviour as the category pages: add/remove all variables on the current page
    function updateAddAll() {
      const btn = $("catAddAll"), vis = pageRows();
      btn.classList.remove("remove-mode");
      if (!vis.length) { btn.textContent = "No visible variables to add"; btn.disabled = true; return; }
      btn.disabled = false;
      if (vis.every(r => basketSet.has(r.name))) { btn.textContent = "Remove all visible variables"; btn.classList.add("remove-mode"); }
      else btn.textContent = "Add all visible variables";
    }
    function downloadCsv() {
      if (!view.length) { alert("No data to download"); return; }
      const lines = [["NSHD Variable Name", "Variable Label", "Category", "Is variable restricted?"]]
        .concat(view.map(r => [r.name, r.label, r.cat, r.restricted ? "Yes" : "No"]));
      const csv = lines.map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
      a.download = "Browse_By_Category_selected_results.csv"; a.click(); URL.revokeObjectURL(a.href);
    }
    function refresh() { buildRows(); fillCatFilter(); applyView(); }

    // ── Events ──
    function wire() {
      root.addEventListener("mouseover", e => { const b = e.target.closest(".cat-info"); if (b) showTip(b); });
      root.addEventListener("mouseout", e => { if (e.target.closest(".cat-info")) hideTip(); });
      root.addEventListener("focusin", e => { const b = e.target.closest(".cat-info"); if (b) showTip(b); });
      root.addEventListener("focusout", e => { if (e.target.closest(".cat-info")) hideTip(); });
      root.addEventListener("click", e => { const b = e.target.closest(".cat-info"); if (b) showTip(b); });   // touch screens
      document.addEventListener("click", e => { if (!e.target.closest(".cat-info")) hideTip(); });
      document.addEventListener("keydown", e => { if (e.key === "Escape") hideTip(); });
      window.addEventListener("scroll", hideTip, true);
      $("catTree").addEventListener("click", e => {
        if (!e.target.classList.contains("cat-tog")) return;
        const n = nodes[e.target.closest(".cat-row").dataset.id];
        expanded.has(n.id) ? expanded.delete(n.id) : expanded.add(n.id);
        renderTree();
      });
      $("catTree").addEventListener("change", e => {
        if (!e.target.classList.contains("cat-chk")) return;
        toggle(nodes[e.target.closest(".cat-row").dataset.id], e.target.checked);
        renderSelected(); if (resultsShown) refresh();
      });
      $("catSelList").addEventListener("click", e => {
        const id = e.target.dataset && e.target.dataset.rm; if (!id) return;
        toggle(nodes[id], false); renderSelected(); if (resultsShown) refresh();
      });
      $("catClear").addEventListener("click", e => { e.preventDefault(); sel.clear(); renderSelected(); if (resultsShown) refresh(); });
      $("catFind").addEventListener("input", function () { filterText = this.value; renderTree(); });
      $("catExpandAll").addEventListener("click", () => { order.forEach(n => { if (n.kids.length) expanded.add(n.id); }); renderTree(); });
      $("catCollapseAll").addEventListener("click", () => { expanded.clear(); renderTree(); });
      $("catSearchBtn").addEventListener("click", () => {
        resultsShown = true; $("catResults").style.display = ""; refresh();
        $("catResults").scrollIntoView({ behavior: "smooth" });
      });
      $("catResSearch").addEventListener("input", applyView);
      $("catFilter").addEventListener("change", applyView);
      $("catFilter").addEventListener("click", e => e.stopPropagation());
      $("catPageSize").addEventListener("change", function () { size = parseInt(this.value); page = 1; renderResults(); });
      $("catCsv").addEventListener("click", downloadCsv);
      $("catAddAll").addEventListener("click", () => {
        const vis = pageRows();
        if (vis.every(r => basketSet.has(r.name))) batchRemoveFromBasket(vis.map(r => r.name));
        else batchAddToBasket(vis.map(r => ({ varName: r.name, label: r.label })));
        refreshBasketSet(); renderResults();
        if (typeof updateBasketCountUI === "function") updateBasketCountUI();
      });
      $("catTbody").addEventListener("click", e => {
        const cb = e.target.closest(".add-to-basket"); if (!cb) return;
        if (cb.checked) addToBasket(cb.dataset.name, cb.dataset.label); else removeFromBasket(cb.dataset.name);
        refreshBasketSet(); updateAddAll();
        if (typeof updateBasketCountUI === "function") updateBasketCountUI();
      });
      $("catResults").addEventListener("click", e => {
        const p = e.target.dataset && e.target.dataset.p;
        if (p) { page = +p; renderResults(); return; }
        if (e.target.closest("select")) return;
        const th = e.target.closest("th[data-sort]");
        if (th) { const k = th.dataset.sort; sortDir = sortKey === k ? -sortDir : 1; sortKey = k; applyView(); }
      });
    }
  }

});
