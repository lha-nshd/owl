/* ukllc_catalogue.js
 * Fully client-side: no Python build step, no pre-generated datasets.json.
 * On page load this:
 * 1. Fetches the File 2 Documentation Master spreadsheet (.xlsx) and
 * parses it with SheetJS (https://sheetjs.com).
 * 2. Fetches the Data Dictionary JSON export (the same one
 * data_dictionary.js uses on the Search page).
 * 3. Links each dataset to the variables that list it, by normalising
 * file names (case, whitespace, extension).
 * 4. Renders an expandable-row catalogue table with basket integration.
 *
 * Configure the two source paths as data-attributes on the page's own
 * wrapper element (deliberately NOT an inline <script> block - some CSP
 * setups silently block inline scripts while still allowing external
 * <script src>, which is why a previous version of this page failed with
 * "UKLLC_XLSX_URL is not set"; plain HTML attributes sidestep that):
 * <div class="page-ukllc-catalogue"
 * data-xlsx-url="..."
 * data-dictionary-url="...">
 *
 * Preview pages with no web server can instead set these globals directly
 * (see preview_standalone.html), which take priority over the attributes:
 * window.UKLLC_XLSX_INLINE_BASE64 -> base64 of the .xlsx file
 * window.UKLLC_DICTIONARY_INLINE -> the dictionary JSON as a JS array
 */
(function () {
 "use strict";

 // Columns we pull from the spreadsheet. Keys are our output field names;
 // values are how the header text starts in row 5 of the sheet (matched
 // with startsWith so trailing spaces/typos in the header don't break it).
 const FIELD_MAP = {
 file_name: "2. Dataset File Name",
 doc_name: "3. Dataset Name for Documentation",
 long_description: "4. Long Description",
 short_description: "5. Short Description",
 collection_start: "10a. Timepoint: Collection Start",
 collection_end: "10b. Timepoint: Collection End",
 n_included: "12. Number of Participants Included",
 keywords: "14. Keywords",
 sensitivity: "15. Sensitivity",
 documentation_link: "16. Link To Key Dataset Documentation",
 };

 let allDatasets = [];
 let filtered = [];
 let currentPage = 1;
 let pageSize = 30;
 let expandedKeys = new Set();
 let openVariableSearch = {};
 let variableSortState = {}; // file_name -> { key: 'variable_name'|'variable_label'|'topic'|'year_of_collection', dir: 1|-1 }
 let searchTerm = "";
 let selectedDatasetFile = ""; // "" means "All datasets"
 let catalogueSortState = { key: null, dir: 1 }; // key: 'doc_name'|'long_description'|'variable_count'

 // -- Basket cache -------------------------------------------------------
 // Same pattern as data_dictionary.js: one localStorage read per render via
 // the shared loadBasket() (from basket_header.js, already loaded site-wide
 // by the layout), O(1) lookups per row after that.
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

 // -- Link targets ------------------------------------------------------
 // Variable metadata page: matches the convention data_dictionary.js and
 // basket_header.js both use (no ".html"). Note: baskets.js's basket table
 // appends ".html" to the same base URL - that's an inconsistency in the
 // existing site, not something introduced here; worth checking which one
 // actually resolves before relying on it.
 const VARIABLE_METADATA_BASE_URL = "https://rmjdish.github.io/OWL/assets/variable_metadata/";

 // Category / "Browse by Category" pages, e.g.:
 // https://rmjdish.github.io/OWL/docs/search_methods/browse_by_category/cat_pages/Blood_biochemistry_2011.html
 // Built from the Topic column text shown for each variable (per your
 // instruction - NOT the dataset name, which was giving wrong/inconsistent
 // links since a dataset can contain variables from several different
 // topics). cleanCategoryLabel() strips the same "Topic - " / "(category
 // NNNN)" boilerplate the dataset name field also used, in case the Topic
 // field carries the same formatting.
 // CAVEAT: I only have one confirmed example, and it was dataset-name-based
 // (now known misleading - see below). I don't have a confirmed example of
 // a Topic-only link, so this needs a real check once deployed. If a link
 // still 404s, send me the exact Topic text shown in that row plus the
 // correct URL and I'll fix the pattern for real rather than guess again.
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

 // Strips a leading "Topic - " and/or trailing " (category NNNN)" from a
 // label, returning the clean name plus the category number if one was
 // found in the "(category NNNN)" part.
 // Strips the trailing "[NNN]" bracket-number the dictionary's own
 // Topic/Subtopic fields use - confirmed straight from your original
 // sample data, e.g. "Population characteristics [54]" - returning the
 // clean name plus that number as the category code. A previous version
 // of this guessed at a "(category NNNN)" round-parenthesis format instead
 // (borrowed from the dataset-name field's different convention), which
 // left literal square brackets in the URL when the real format didn't
 // match - that's the bug being fixed here.
 function cleanCategoryLabel(raw) {
 let name = String(raw || "").trim();
 let code = null;
 name = name.replace(/\s*\[(\d+)\]\s*$/, (_, num) => {
 code = num;
 return "";
 });
 return { name: name.trim(), code };
 }

 // Built from the variable's own Topic column (the deepest non-empty
 // subtopic, same text shown in the table) rather than the dataset name - 
 // each variable can link to its own category page even when several
 // variables with different topics sit inside the same dataset file.
 function categoryPageUrl(v) {
 const raw = lastSubtopic(v) || v.topic || "";
 if (!raw) return null;
 const { name, code } = cleanCategoryLabel(raw);
 if (!name) return null;
 const slug = toCategorySlug(name);
 return CATEGORY_PAGE_BASE_URL + "/" + slug + (code ? "_" + code : "") + ".html";
 }

 // Deepest non-empty subtopic (falls back up the chain to Topic itself if
 // every subtopic level is blank), for the compact column display.
 function lastSubtopic(v) {
 const chain = [v.subtopic_4, v.subtopic_3, v.subtopic_2, v.subtopic_1, v.topic];
 return chain.find((x) => x && String(x).trim()) || "";
 }

 function normalise(name) {
 if (!name) return "";
 return String(name)
 .trim()
 .replace(/\.(csv|sav|dta|tsv|xlsx?)$/i, "")
 .toLowerCase();
 }

 // -- Config resolution ------------------------------------------------
 // Reads data-xlsx-url / data-dictionary-url off .page-ukllc-catalogue.
 // Throws a clear, specific error rather than letting a missing value
 // reach fetch() as undefined (which is what produced the cryptic
 // "e[0] is undefined" crash inside ucl-consent-blocker.js previously).
 function resolveUrl(datasetKey, attrName) {
 const container = document.querySelector(".page-ukllc-catalogue");
 const raw = container && container.dataset[datasetKey];
 if (!raw || !raw.trim()) {
 throw new Error(
 attrName + ' is not set on <div class="page-ukllc-catalogue"> (got ' + JSON.stringify(raw) + "). " +
 "Check the front-matter-rendered value in the page's HTML source."
 );
 }
 // Resolve to a fully-qualified absolute URL. A root-relative path like
 // "/OWL/assets/..." is valid on its own, but some fetch-wrapping
 // scripts (cookie consent blockers etc.) handle relative paths poorly - 
 // passing an absolute URL sidesteps that.
 return new URL(raw, window.location.origin).href;
 }

 // ---------- Loading & linking ----------

 function base64ToWorkbookRows(b64) {
 const binary = atob(b64);
 const bytes = new Uint8Array(binary.length);
 for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
 const wb = XLSX.read(bytes, { type: "array", cellDates: false });
 const ws = wb.Sheets[wb.SheetNames[0]];
 return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
 }

 function loadWorkbook(url) {
 return fetch(url)
 .then((r) => {
 if (!r.ok) throw new Error("Could not fetch spreadsheet (HTTP " + r.status + ")");
 return r.arrayBuffer();
 })
 .then((buf) => {
 const wb = XLSX.read(buf, { type: "array", cellDates: false });
 const ws = wb.Sheets[wb.SheetNames[0]];
 return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
 });
 }

 function normaliseHeader(s) {
 // Collapses any run of whitespace to a single space before comparing, so
 // this can't silently break again if a header has one space vs two (the
 // exact bug that broke Dataset Description: an earlier cleanup pass
 // accidentally collapsed the FIELD_MAP target's intentional double space,
 // and an exact-spacing match failed silently rather than erroring).
 return String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
 }

 function parseDatasets(rows) {
 const headerRowIdx = rows.findIndex(
 (row) => row && row.some((c) => c && normaliseHeader(c).startsWith(normaliseHeader(FIELD_MAP.file_name)))
 );
 if (headerRowIdx === -1) {
 throw new Error('Could not find the header row ("2. Dataset File Name") in the spreadsheet.');
 }
 const headers = rows[headerRowIdx].map((c) => (c ? String(c).trim() : ""));
 const colIdx = {};
 const unmatched = [];
 Object.keys(FIELD_MAP).forEach((key) => {
 const target = FIELD_MAP[key];
 colIdx[key] = headers.findIndex((h) => normaliseHeader(h).startsWith(normaliseHeader(target)));
 if (colIdx[key] === -1) unmatched.push(target);
 });
 if (unmatched.length) {
 console.warn(
 "[UKLLC Catalogue] Could not find these spreadsheet columns (check the header text still matches):",
 unmatched,
 "Actual headers found:",
 headers.filter(Boolean)
 );
 }

 const datasets = [];
 // +2 to skip the header row itself and the instructions row beneath it
 for (let i = headerRowIdx + 2; i < rows.length; i++) {
 const row = rows[i];
 if (!row) continue;
 const fileName = colIdx.file_name >= 0 ? row[colIdx.file_name] : null;
 if (!fileName || !String(fileName).trim()) continue;

 const entry = { variables: [] };
 Object.keys(FIELD_MAP).forEach((key) => {
 const idx = colIdx[key];
 entry[key] = idx >= 0 ? row[idx] : null;
 });
 entry._key = normalise(entry.file_name);
 datasets.push(entry);
 }
 return datasets;
 }

 function linkVariables(datasets, variables) {
 const byKey = new Map(datasets.map((d) => [d._key, d]));
 const unmatched = new Map(); // dataset name referenced by a variable but absent from the spreadsheet

 variables.forEach((v) => {
 const raw = (v["UKLLC Dataset Name(s)"] || "").trim();
 if (!raw) return;
 raw.split(",").forEach((rawName) => {
 const name = rawName.trim();
 if (!name) return;
 const key = normalise(name);
 const target = byKey.get(key);
 const record = {
 variable_name: v["NSHD Variable Name"],
 variable_label: v["Variable Label"],
 showcase_field_id: v["Showcase Field ID"],
 topic: v["Topic"],
 subtopic_1: v["Subtopic 1"],
 subtopic_2: v["Subtopic 2"],
 subtopic_3: v["Subtopic 3"],
 subtopic_4: v["Subtopic 4"],
 form: v["Form"],
 year_of_collection: v["Year of collection"],
 };
 if (target) {
 target.variables.push(record);
 } else {
 if (!unmatched.has(name)) unmatched.set(name, new Set());
 unmatched.get(name).add(v["NSHD Variable Name"]);
 }
 });
 });

 datasets.forEach((d) => {
 d.variable_count = d.variables.length;
 });

 return unmatched;
 }

 function logQaReport(datasets, unmatched) {
 const zeroVar = datasets.filter((d) => d.variable_count === 0).map((d) => d.file_name);
 if (zeroVar.length) {
 console.warn("[UKLLC Catalogue] Datasets with no variables linked:", zeroVar);
 }
 if (unmatched.size) {
 const detail = {};
 unmatched.forEach((vars, name) => (detail[name] = Array.from(vars).slice(0, 3)));
 console.warn(
 "[UKLLC Catalogue] Dataset names referenced in the dictionary but not found in the spreadsheet " +
 "(check for typos or mismatched version/date suffixes):",
 detail
 );
 }
 }

 // ---------- Boot ----------

 function init() {
 let xlsxRowsPromise, variablesPromise;
 try {
 xlsxRowsPromise = window.UKLLC_XLSX_INLINE_BASE64
 ? Promise.resolve(base64ToWorkbookRows(window.UKLLC_XLSX_INLINE_BASE64))
 : loadWorkbook(resolveUrl("xlsxUrl", "data-xlsx-url"));

 variablesPromise = window.UKLLC_DICTIONARY_INLINE
 ? Promise.resolve(window.UKLLC_DICTIONARY_INLINE)
 : fetch(resolveUrl("dictionaryUrl", "data-dictionary-url")).then((r) => {
 if (!r.ok) throw new Error("Could not fetch dictionary JSON (HTTP " + r.status + ")");
 return r.json();
 });
 } catch (err) {
 el("loadingScreen").innerHTML = "<div>" + err.message + "</div>";
 console.error(err);
 return;
 }

 Promise.all([xlsxRowsPromise, variablesPromise])
 .then(([xlsxRows, variables]) => {
 const datasets = parseDatasets(xlsxRows);
 const unmatched = linkVariables(datasets, variables);
 logQaReport(datasets, unmatched);
 datasets.forEach((d) => delete d._key);

 allDatasets = datasets;
 filtered = datasets;
 el("loadingScreen").style.display = "none";
 el("dataUI").style.display = "block";
 bindControls();
 render();
 })
 .catch((err) => {
 el("loadingScreen").innerHTML =
 "<div>Could not build the catalogue (" +
 err.message +
 "). Check the data-xlsx-url / data-dictionary-url attributes on .page-ukllc-catalogue, and open the console for details.</div>";
 console.error(err);
 });
 }

 // ---------- Rendering ----------

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
 selectedDatasetFile = "";
 applyFilters();
 });
 el("downloadExcelBtn").addEventListener("click", downloadCatalogueExcel);
 }

 function applyFilters() {
 const term = searchTerm.trim().toLowerCase();
 filtered = allDatasets.filter((d) => {
 if (selectedDatasetFile && d.file_name !== selectedDatasetFile) return false;
 if (!term) return true;
 const haystack = [d.file_name, d.doc_name, d.long_description, d.short_description, d.keywords]
 .filter(Boolean)
 .join(" ")
 .toLowerCase();
 if (haystack.includes(term)) return true;
 return (d.variables || []).some(
 (v) =>
 (v.variable_name || "").toLowerCase().includes(term) ||
 (v.variable_label || "").toLowerCase().includes(term)
 );
 });
 currentPage = 1;
 render();
 }

 function sortDatasets(list, sortState) {
 if (!sortState || !sortState.key) return list;
 const { key, dir } = sortState;
 return list.slice().sort((a, b) => {
 if (key === "variable_count") {
 return ((a.variable_count || 0) - (b.variable_count || 0)) * dir;
 }
 const av = String(a[key] || "").toLowerCase();
 const bv = String(b[key] || "").toLowerCase();
 if (av < bv) return -1 * dir;
 if (av > bv) return 1 * dir;
 return 0;
 });
 }

 function renderCatalogueHeader() {
 const thead = el("catalogueThead");

 function mainSortHeader(label, key, colClass, extraHtml) {
 const active = catalogueSortState && catalogueSortState.key === key;
 const arrow = active ? (catalogueSortState.dir === 1 ? "&#9650;" : "&#9660;") : "&#8645;";
 return (
 '<th class="sortable-header ' + colClass + '" data-sort-key="' + key + '">' +
 '<span class="th-inner">' +
 '<span class="header-label">' + label + "</span>" +
 '<span class="sort-icon' + (active ? " is-active" : "") + '">' + arrow + "</span>" +
 "</span>" +
 (extraHtml || "") +
 "</th>"
 );
 }

 const datasetOptions = allDatasets
 .slice()
 .sort((a, b) => (a.doc_name || "").localeCompare(b.doc_name || ""))
 .map(
 (d) =>
 '<option value="' + escapeAttr(d.file_name) + '"' +
 (d.file_name === selectedDatasetFile ? " selected" : "") +
 ">" + escapeHtml(d.doc_name || d.file_name) + "</option>"
 )
 .join("");

 const datasetSelectHtml =
 '<select class="col-header-filter-select" id="datasetFilter" title="Filter to one dataset">' +
 '<option value="">All datasets</option>' +
 datasetOptions +
 "</select>";

 thead.innerHTML =
 "<tr>" +
 '<th class="col-expand" title="Click to expand">Click to expand</th>' +
 mainSortHeader("Dataset Name", "doc_name", "col-docname", datasetSelectHtml) +
 mainSortHeader("Dataset Description", "long_description", "col-desc") +
 mainSortHeader("Variables", "variable_count", "col-vars") +
 "</tr>";

 // Bound to .th-inner specifically (not the whole <th>) so clicking the
 // dropdown inside the Dataset Name header filters instead of sorting.
 thead.querySelectorAll(".sortable-header .th-inner").forEach((inner) => {
 inner.addEventListener("click", () => {
 const key = inner.closest(".sortable-header").dataset.sortKey;
 const dir = catalogueSortState && catalogueSortState.key === key ? catalogueSortState.dir * -1 : 1;
 catalogueSortState = { key, dir };
 render();
 });
 });

 const select = thead.querySelector("#datasetFilter");
 if (select) {
 select.addEventListener("click", (e) => e.stopPropagation());
 select.addEventListener("change", (e) => {
 selectedDatasetFile = e.target.value;
 applyFilters();
 });
 }
 }

 function render() {
 // Load basket ONCE per render, same as renderTable() in data_dictionary.js
 refreshBasketCache();

 renderCatalogueHeader();

 const sorted = sortDatasets(filtered, catalogueSortState);
 const start = (currentPage - 1) * pageSize;
 const pageRows = sorted.slice(start, start + pageSize);

 el("resultsCount").textContent =
 filtered.length + " dataset" + (filtered.length === 1 ? "" : "s") + " (of " + allDatasets.length + ")";

 const tbody = el("catalogue-body");
 tbody.innerHTML = "";

 pageRows.forEach((d) => {
 tbody.appendChild(buildDatasetRow(d));
 if (expandedKeys.has(d.file_name)) {
 tbody.appendChild(buildVariablePanelRow(d));
 }
 });

 renderPagination();
 }

 function buildDatasetRow(d) {
 const tr = document.createElement("tr");
 tr.className = "dataset-row" + (expandedKeys.has(d.file_name) ? " is-open" : "");
 tr.dataset.key = d.file_name;

 const isOpen = expandedKeys.has(d.file_name);
 const count = d.variable_count || 0;

 tr.innerHTML =
 '<td class="col-expand"><button class="expand-btn" aria-expanded="' +
 isOpen +
 '" aria-label="Toggle variable list">' +
 (isOpen ? "&#9662;" : "&#9656;") +
 "</button></td>" +
 '<td class="col-docname" title="' + escapeAttr(d.file_name) + '">' + escapeHtml(d.doc_name || "") + "</td>" +
 '<td class="col-desc">' + escapeHtml(d.long_description || "") + "</td>" +
 '<td class="col-vars">' +
 '<button class="var-count-badge' + (count === 0 ? " is-empty" : "") + '">' +
 count + (count === 1 ? " variable" : " variables") +
 "</button></td>";

 // Whole row is clickable - the arrow button and "N variables" badge are
 // still visually present but no longer have their own listeners, so a
 // click on either doesn't double-toggle by both firing its own handler
 // AND bubbling up to this one.
 tr.addEventListener("click", () => toggleRow(d.file_name));

 return tr;
 }

 function toggleRow(key) {
 if (expandedKeys.has(key)) expandedKeys.delete(key);
 else expandedKeys.add(key);
 render();
 }

 function buildVariablePanelRow(d) {
 const tr = document.createElement("tr");
 tr.className = "variable-panel-row";
 const td = document.createElement("td");
 td.colSpan = 4; // matches the outer table's 4 columns (expand, name, description, variables)

 if (!d.variables || d.variables.length === 0) {
 td.innerHTML =
 '<div class="variable-panel empty-state">No variables in the Data Dictionary currently list this file. ' +
 "If this dataset was recently deposited it may not be indexed yet - check the dataset name matches exactly (including version/date) in both sources. See the browser console for a full mismatch report.</div>";
 tr.appendChild(td);
 return tr;
 }

 const searchVal = openVariableSearch[d.file_name] || "";
 let vars = d.variables;
 if (searchVal) {
 const t = searchVal.toLowerCase();
 vars = vars.filter(
 (v) =>
 (v.variable_name || "").toLowerCase().includes(t) ||
 (v.variable_label || "").toLowerCase().includes(t) ||
 (v.topic || "").toLowerCase().includes(t)
 );
 }
 const sortState = variableSortState[d.file_name];
 vars = sortVars(vars, sortState);

 const allInBasket = vars.length > 0 && vars.every((v) => inBasketFast(v.variable_name));
 const rowsHtml = vars
 .map((v) => {
 const checked = v.variable_name && inBasketFast(v.variable_name);
 const varUrl = variableMetadataUrl(v.variable_name || "");
 const lastTopic = lastSubtopic(v);
 const fullPath = topicPath(v);
 const catUrl = categoryPageUrl(v);
 const topicCell = catUrl
 ? '<a class="topic-link" href="' + escapeAttr(catUrl) + '" target="_blank" rel="noopener">' + escapeHtml(lastTopic) + "</a>"
 : escapeHtml(lastTopic);
 return (
 "<tr>" +
 '<td class="col-check"><input type="checkbox" class="row-select" ' +
 'data-var-name="' + escapeAttr(v.variable_name || "") + '" ' +
 'data-label="' + escapeAttr(v.variable_label || "") + '" ' +
 'aria-label="Add variable" ' +
 (checked ? "checked" : "") + "></td>" +
 "<td><a class=\"var-link\" href=\"" + escapeAttr(varUrl) + "\" target=\"_blank\" rel=\"noopener\">" +
 escapeHtml(v.variable_name || "") + "</a></td>" +
 "<td>" + escapeHtml(v.variable_label || "") + "</td>" +
 '<td class="var-topic" title="' + escapeAttr(fullPath) + '">' + topicCell + "</td>" +
 "<td>" + escapeHtml(v.year_of_collection || "") + "</td>" +
 "</tr>"
 );
 })
 .join("");

 function sortHeader(label, key) {
 const active = sortState && sortState.key === key;
 const arrow = active ? (sortState.dir === 1 ? "&#9650;" : "&#9660;") : "&#8645;";
 return (
 '<th class="sortable-header" data-sort-key="' + key + '">' +
 '<span class="th-inner">' +
 '<span class="header-label">' + label + "</span>" +
 '<span class="sort-icon' + (active ? " is-active" : "") + '">' + arrow + "</span>" +
 "</span>" +
 "</th>"
 );
 }

 const noResults = vars.length === 0;

 td.innerHTML =
 '<div class="variable-panel">' +
 '<div class="variable-panel-toolbar">' +
 "<strong>" + d.variables.length + " variable" + (d.variables.length === 1 ? "" : "s") + " in this file</strong>" +
 '<input class="variable-search" type="text" placeholder="Filter these variables..." value="' +
 escapeHtml(searchVal) +
 '" />' +
 '<button class="add-all-variables-btn' + (noResults ? " is-empty" : allInBasket ? " remove-mode" : "") + '"' +
 (noResults ? " disabled" : "") + ">" +
 (noResults ? "No variables to add" : allInBasket ? "Remove all from basket" : "Add all to basket") +
 "</button>" +
 '<button class="var-download-btn" type="button">Download variable list</button>' +
 "</div>" +
 '<table class="variable-table"><thead><tr><th>Add variable</th>' +
 sortHeader("Variable Name", "variable_name") +
 sortHeader("Variable Label", "variable_label") +
 sortHeader("Topic", "topic") +
 sortHeader("Year", "year_of_collection") +
 "</tr></thead>" +
 "<tbody>" + (rowsHtml || '<tr><td colspan="5" class="empty-state">No variables match that filter.</td></tr>') + "</tbody></table>" +
 "</div>";

 tr.appendChild(td);

 // -- Column sorting ---------------------------------------------------
 td.querySelectorAll(".sortable-header").forEach((th) => {
 th.addEventListener("click", () => {
 const key = th.dataset.sortKey;
 const current = variableSortState[d.file_name];
 const dir = current && current.key === key ? current.dir * -1 : 1;
 variableSortState[d.file_name] = { key, dir };
 render();
 });
 });

 // -- Individual basket checkboxes ------------------------------------
 // data-var-name + data-label match the convention refreshBasketCheckboxesUI()
 // in basket_header.js already recognises, so these also stay in sync when
 // a variable is added/removed from the Data Dictionary page or elsewhere.
 td.querySelectorAll(".row-select").forEach((cb) => {
 cb.addEventListener("change", (e) => {
 const varName = e.target.dataset.varName;
 const label = e.target.dataset.label || "";
 if (!varName) return;
 if (e.target.checked) {
 addToBasket(varName, label);
 } else {
 removeFromBasket(varName);
 }
 refreshBasketCache();
 render();
 });
 });

 // -- Per-dataset "add all / remove all" ------------------------------
 td.querySelector(".add-all-variables-btn").addEventListener("click", () => {
 if (noResults) return; // nothing to add when the filter matched zero rows
 const varNames = vars.map((v) => v.variable_name).filter(Boolean);
 if (allInBasket) {
 batchRemoveFromBasket(varNames);
 } else {
 const items = vars
 .filter((v) => v.variable_name)
 .map((v) => ({ varName: v.variable_name, label: v.variable_label || "" }));
 batchAddToBasket(items);
 }
 refreshBasketCache();
 render();
 });

 const input = td.querySelector(".variable-search");
 input.addEventListener("input", (e) => {
 openVariableSearch[d.file_name] = e.target.value;
 render();
 const again = document.querySelector(
 '.dataset-row[data-key="' + cssEscape(d.file_name) + '"] + .variable-panel-row .variable-search'
 );
 if (again) {
 again.focus();
 again.setSelectionRange(again.value.length, again.value.length);
 }
 });

 td.querySelector(".var-download-btn").addEventListener("click", (e) => {
 e.preventDefault();
 downloadVariablesExcel(d);
 });

 return tr;
 }

 function topicPath(v) {
 return [v.topic, v.subtopic_1, v.subtopic_2, v.subtopic_3, v.subtopic_4].filter(Boolean).join(" > ");
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
 '<button ' + (currentPage <= 1 ? "disabled" : "") + ' id="prevPage">Prev</button>' +
 " Page " + currentPage + " of " + totalPages + " " +
 '<button ' + (currentPage >= totalPages ? "disabled" : "") + ' id="nextPage">Next</button>';
 el("paginationTop").innerHTML = html;
 el("paginationBottom").innerHTML = html;

 document.querySelectorAll("#prevPage").forEach((b) =>
 b.addEventListener("click", () => {
 currentPage = Math.max(1, currentPage - 1);
 render();
 })
 );
 document.querySelectorAll("#nextPage").forEach((b) =>
 b.addEventListener("click", () => {
 currentPage = Math.min(totalPages, currentPage + 1);
 render();
 })
 );
 }

 // -- Excel export (bold headers, fills, column widths - CSV can't do any
 // of that, so this uses ExcelJS, loaded via <script> on the page) -------
 const HEADER_FILL = "FF4B067A"; // matches the site's purple accent
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

 function downloadCatalogueExcel() {
 // Always the full catalogue, not just whatever's currently filtered/
 // searched/dataset-selected on screen - "download catalogue" means all of
 // it, regardless of what's being browsed at the moment.
 const workbook = new ExcelJS.Workbook();
 buildStyledWorksheet(
 workbook,
 "UKLLC Catalogue",
 [
 { header: "Dataset File Name", key: "file_name", width: 42 },
 { header: "Dataset Name", key: "doc_name", width: 30 },
 { header: "Dataset Description", key: "long_description", width: 60 },
 { header: "Variable Count", key: "variable_count", width: 14 },
 ],
 allDatasets.map((d) => ({
 file_name: d.file_name || "",
 doc_name: d.doc_name || "",
 long_description: d.long_description || "",
 variable_count: d.variable_count || 0,
 }))
 );
 triggerExcelDownload(workbook, "ukllc_catalogue.xlsx");
 }

 function downloadVariablesExcel(d) {
 const workbook = new ExcelJS.Workbook();
 buildStyledWorksheet(
 workbook,
 (d.doc_name || "Variables").slice(0, 31), // sheet names have a 31-char limit
 [
 { header: "Variable Name", key: "variable_name", width: 25 },
 { header: "Variable Label", key: "variable_label", width: 50 },
 { header: "Topic", key: "topic", width: 32 },
 { header: "Year of Collection", key: "year", width: 14 },
 ],
 (d.variables || []).map((v) => ({
 variable_name: v.variable_name || "",
 variable_label: v.variable_label || "",
 topic: topicPath(v),
 year: v.year_of_collection || "",
 }))
 );
 triggerExcelDownload(workbook, d.file_name.replace(/\.[^.]+$/, "") + "_variables.xlsx");
 }

 function escapeHtml(str) {
 return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
 }

 function escapeAttr(str) {
 return String(str).replace(/"/g, "&quot;");
 }

 function cssEscape(str) {
 return String(str).replace(/["\\]/g, "\\$&");
 }

 document.addEventListener("DOMContentLoaded", init);

 // -- Keep in sync with basket changes made elsewhere ---------------------
 window.addEventListener("nshd-basket-changed", () => {
 if (!allDatasets.length) return; // catalogue hasn't finished loading yet
 refreshBasketCache();
 render();
 });
})();