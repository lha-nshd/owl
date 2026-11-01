(function () {
  'use strict';

  var DOC_TYPE_META = {
    topsheet: { label: 'Topsheet', icon: 'ti-table' },
    variable_note: { label: 'Variable note', icon: 'ti-file-text' },
    templated_variable_note: { label: 'Multi-sweep', icon: 'ti-repeat' },
    narrative: { label: 'Narrative', icon: 'ti-align-left' },
  };

  // Order controls the type filter dropdown's fixed leading options —
  // any doc_type not listed here (e.g. a custom value straight from the
  // documents index spreadsheet, like "full_documentation") gets its own
  // humanized label and its own filter option instead, appended after
  // these four, rather than being grouped into one generic "Other"
  // bucket. Each one is still just as filterable and just as visible as
  // the four structurally auto-detected types — it just isn't hand-
  // curated with a custom short label the way these four are.
  var DOC_TYPE_ORDER = ['topsheet', 'variable_note', 'templated_variable_note', 'narrative'];

  function humanizeType(type) {
    if (!type) return 'Unspecified';
    return type.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  // Works out the site's base path ('/OWL' on GitHub project pages)
  // without depending on some other script having already set
  // window.SITE_BASEURL. If that global happens to be set (e.g. by a
  // layout include) it's still honored first, but this script no
  // longer breaks if that include is missing, renamed, or reordered —
  // it derives the same value itself from its own <script src="...">,
  // which Jekyll's relative_url filter already prefixes correctly.
  function resolveBaseUrl() {
    if (typeof window.SITE_BASEURL === 'string' && window.SITE_BASEURL) {
      return window.SITE_BASEURL;
    }
    var scriptEl = document.currentScript;
    if (!scriptEl) {
      // Fallback for older browsers / async contexts where
      // document.currentScript isn't available: find our own <script>
      // tag by matching its filename.
      var scripts = document.getElementsByTagName('script');
      for (var i = scripts.length - 1; i >= 0; i--) {
        if (/search-documentation\.js/.test(scripts[i].src)) { scriptEl = scripts[i]; break; }
      }
    }
    if (scriptEl && scriptEl.src) {
      var marker = '/assets/js/search-documentation.js';
      var idx = scriptEl.src.indexOf(marker);
      if (idx !== -1) {
        // Strip protocol+host, keep only the path prefix before our
        // own filename — that prefix IS the site baseurl.
        return scriptEl.src.slice(0, idx).replace(/^https?:\/\/[^/]+/, '');
      }
    }
    return '';
  }

  var input = document.getElementById('docSearchInput');
  var typeFilter = document.getElementById('docTypeFilter');
  var pageSizeSelect = document.getElementById('docPageSize');
  var resultsEl = document.getElementById('docSearchResults');
  var countEl = document.getElementById('docSearchCount');
  var paginationTopEl = document.getElementById('docPaginationTop');
  var paginationEl = document.getElementById('docPagination');
  var emptyEl = document.getElementById('docSearchEmpty');
  var errorEl = document.getElementById('docSearchError');
  var sortableHeaders = document.querySelectorAll('.doc-th-sortable');

  // Nothing to do on any page that doesn't actually have the search
  // widget on it — without this guard, addEventListener calls further
  // down throw on null and take the rest of the page's scripts with
  // them. pageSizeSelect is intentionally NOT required here: it's a
  // secondary control (page-size dropdown), and its absence shouldn't
  // block search/results from working at all — getPageSize() below
  // falls back to "show all" when it's missing.
  if (!input || !typeFilter || !resultsEl) {
    return;
  }

  var allDocs = [];
  var sortState = { column: 'title', direction: 'asc' };
  var currentPage = 1;
  // Which documents currently have their category list expanded — a Set
  // of doc_id, kept outside render() so re-opening a <details> element
  // survives a re-render triggered by typing in the search box, changing
  // the type filter, or clicking a column header.
  var expandedIds = new Set();

  function esc(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function typeMeta(docType) {
    return DOC_TYPE_META[docType] || { label: humanizeType(docType), icon: 'ti-file-description' };
  }

  // One lowercased search blob per document, built once at load time
  // rather than re-concatenated on every keystroke — with a few hundred
  // documents this is the difference between a snappy filter and a
  // noticeable stutter as someone types.
  function buildHaystack(doc) {
    var parts = [
      doc.title, doc.topic, (doc.topics || []).join(' '), doc.categories,
      doc.summary_of_work, doc.papers_used, doc.source_variable_names,
      doc.output_variables, (doc.variable_names || []).join(' '),
      (doc.variable_labels || []).join(' '),
    ];
    return parts.filter(Boolean).join(' \u2022 ').toLowerCase();
  }

  // All three tiers, not just the highest — a document with 6 high and
  // 2 medium should show both, not silently drop the medium count just
  // because a higher tier exists.
  function confidenceBadgesHtml(doc) {
    var tiers = [['high', doc.high], ['medium', doc.medium], ['low', doc.low]];
    var badges = tiers
      .filter(function (t) { return t[1] > 0; })
      .map(function (t) { return '<span class="doc-count-badge doc-count-' + t[0] + '">' + t[1] + ' ' + t[0] + '</span>'; });
    return badges.length ? badges.join('') : '<span class="doc-count-empty">No variables detected</span>';
  }

  // A single numeric score so 'sort by variables found' has one
  // consistent ordering across tiers — a document with any high-
  // confidence matches always ranks above one with only medium or low,
  // and ties within a tier break by count.
  function confidenceScore(doc) {
    return (doc.high || 0) * 1e6 + (doc.medium || 0) * 1e3 + (doc.low || 0);
  }

  function docTopics(doc) {
    return doc.topics && doc.topics.length ? doc.topics : (doc.topic ? [doc.topic] : []);
  }

  // Category pages live at a predictable path derived from a topic
  // breadcrumb's last segment, e.g. the leaf
  // "Cross-sectional beta-amyloid status (phase 1) [603411]" maps to
  // .../cat_pages/Cross-sectional_beta-amyloid_status_(phase_1)_603411.html
  // — spaces become underscores and the trailing "[ID]" becomes a
  // trailing "_ID" on the filename. Topics that don't end in a
  // "[digits]" tag (malformed data, or a future format change) return
  // null so the chip just renders as plain text instead of a broken
  // link.
  var CATEGORY_PAGE_PATH = '/docs/search_methods/browse_by_category/cat_pages/';

  function categoryPageUrl(topic) {
    if (!topic) return null;
    var segments = topic.split('>');
    var leaf = segments[segments.length - 1].trim();
    var m = /^(.*?)\s*\[(\d+)\]\s*$/.exec(leaf);
    if (!m) return null;
    var slug = m[1].trim().replace(/\s+/g, '_') + '_' + m[2];
    return resolveBaseUrl() + CATEGORY_PAGE_PATH + slug + '.html';
  }

  function renderRow(doc, rowIndex) {
    var meta = typeMeta(doc.doc_type);
    var topics = docTopics(doc);

    var categoriesHtml;
    if (!topics.length) {
      categoriesHtml = '';
    } else {
      var isOpen = expandedIds.has(doc.doc_id);
      var label = topics.length === 1 ? '1 category' : topics.length + ' categories';
      categoriesHtml =
        '<details class="doc-category-details"' + (isOpen ? ' open' : '') + '>' +
        '<summary><i class="ti ti-chevron-right" aria-hidden="true"></i>' + label + '</summary>' +
        '<div class="doc-result-categories">' +
        topics.map(function (t) {
          var url = categoryPageUrl(t);
          if (url) {
            return '<a class="doc-category-chip" href="' + esc(url) + '">' + esc(t) + '</a>';
          }
          return '<span class="doc-category-chip">' + esc(t) + '</span>';
        }).join('') +
        '</div></details>';
    }

    var tr = document.createElement('tr');
    tr.className = 'doc-result-row';
    tr.innerHTML =
      '<td><i class="ti ' + meta.icon + ' doc-result-icon" aria-hidden="true"></i>' +
      '<span class="doc-result-title">' + esc(doc.title) + '</span>' + categoriesHtml + '</td>' +
      '<td><div class="doc-conf-cell">' + confidenceBadgesHtml(doc) + '</div></td>' +
      '<td><div class="doc-type-cell"><span class="doc-result-type doc-type-' + esc(doc.doc_type) + '">' + esc(meta.label) + '</span>' +
      '<span class="doc-row-view-cue">View <i class="ti ti-chevron-right" aria-hidden="true"></i></span></div></td>';

    tr.addEventListener('click', function (e) {
      // Clicking the categories disclosure (or a chip inside it once
      // open) should expand/collapse it, never navigate away.
      if (e.target.closest('details')) return;
      window.location.href = doc.permalink;
    });

    var details = tr.querySelector('.doc-category-details');
    if (details) {
      details.addEventListener('toggle', function () {
        if (details.open) expandedIds.add(doc.doc_id);
        else expandedIds.delete(doc.doc_id);
      });
    }

    return tr;
  }

  function populateTypeFilter(docs) {
    var present = {};
    docs.forEach(function (d) { present[d.doc_type] = true; });

    var knownTypes = DOC_TYPE_ORDER.filter(function (t) { return present[t]; });
    var customTypes = Object.keys(present)
      .filter(function (t) { return DOC_TYPE_ORDER.indexOf(t) === -1; })
      .sort(function (a, b) { return humanizeType(a).localeCompare(humanizeType(b)); });

    knownTypes.concat(customTypes).forEach(function (t) {
      var opt = document.createElement('option');
      opt.value = t;
      opt.textContent = typeMeta(t).label;
      typeFilter.appendChild(opt);
    });
  }

  function matchesType(doc, filterValue) {
    if (!filterValue) return true;
    return doc.doc_type === filterValue;
  }

  var SORT_KEYS = {
    title: function (doc) { return (doc.title || '').toLowerCase(); },
    confidence: function (doc) { return confidenceScore(doc); },
    type: function (doc) { return typeMeta(doc.doc_type).label.toLowerCase(); },
  };

  function applySort(docs) {
    if (!sortState.column) return docs;
    var keyFn = SORT_KEYS[sortState.column];
    var dir = sortState.direction === 'asc' ? 1 : -1;
    return docs.slice().sort(function (a, b) {
      var ka = keyFn(a), kb = keyFn(b);
      if (ka < kb) return -1 * dir;
      if (ka > kb) return 1 * dir;
      return 0;
    });
  }

  function updateSortHeaderUI() {
    sortableHeaders.forEach(function (th) {
      var col = th.getAttribute('data-sort');
      var icon = th.querySelector('.doc-sort-icon');
      var active = col === sortState.column;
      th.classList.toggle('doc-sort-active', active);
      icon.className = 'ti doc-sort-icon ' + (
        !active ? 'ti-selector' : sortState.direction === 'asc' ? 'ti-sort-ascending' : 'ti-sort-descending'
      );
    });
  }

  function getPageSize() {
    // pageSizeSelect may be null if that control isn't present in the
    // page's HTML — default to showing everything on one page rather
    // than throwing or silently rendering zero results.
    if (!pageSizeSelect) return Infinity;
    var v = pageSizeSelect.value;
    return v === 'all' ? Infinity : parseInt(v, 10);
  }

  function buildPaginationControl(pageNum, totalPages) {
    var wrap = document.createDocumentFragment();

    var prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'doc-page-btn';
    prevBtn.textContent = 'Prev';
    prevBtn.disabled = pageNum <= 1;
    prevBtn.addEventListener('click', function () {
      currentPage = Math.max(1, currentPage - 1);
      render();
    });

    var label = document.createElement('span');
    label.textContent = 'Page ' + pageNum + ' of ' + totalPages;

    var nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'doc-page-btn';
    nextBtn.textContent = 'Next';
    nextBtn.disabled = pageNum >= totalPages;
    nextBtn.addEventListener('click', function () {
      currentPage = Math.min(totalPages, currentPage + 1);
      render();
    });

    wrap.appendChild(prevBtn);
    wrap.appendChild(label);
    wrap.appendChild(nextBtn);
    return wrap;
  }

  // Rendered above AND below the table, since a long results table
  // benefits from page controls at the top (no scrolling down just to
  // move to the next page) as well as the bottom. Each copy needs its
  // own button elements — a DOM node can only exist in one place at a
  // time — but they share the same currentPage/render() so clicking
  // either one keeps both in sync on the next render.
  function renderPagination(totalItems, pageSize) {
    // Both containers are optional — some pages that use this widget
    // don't include pagination controls in their markup at all.
    if (!paginationTopEl && !paginationEl) return;
    if (paginationTopEl) paginationTopEl.innerHTML = '';
    if (paginationEl) paginationEl.innerHTML = '';
    if (pageSize === Infinity || totalItems <= pageSize) return;

    var totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    if (paginationTopEl) paginationTopEl.appendChild(buildPaginationControl(currentPage, totalPages));
    if (paginationEl) paginationEl.appendChild(buildPaginationControl(currentPage, totalPages));
  }

  function resetToFirstPage() {
    currentPage = 1;
    render();
  }

  function render() {
    var query = input.value.trim().toLowerCase();
    var typeValue = typeFilter.value;

    var matches = allDocs.filter(function (doc) {
      if (!matchesType(doc, typeValue)) return false;
      if (!query) return true;
      return doc._haystack.indexOf(query) !== -1;
    });
    matches = applySort(matches);

    var pageSize = getPageSize();
    var totalPages = pageSize === Infinity ? 1 : Math.max(1, Math.ceil(matches.length / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    var startIdx = pageSize === Infinity ? 0 : (currentPage - 1) * pageSize;
    var pageItems = pageSize === Infinity ? matches : matches.slice(startIdx, startIdx + pageSize);

    resultsEl.innerHTML = '';
    var frag = document.createDocumentFragment();
    pageItems.forEach(function (doc, i) { frag.appendChild(renderRow(doc, i)); });
    resultsEl.appendChild(frag);

    countEl.textContent = 'Showing ' + matches.length + ' of ' + allDocs.length + ' documents';
    emptyEl.style.display = matches.length === 0 ? '' : 'none';
    updateSortHeaderUI();
    renderPagination(matches.length, pageSize);
  }

  fetch(resolveBaseUrl() + '/assets/data/search_index.json')
    .then(function (res) {
      if (!res.ok) throw new Error('search_index.json request failed: ' + res.status);
      return res.json();
    })
    .then(function (docs) {
      allDocs = docs.map(function (d) {
        d._haystack = buildHaystack(d);
        return d;
      });
      populateTypeFilter(allDocs);
      render();
    })
    .catch(function (err) {
      errorEl.style.display = '';
      console.error('Failed to load documentation search index:', err);
    });

  input.addEventListener('input', resetToFirstPage);
  typeFilter.addEventListener('change', resetToFirstPage);
  if (pageSizeSelect) {
    pageSizeSelect.addEventListener('change', resetToFirstPage);
  }
  sortableHeaders.forEach(function (th) {
    th.addEventListener('click', function () {
      var col = th.getAttribute('data-sort');
      if (sortState.column === col) {
        sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
      } else {
        sortState.column = col;
        sortState.direction = 'asc';
      }
      resetToFirstPage();
    });
  });
})();