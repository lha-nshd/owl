/*
 * OWL — Variable documentation icon
 * /OWL/assets/js/variable-doc-icon.js
 *
 * Page-agnostic, drop-in script: adds a small circular "view
 * documentation" icon next to every variable-name link on ANY page —
 * Search Data Dictionary, Browse by Category, Popular Variables, Search
 * by Year, Longitudinal Search, the Basket page, wherever. It needs zero
 * changes to any of those pages' own generators: it works purely by
 * scanning the page's already-rendered HTML for links matching the
 * variable metadata page's known URL pattern
 * (/assets/variable_metadata/{name}, with or without a trailing .html —
 * those pages already uses to make a variable name clickable), then
 * looking each one up in variable_documents_index.json.
 *
 * Include once, site-wide, via _includes/head_custom.html:
 *   <link rel="stylesheet" href="{{ '/assets/css/variable-doc-icon.css' | relative_url }}">
 *   <script src="/OWL/assets/js/variable-doc-icon.js"></script>
 *
 * Behaviour:
 *   - Hover the icon           -> "View documentation"
 *   - Click, one document      -> goes straight to that document's page
 *   - Click, more than one     -> opens a small dropdown listing each
 *                                 document by title; pick one to go there
 *   - Never added inside .doc-var-table -> a document's own "Variables in
 *     this document" table already IS that documentation, so there's
 *     nothing useful to link to from there
 *
 * Depends on variable_documents_index.json existing at
 * assets/data/variable_documents_index.json (written by build_pages.py).
 * If that file isn't there yet, or a given variable has no
 * documentation, nothing changes on the page at all — this never removes
 * or alters anything that was already there.
 */
(function () {
  var INDEX_URL = '/OWL/assets/data/variable_documents_index.json';
  var LINK_PATTERN = /\/assets\/variable_metadata\/([^/?#]+?)(?:\.html)?(?:[/?#]|$)/;

  function extractVarName(href) {
    var m = href.match(LINK_PATTERN);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function closeAllDropdowns(except) {
    document.querySelectorAll('.var-doc-dropdown.open').forEach(function (d) {
      if (d !== except) d.classList.remove('open');
    });
  }

  function buildIcon(entries) {
    var wrap = document.createElement('span');
    wrap.style.position = 'relative';
    wrap.style.display = 'inline-block';

    var icon = document.createElement('a');
    icon.className = 'var-doc-icon';
    icon.title = 'View documentation';
    icon.innerHTML = '<i class="ti ti-info-circle" aria-hidden="true"></i>';

    if (entries.length === 1) {
      icon.href = entries[0].permalink;
      wrap.appendChild(icon);
      return wrap;
    }

    // More than one document: intercept the click and show a small
    // dropdown instead of picking one arbitrarily.
    icon.href = '#';
    var dropdown = document.createElement('div');
    dropdown.className = 'var-doc-dropdown';
    entries.forEach(function (e) {
      var item = document.createElement('a');
      item.className = 'var-doc-dropdown-item';
      item.href = e.permalink;
      item.innerHTML = '<span class="dt">' + escapeHtml(e.doc_type.replace(/_/g, ' ')) + '</span><br>' +
        escapeHtml(e.title);
      dropdown.appendChild(item);
    });

    icon.addEventListener('click', function (evt) {
      evt.preventDefault();
      evt.stopPropagation();
      var isOpen = dropdown.classList.contains('open');
      closeAllDropdowns();
      if (!isOpen) dropdown.classList.add('open');
    });

    wrap.appendChild(icon);
    wrap.appendChild(dropdown);
    return wrap;
  }

  function decorate(index) {
    var handled = new WeakSet();
    document.querySelectorAll('a[href*="/assets/variable_metadata/"]').forEach(function (link) {
      if (handled.has(link)) return;
      handled.add(link);

      // A document's own "Variables in this document" table already IS
      // that document — nothing to link to from inside it.
      if (link.closest('.doc-var-table')) return;

      // Don't double up if this ever runs twice on the same page.
      if (link.nextElementSibling && link.nextElementSibling.classList &&
          link.nextElementSibling.classList.contains('var-doc-icon-wrap')) {
        return;
      }

      var varName = extractVarName(link.getAttribute('href') || '');
      if (!varName) return;

      var entries = index[varName];
      if (!entries || !entries.length) return;

      var wrap = buildIcon(entries);
      wrap.classList.add('var-doc-icon-wrap');
      link.insertAdjacentElement('afterend', wrap);
    });

    // The shared icon key (variable-icon-key.js) shows/hides itself from this.
    // Checks for icons CURRENTLY on the page, so it also disappears when the
    // last one is removed (e.g. emptying a basket).
    if (window.OWLIconKey) {
      window.OWLIconKey.update('doc', !!document.querySelector('.var-doc-icon-wrap'));
    }
  }

  document.addEventListener('click', function () { closeAllDropdowns(); });

  function run() {
    fetch(INDEX_URL)
      .then(function (res) { return res.ok ? res.json() : {}; })
      .then(function (index) {
        // Several of the pages this needs to run on (Search Data
        // Dictionary, Search by Year, Popular Variables, Browse by
        // Category, Longitudinal Variables) show a loading spinner and
        // build their results table with their own JS *after* the page
        // has already loaded — the table is still empty at the moment
        // this script's first pass would run. A single scan on page
        // load finds nothing on those pages and never looks again.
        //
        // A MutationObserver re-runs decorate() every time new content
        // is added anywhere on the page — including every later page of
        // results after clicking pagination — so newly-rendered rows get
        // picked up regardless of when or how many times a page
        // re-renders its table. decorate() is safe to call repeatedly:
        // it already skips any link that's already been given an icon.
        decorate(index);

        var debounceTimer = null;
        var observer = new MutationObserver(function () {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(function () { decorate(index); }, 150);
        });
        observer.observe(document.body, { childList: true, subtree: true });
      })
      .catch(function () {
        // Index not available yet, or a network hiccup — fail silently,
        // the page works exactly as it did before this existed.
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();