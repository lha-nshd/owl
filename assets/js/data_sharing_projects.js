/* data_sharing_projects.js
 * Data Sharing Projects page: a sortable table of approved projects. Open a row
 * to see every variable the project requested, in the same table as the UKLLC
 * Catalogue, and add them to the OWL basket.
 *
 * Fully client-side. On page load this:
 *   1. Fetches projects_variables.json (written by DataSharing_Metrics.py).
 *   2. Fetches the NSHD Data Dictionary JSON (the same file the UKLLC Catalogue
 *      and the Search page use) and links each requested variable to its label,
 *      topic and year of collection by variable name (case-insensitive).
 *   3. Renders the expandable table, wired to the shared basket functions from
 *      basket_header.js (loadBasket, addToBasket, removeFromBasket,
 *      batchAddToBasket, batchRemoveFromBasket).
 *
 * The two source paths are data-attributes on the page's wrapper element
 * (not an inline <script>, which some CSP setups block):
 *   <div class="page-data-sharing-projects"
 *        data-projects-url="..."
 *        data-dictionary-url="...">
 *
 * Preview pages with no web server can set these globals instead (they take
 * priority over the attributes):
 *   window.DSP_PROJECTS_INLINE    -> the projects_variables.json object
 *   window.DSP_DICTIONARY_INLINE  -> the dictionary JSON as a JS array
 *
 * projects_variables.json shape (see DataSharing_Metrics.py, projects_json()):
 *   { generated, start_year, end_year, excluded_variables,
 *     variables: { "<lowercase key>": { Name: "<proper-case name>" } },
 *     projects:  [ { pid, title, principal_applicant, summary, institution, uk,
 *                    country, date_submitted, date_approved, data_scrambled,
 *                    number_of_variables, variables: ["<lowercase key>", ...] } ] }
 */
(function () {
  "use strict";

  const COLUMN_COUNT = 7; // expand, Project ID, date, applicant, title, summary, variables

  // Shown in place of the label for a requested variable that is not in the data
  // dictionary (so is not in OWL yet). These can not be added to the basket.
  const UNAVAILABLE_MESSAGE = "Variable not yet available in OWL. Check details via Condor.";

  let allProjects = [];
  let filtered = [];
  let currentPage = 1;
  let pageSize = 30;
  let expandedKeys = new Set(); // pids of open rows
  let openVariableSearch = {}; // pid -> text in that panel's filter box
  let variableSortState = {}; // pid -> { key, dir }
  let searchTerm = "";
  let projectSortState = { key: "date_submitted", dir: -1 }; // newest first
  let dictionaryLoaded = false;

  // -- Basket cache -------------------------------------------------------
  // One localStorage read per render via the shared loadBasket() (from
  // basket_header.js, loaded site-wide by the layout), then O(1) lookups.
  let _basketCache = new Set();
  function refreshBasketCache() {
    _basketCache = new Set(loadBasket().map((item) => item.varName));
  }
  function inBasketFast(varName) {
    return _basketCache.has(varName);
  }

  function el(id) {
    return document.getElementById(id);
  }

  // -- Link targets (same conventions as ukllc_catalogue.js) --------------
  const VARIABLE_METADATA_BASE_URL = "https://rmjdish.github.io/OWL/assets/variable_metadata/";
  const CATEGORY_PAGE_BASE_URL = "/OWL/docs/search_methods/browse_by_category/cat_pages";

  function variableMetadataUrl(varName) {
    return VARIABLE_METADATA_BASE_URL + encodeURIComponent(varName);
  }

  function toCategorySlug(label) {
    const words = String(label || "").trim().split(/\s+/).filter(Boolean);
    return words
      .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()))
      .join("_");
  }

  // Strips the trailing "[NNN]" the dictionary's Topic/Subtopic fields use,
  // returning the clean name plus that number as the category code.
  function cleanCategoryLabel(raw) {
    let name = String(raw || "").trim();
    let code = null;
    name = name.replace(/\s*\[(\d+)\]\s*$/, (_, num) => {
      code = num;
      return "";
    });
    return { name: name.trim(), code };
  }

  function categoryPageUrl(v) {
    const raw = lastSubtopic(v) || v.topic || "";
    if (!raw) return null;
    const { name, code } = cleanCategoryLabel(raw);
    if (!name) return null;
    return CATEGORY_PAGE_BASE_URL + "/" + toCategorySlug(name) + (code ? "_" + code : "") + ".html";
  }

  // Deepest non-empty subtopic (falls back up to Topic if all are blank).
  function lastSubtopic(v) {
    const chain = [v.subtopic_4, v.subtopic_3, v.subtopic_2, v.subtopic_1, v.topic];
    return chain.find((x) => x && String(x).trim()) || "";
  }

  function topicPath(v) {
    return [v.topic, v.subtopic_1, v.subtopic_2, v.subtopic_3, v.subtopic_4].filter(Boolean).join(" > ");
  }

  // -- Config resolution ------------------------------------------------
  // Reads data-projects-url / data-dictionary-url off .page-data-sharing-projects.
  // Throws a clear error rather than letting an undefined URL reach fetch().
  function resolveUrl(datasetKey, attrName) {
    const container = document.querySelector(".page-data-sharing-projects");
    const raw = container && container.dataset[datasetKey];
    if (!raw || !raw.trim()) {
      throw new Error(
        attrName + ' is not set on <div class="page-data-sharing-projects"> (got ' + JSON.stringify(raw) + "). " +
        "Check the front-matter-rendered value in the page's HTML source."
      );
    }
    // Absolute URL: some fetch-wrapping scripts (cookie consent blockers etc.)
    // handle relative paths poorly.
    return new URL(raw, window.location.origin).href;
  }

  function fetchJson(url, label) {
    return fetch(url).then((r) => {
      if (!r.ok) throw new Error("Could not fetch " + label + " (HTTP " + r.status + ")");
      return r.json();
    });
  }

  // ---------- Loading & linking ----------

  // Index the data dictionary by lower-case variable name for case-insensitive linking.
  function buildDictionaryIndex(dictionary) {
    const index = new Map();
    dictionary.forEach((rec) => {
      const name = rec && rec["NSHD Variable Name"];
      if (!name) return;
      const key = String(name).trim().toLowerCase();
      if (!index.has(key)) index.set(key, rec); // first entry wins if a name repeats
    });
    return index;
  }

  function prepareProjects(data, dictByKey) {
    if (!data || !Array.isArray(data.projects)) {
      throw new Error("The projects file does not contain a 'projects' list.");
    }
    const properNames = data.variables || {};
    const notInDictionary = new Set();

    const projects = data.projects.map((p) => {
      const keys = p.variables || [];
      const variableList = keys.map((key) => {
        const rec = dictByKey.get(key);
        const properName = (properNames[key] && properNames[key].Name) || key;
        if (!rec) {
          notInDictionary.add(key);
          return {
            variable_name: properName, variable_label: "", topic: "",
            subtopic_1: "", subtopic_2: "", subtopic_3: "", subtopic_4: "",
            year_of_collection: "", _inDictionary: false,
            // Only treat as unavailable if the dictionary loaded; if it failed to
            // load, every variable would look missing, which would be misleading.
            _unavailable: dictionaryLoaded,
          };
        }
        return {
          variable_name: rec["NSHD Variable Name"] || properName,
          variable_label: rec["Variable Label"] || "",
          topic: rec["Topic"] || "",
          subtopic_1: rec["Subtopic 1"] || "",
          subtopic_2: rec["Subtopic 2"] || "",
          subtopic_3: rec["Subtopic 3"] || "",
          subtopic_4: rec["Subtopic 4"] || "",
          year_of_collection: rec["Year of collection"] || "",
          _inDictionary: true,
          _unavailable: false,
        };
      });

      const out = Object.assign({}, p);
      out.title = p.title || "";
      out.summary = p.summary || "";
      out.principal_applicant = p.principal_applicant || "";
      out.variable_list = variableList;
      out.variable_count = variableList.length;
      // Everything the search box should match, built once up front
      out._search = [p.pid, out.title, out.summary, out.principal_applicant, p.institution, p.country]
        .concat(variableList.map((v) => v.variable_name + " " + v.variable_label))
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return out;
    });

    if (dictionaryLoaded && notInDictionary.size) {
      console.warn(
        "[Data Sharing Projects] Variables requested by projects but not found in the data dictionary " +
        "(shown with their name only):",
        Array.from(notInDictionary).slice(0, 50),
        notInDictionary.size > 50 ? "... and " + (notInDictionary.size - 50) + " more" : ""
      );
    }
    return projects;
  }

  // ---------- Boot ----------

  function init() {
    let projectsPromise, dictionaryPromise;
    try {
      projectsPromise = window.DSP_PROJECTS_INLINE
        ? Promise.resolve(window.DSP_PROJECTS_INLINE)
        : fetchJson(resolveUrl("projectsUrl", "data-projects-url"), "projects JSON");

      // The dictionary is optional: if it fails to load the table still works,
      // the expanded variables just show names without labels/topics/years.
      dictionaryPromise = (window.DSP_DICTIONARY_INLINE
        ? Promise.resolve(window.DSP_DICTIONARY_INLINE)
        : fetchJson(resolveUrl("dictionaryUrl", "data-dictionary-url"), "dictionary JSON")
      ).catch((err) => {
        console.warn("[Data Sharing Projects] Data dictionary not loaded; labels, topics and years will be blank.", err);
        return null;
      });
    } catch (err) {
      el("loadingScreen").innerHTML = "<div>" + escapeHtml(err.message) + "</div>";
      console.error(err);
      return;
    }

    Promise.all([projectsPromise, dictionaryPromise])
      .then(([data, dictionary]) => {
        dictionaryLoaded = Array.isArray(dictionary);
        const dictByKey = buildDictionaryIndex(dictionaryLoaded ? dictionary : []);
        allProjects = prepareProjects(data, dictByKey);
        filtered = allProjects;
        // Banner: which year the list starts from (the projects file also holds every project before the metrics' reporting years)
        const yrs = allProjects.map((p) => Number(p.year_of_application)).filter((y) => y > 0);
        const firstYear = yrs.length ? Math.min.apply(null, yrs) : (data.start_year || null);
        if (firstYear && el("projectsFrom")) {
          el("projectsFrom").textContent = "This list starts from " + firstYear + ": it includes " + allProjects.length.toLocaleString("en-GB") + " projects with an application year of " + firstYear + " or later.";
        }
        el("loadingScreen").style.display = "none";
        el("dataUI").style.display = "block";
        bindControls();
        render();
      })
      .catch((err) => {
        el("loadingScreen").innerHTML =
          "<div>Could not build the projects table (" + escapeHtml(err.message) +
          "). Check the data-projects-url / data-dictionary-url attributes on .page-data-sharing-projects, " +
          "and open the console for details.</div>";
        console.error(err);
      });
  }

  // ---------- Controls, filtering, sorting ----------

  function bindControls() {
    el("globalSearch").addEventListener("input", (e) => {
      searchTerm = e.target.value;
      applyFilters();
    });
    el("pageSize").addEventListener("change", (e) => {
      pageSize = parseInt(e.target.value, 10);
      currentPage = 1;
      render();
    });
    el("resetFiltersBtn").addEventListener("click", () => {
      el("globalSearch").value = "";
      searchTerm = "";
      applyFilters();
    });
    el("downloadExcelBtn").addEventListener("click", downloadProjectsExcel);
  }

  function applyFilters() {
    const term = searchTerm.trim().toLowerCase();
    filtered = term ? allProjects.filter((p) => p._search.includes(term)) : allProjects;
    currentPage = 1;
    render();
  }

  // Blank values always sort last, whichever direction is chosen.
  function sortProjects(list, state) {
    if (!state || !state.key) return list;
    const { key, dir } = state;
    const isBlank = (x) => x === null || x === undefined || x === "";
    return list.slice().sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (isBlank(av) && isBlank(bv)) return String(a.pid).localeCompare(String(b.pid));
      if (isBlank(av)) return 1;
      if (isBlank(bv)) return -1;
      let result;
      if (key === "variable_count") {
        result = (av - bv) * dir;
      } else {
        const as = String(av).toLowerCase();
        const bs = String(bv).toLowerCase();
        result = as < bs ? -1 * dir : as > bs ? 1 * dir : 0;
      }
      return result || String(a.pid).localeCompare(String(b.pid));
    });
  }

  function formatDate(iso) {
    if (!iso) return "";
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
    if (!m) return String(iso);
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  }

  // ---------- Rendering ----------

  function renderProjectsHeader() {
    const thead = el("projectsThead");

    function sortHeader(label, key, colClass) {
      const active = projectSortState && projectSortState.key === key;
      const arrow = active ? (projectSortState.dir === 1 ? "&#9650;" : "&#9660;") : "&#8645;";
      return (
        '<th class="sortable-header ' + colClass + '" data-sort-key="' + key + '">' +
        '<span class="th-inner">' +
        '<span class="header-label">' + label + "</span>" +
        '<span class="sort-icon' + (active ? " is-active" : "") + '">' + arrow + "</span>" +
        "</span></th>"
      );
    }

    thead.innerHTML =
      "<tr>" +
      '<th class="col-expand" title="Click a row to expand" aria-label="Expand row"></th>' +
      sortHeader("Project ID", "pid", "col-pid") +
      sortHeader("Date submitted", "date_submitted", "col-date") +
      sortHeader("Principal applicant", "principal_applicant", "col-applicant") +
      sortHeader("Title", "title", "col-title") +
      sortHeader("Summary", "summary", "col-summary") +
      sortHeader("Variables", "variable_count", "col-vars") +
      "</tr>";

    thead.querySelectorAll(".sortable-header .th-inner").forEach((inner) => {
      inner.addEventListener("click", () => {
        const key = inner.closest(".sortable-header").dataset.sortKey;
        const dir = projectSortState && projectSortState.key === key ? projectSortState.dir * -1 : 1;
        projectSortState = { key, dir };
        render();
      });
    });
  }

  function render() {
    refreshBasketCache(); // load the basket ONCE per render
    renderProjectsHeader();

    const sorted = sortProjects(filtered, projectSortState);
    const start = (currentPage - 1) * pageSize;
    const pageRows = sorted.slice(start, start + pageSize);

    el("resultsCount").textContent =
      filtered.length + " project" + (filtered.length === 1 ? "" : "s") + " (of " + allProjects.length + ")";

    const tbody = el("projects-body");
    tbody.innerHTML = "";
    if (!pageRows.length) {
      tbody.innerHTML = '<tr><td colspan="' + COLUMN_COUNT + '" class="no-projects">No projects match your search.</td></tr>';
    }
    pageRows.forEach((p) => {
      tbody.appendChild(buildProjectRow(p));
      if (expandedKeys.has(p.pid)) tbody.appendChild(buildVariablePanelRow(p));
    });

    renderPagination();
  }

  function buildProjectRow(p) {
    const tr = document.createElement("tr");
    const isOpen = expandedKeys.has(p.pid);
    const count = p.variable_count || 0;
    tr.className = "project-row" + (isOpen ? " is-open" : "");
    tr.dataset.key = p.pid;

    tr.innerHTML =
      '<td class="col-expand"><button class="expand-btn" aria-expanded="' + isOpen +
      '" aria-label="Toggle variable list">' + (isOpen ? "&#9662;" : "&#9656;") + "</button></td>" +
      '<td class="col-pid">' + escapeHtml(p.pid || "") + "</td>" +
      '<td class="col-date">' + escapeHtml(formatDate(p.date_submitted)) + "</td>" +
      '<td class="col-applicant">' + escapeHtml(p.principal_applicant) +
      (p.institution ? '<div class="applicant-inst">' + escapeHtml(p.institution) + "</div>" : "") + "</td>" +
      '<td class="col-title">' + escapeHtml(p.title) + "</td>" +
      '<td class="col-summary"><div class="summary-clamp">' + escapeHtml(p.summary) + "</div></td>" +
      '<td class="col-vars' + (count === 0 ? " col-vars-empty" : "") + '"><button class="var-count-badge' + (count === 0 ? " is-empty" : "") + '"' +
      (count === 0 ? ' title="No variables recorded for this project. Open the row to see why." aria-label="No variables recorded for this project"' : "") + ">" +
      (count === 0 ? '<svg class="no-vars-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="12" fill="#d32f2f"/><rect x="4.5" y="9.2" width="15" height="5.6" rx="0.8" fill="#fff"/></svg>' : count + (count === 1 ? " variable" : " variables")) + "</button></td>";

    // Whole row toggles; the arrow and badge have no listeners of their own so
    // a click on either does not double-toggle.
    tr.addEventListener("click", () => toggleRow(p.pid));
    return tr;
  }

  function toggleRow(key) {
    if (expandedKeys.has(key)) expandedKeys.delete(key);
    else expandedKeys.add(key);
    render();
  }

  // Full summary and project details (the table cell only shows the first lines)
  function projectDetailHtml(p) {
    const meta = [];
    if (p.institution) meta.push("<span><strong>Institution:</strong> " + escapeHtml(p.institution) + "</span>");
    if (p.country) meta.push("<span><strong>Country:</strong> " + escapeHtml(p.country) + "</span>");
    if (p.date_approved) meta.push("<span><strong>Approved:</strong> " + escapeHtml(formatDate(p.date_approved)) + "</span>");
    if (!meta.length && !p.summary) return "";
    return (
      '<div class="project-detail">' +
      (meta.length ? '<div class="project-detail-meta">' + meta.join("") + "</div>" : "") +
      (p.summary
        ? '<div class="project-detail-heading">Project summary</div>' +
          '<p class="project-detail-summary">' + escapeHtml(p.summary) + "</p>"
        : "") +
      "</div>"
    );
  }

  function buildVariablePanelRow(p) {
    const tr = document.createElement("tr");
    tr.className = "variable-panel-row";
    const td = document.createElement("td");
    td.colSpan = COLUMN_COUNT;
    const detailHtml = projectDetailHtml(p);

    if (!p.variable_list.length) {
      td.innerHTML =
        '<div class="variable-panel">' + detailHtml +
        '<div class="empty-note">No variables are recorded for this project. The variables may not have been requested yet, ' +
        "they may have been requested before Condor (through the earlier request system) or by another route, " +
        "or the applicants may already have had access to them.</div></div>";
      tr.appendChild(td);
      return tr;
    }

    const searchVal = openVariableSearch[p.pid] || "";
    let vars = p.variable_list;
    if (searchVal) {
      const t = searchVal.toLowerCase();
      vars = vars.filter(
        (v) =>
          (v.variable_name || "").toLowerCase().includes(t) ||
          (v.variable_label || "").toLowerCase().includes(t) ||
          (v.topic || "").toLowerCase().includes(t)
      );
    }
    const sortState = variableSortState[p.pid];
    vars = sortVars(vars, sortState);

    // Only variables that exist in OWL can be added to the basket
    const basketable = vars.filter((v) => v.variable_name && !v._unavailable);
    const allInBasket = basketable.length > 0 && basketable.every((v) => inBasketFast(v.variable_name));
    const rowsHtml = vars
      .map((v) => {
        if (v._unavailable) {
          // No tick box, no link (there is no metadata page), a message instead of a label
          return (
            '<tr class="is-unavailable">' +
            '<td class="col-check"><input type="checkbox" class="row-select" disabled ' +
            'title="' + escapeAttr(UNAVAILABLE_MESSAGE) + '" aria-label="Not available to add"></td>' +
            "<td>" + escapeHtml(v.variable_name || "") + "</td>" +
            '<td><span class="var-unavailable">' + escapeHtml(UNAVAILABLE_MESSAGE) + "</span></td>" +
            '<td class="var-topic"></td><td></td></tr>'
          );
        }
        const checked = v.variable_name && inBasketFast(v.variable_name);
        const varUrl = variableMetadataUrl(v.variable_name || "");
        const lastTopic = lastSubtopic(v);
        const catUrl = categoryPageUrl(v);
        const topicCell = catUrl
          ? '<a class="topic-link" href="' + escapeAttr(catUrl) + '" target="_blank" rel="noopener">' + escapeHtml(lastTopic) + "</a>"
          : escapeHtml(lastTopic);
        return (
          "<tr>" +
          '<td class="col-check"><input type="checkbox" class="row-select" ' +
          'data-var-name="' + escapeAttr(v.variable_name || "") + '" ' +
          'data-label="' + escapeAttr(v.variable_label || "") + '" ' +
          'aria-label="Add variable" ' + (checked ? "checked" : "") + "></td>" +
          '<td><a class="var-link" href="' + escapeAttr(varUrl) + '" target="_blank" rel="noopener">' +
          escapeHtml(v.variable_name || "") + "</a></td>" +
          "<td>" + escapeHtml(v.variable_label || "") + "</td>" +
          '<td class="var-topic" title="' + escapeAttr(topicPath(v)) + '">' + topicCell + "</td>" +
          "<td>" + escapeHtml(v.year_of_collection || "") + "</td>" +
          "</tr>"
        );
      })
      .join("");

    function varSortHeader(label, key) {
      const active = sortState && sortState.key === key;
      const arrow = active ? (sortState.dir === 1 ? "&#9650;" : "&#9660;") : "&#8645;";
      return (
        '<th class="sortable-header" data-sort-key="' + key + '">' +
        '<span class="th-inner"><span class="header-label">' + label + "</span>" +
        '<span class="sort-icon' + (active ? " is-active" : "") + '">' + arrow + "</span></span></th>"
      );
    }

    // Tell the reader if some variables have no label/topic/year
    const unmatched = p.variable_list.filter((v) => !v._inDictionary).length;
    let note = "";
    if (!dictionaryLoaded) {
      note = '<div class="dictionary-note">Variable labels could not be loaded, so only names are shown.</div>';
    } else if (unmatched) {
      note = '<div class="dictionary-note">' + unmatched + (unmatched === 1 ? " variable is" : " variables are") +
        " not yet available in OWL, so can not be added to the basket.</div>";
    }

    const noResults = vars.length === 0;
    const noneAddable = !noResults && basketable.length === 0; // every shown variable is unavailable

    td.innerHTML =
      '<div class="variable-panel">' +
      detailHtml +
      '<div class="variable-panel-toolbar">' +
      "<strong>" + p.variable_list.length + " variable" + (p.variable_list.length === 1 ? "" : "s") + " requested</strong>" +
      '<input class="variable-search" type="text" placeholder="Filter these variables..." value="' + escapeAttr(searchVal) + '" />' +
      '<button class="add-all-variables-btn' + (noResults || noneAddable ? " is-empty" : allInBasket ? " remove-mode" : "") + '"' +
      (noResults || noneAddable ? " disabled" : "") + ">" +
      (noResults ? "No variables to add" : noneAddable ? "None available to add" : allInBasket ? "Remove all from basket" : "Add all to basket") +
      "</button>" +
      '<button class="var-download-btn" type="button">Download variable list</button>' +
      "</div>" +
      note +
      '<table class="variable-table"><thead><tr><th>Add variable</th>' +
      varSortHeader("Variable Name", "variable_name") +
      varSortHeader("Variable Label", "variable_label") +
      varSortHeader("Topic", "topic") +
      varSortHeader("Year", "year_of_collection") +
      "</tr></thead><tbody>" +
      (rowsHtml || '<tr><td colspan="5" class="empty-state">No variables match that filter.</td></tr>') +
      "</tbody></table></div>";

    tr.appendChild(td);

    // -- Column sorting ---------------------------------------------------
    td.querySelectorAll(".sortable-header").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.sortKey;
        const current = variableSortState[p.pid];
        const dir = current && current.key === key ? current.dir * -1 : 1;
        variableSortState[p.pid] = { key, dir };
        render();
      });
    });

    // -- Individual basket checkboxes ---------------------------------------
    // data-var-name + data-label match the markup refreshBasketCheckboxesUI()
    // in basket_header.js recognises, so ticks stay in sync with other pages.
    td.querySelectorAll(".row-select").forEach((cb) => {
      cb.addEventListener("change", (e) => {
        const varName = e.target.dataset.varName;
        const label = e.target.dataset.label || "";
        if (!varName) return;
        if (e.target.checked) addToBasket(varName, label);
        else removeFromBasket(varName);
        refreshBasketCache();
        render();
      });
    });

    // -- Per-project "add all / remove all" -----------------------------------
    td.querySelector(".add-all-variables-btn").addEventListener("click", () => {
      if (noResults || noneAddable) return;
      const varNames = basketable.map((v) => v.variable_name);
      if (allInBasket) {
        batchRemoveFromBasket(varNames);
      } else {
        const items = basketable.map((v) => ({ varName: v.variable_name, label: v.variable_label || "" }));
        batchAddToBasket(items);
      }
      refreshBasketCache();
      render();
    });

    const input = td.querySelector(".variable-search");
    input.addEventListener("input", (e) => {
      openVariableSearch[p.pid] = e.target.value;
      render();
      const again = document.querySelector(
        '.project-row[data-key="' + cssEscape(p.pid) + '"] + .variable-panel-row .variable-search'
      );
      if (again) {
        again.focus();
        again.setSelectionRange(again.value.length, again.value.length);
      }
    });

    td.querySelector(".var-download-btn").addEventListener("click", (e) => {
      e.preventDefault();
      downloadVariablesExcel(p);
    });

    return tr;
  }

  function sortVars(vars, sortState) {
    if (!sortState || !sortState.key) return vars;
    const { key, dir } = sortState;
    const valueOf = (v) => (key === "topic" ? lastSubtopic(v) : v[key]) || "";
    return vars.slice().sort((a, b) => {
      const av = String(valueOf(a)).toLowerCase();
      const bv = String(valueOf(b)).toLowerCase();
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }

  function renderPagination() {
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const html =
      '<button ' + (currentPage <= 1 ? "disabled" : "") + ' class="prevPage">Prev</button>' +
      " Page " + currentPage + " of " + totalPages + " " +
      '<button ' + (currentPage >= totalPages ? "disabled" : "") + ' class="nextPage">Next</button>';
    el("paginationTop").innerHTML = html;
    el("paginationBottom").innerHTML = html;

    document.querySelectorAll(".prevPage").forEach((b) =>
      b.addEventListener("click", () => {
        currentPage = Math.max(1, currentPage - 1);
        render();
      })
    );
    document.querySelectorAll(".nextPage").forEach((b) =>
      b.addEventListener("click", () => {
        currentPage = Math.min(totalPages, currentPage + 1);
        render();
      })
    );
  }

  // -- Excel export (ExcelJS, loaded via <script> on the page) -------------
  const HEADER_FILL = "FF4B067A"; // the site's purple accent
  const ROW_FILL_A = "FFF7F7F7";
  const ROW_FILL_B = "FFFFFFFF";
  const BORDER = { style: "thin", color: { argb: "FFE0E0E0" } };

  function buildStyledWorksheet(workbook, sheetName, columns, rows) {
    const sheet = workbook.addWorksheet(sheetName);
    sheet.columns = columns;

    const headerRow = sheet.getRow(1);
    headerRow.height = 20;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      cell.border = { bottom: { style: "medium", color: { argb: HEADER_FILL } } };
    });

    rows.forEach((r, i) => {
      const row = sheet.addRow(r);
      const fill = i % 2 === 0 ? ROW_FILL_A : ROW_FILL_B;
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
        cell.border = { bottom: BORDER };
        cell.alignment = { vertical: "top", wrapText: true };
      });
    });

    sheet.views = [{ state: "frozen", ySplit: 1 }]; // keep the header visible when scrolling
    return sheet;
  }

  function triggerExcelDownload(workbook, filename) {
    workbook.xlsx.writeBuffer().then((buf) => {
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  // Always the full project list, not just what is currently searched on screen.
  function downloadProjectsExcel() {
    const workbook = new ExcelJS.Workbook();
    buildStyledWorksheet(
      workbook,
      "Data sharing projects",
      [
        { header: "Project ID", key: "pid", width: 14 },
        { header: "Date submitted", key: "date_submitted", width: 16 },
        { header: "Date approved", key: "date_approved", width: 16 },
        { header: "Principal applicant", key: "principal_applicant", width: 28 },
        { header: "Institution", key: "institution", width: 34 },
        { header: "Country", key: "country", width: 16 },
        { header: "Title", key: "title", width: 46 },
        { header: "Summary", key: "summary", width: 70 },
        { header: "Number of variables", key: "variable_count", width: 20 },
      ],
      allProjects.map((p) => ({
        pid: p.pid || "",
        date_submitted: p.date_submitted || "",
        date_approved: p.date_approved || "",
        principal_applicant: p.principal_applicant || "",
        institution: p.institution || "",
        country: p.country || "",
        title: p.title || "",
        summary: p.summary || "",
        variable_count: p.variable_count || 0,
      }))
    );
    triggerExcelDownload(workbook, "data_sharing_projects.xlsx");
  }

  function downloadVariablesExcel(p) {
    const workbook = new ExcelJS.Workbook();
    buildStyledWorksheet(
      workbook,
      String(p.pid || "Variables").slice(0, 31), // sheet names have a 31-char limit
      [
        { header: "Variable Name", key: "variable_name", width: 25 },
        { header: "Variable Label", key: "variable_label", width: 50 },
        { header: "Topic", key: "topic", width: 32 },
        { header: "Year of Collection", key: "year", width: 14 },
      ],
      (p.variable_list || []).map((v) => ({
        variable_name: v.variable_name || "",
        variable_label: v._unavailable ? UNAVAILABLE_MESSAGE : (v.variable_label || ""),
        topic: topicPath(v),
        year: v.year_of_collection || "",
      }))
    );
    triggerExcelDownload(workbook, String(p.pid).replace(/[^\w.-]+/g, "_") + "_variables.xlsx");
  }

  function escapeHtml(str) {
    return String(str === null || str === undefined ? "" : str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function escapeAttr(str) {
    return String(str === null || str === undefined ? "" : str).replace(/"/g, "&quot;");
  }

  function cssEscape(str) {
    return String(str).replace(/["\\]/g, "\\$&");
  }

  document.addEventListener("DOMContentLoaded", init);

  // -- Keep in sync with basket changes made elsewhere ---------------------
  window.addEventListener("nshd-basket-changed", () => {
    if (!allProjects.length) return; // page hasn't finished loading yet
    refreshBasketCache();
    render();
  });
})();
