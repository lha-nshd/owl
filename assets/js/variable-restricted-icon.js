/*
 * OWL — Restricted variable lock icon
 * /OWL/assets/js/variable-restricted-icon.js
 *
 * Page-agnostic, drop-in script: adds a small lock icon next to every
 * variable-name link on ANY page — Search Data Dictionary, Browse by
 * Category, Popular Variables, Search by Year, Longitudinal Search,
 * Documentation pages, the Basket page, wherever. It needs zero changes
 * to any of those pages' own generators: it works purely by scanning the
 * page's already-rendered HTML for links matching the variable metadata
 * page's known URL pattern (/assets/variable_metadata/{name}, with or
 * without a trailing .html), then looking each one up in
 * restricted_variables.json.
 *
 * Include once, site-wide, via _includes/head_custom.html:
 *   <link rel="stylesheet" href="{{ '/assets/css/variable-restricted-icon.css' | relative_url }}">
 *   <script src="/OWL/assets/js/variable-restricted-icon.js"></script>
 *
 * Behaviour:
 *   - Hover the icon -> the variable's security/access message
 *   - No click action -> this is a status indicator, not a link to
 *     another page (unlike the doc icon, there's nowhere else to send
 *     the user; the message itself is the whole point)
 *   - UNLIKE variable-doc-icon.js, this DOES run inside .doc-var-table
 *     ("Variables in this document" tables) -> a document listing a
 *     restricted variable is exactly a place someone needs to know it's
 *     restricted, so that exclusion doesn't apply here
 *
 * Depends on restricted_variables.json existing at
 * assets/data/sensitive/restricted_variables.json (written by
 * build_restricted_lookup() in Website_dictionary_tables_gen.py). If
 * that file isn't there yet, or a given variable isn't in it, nothing
 * changes on the page at all — this never removes or alters anything
 * that was already there.
 */
(function () {
  var INDEX_URL = '/OWL/assets/data/sensitive/restricted_variables.json';
  var LINK_PATTERN = /\/assets\/variable_metadata\/([^/?#]+?)(?:\.html)?(?:[/?#]|$)/;

  function extractVarName(href) {
    var m = href.match(LINK_PATTERN);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function buildIcon(message) {
    var icon = document.createElement('span');
    icon.className = 'var-restricted-icon';
    icon.title = message;
    icon.innerHTML = '<i class="ti ti-lock" aria-hidden="true"></i>';
    return icon;
  }

  function decorate(index) {
    document.querySelectorAll('a[href*="/assets/variable_metadata/"]').forEach(function (link) {
      // A data attribute on the link itself, rather than checking
      // nextElementSibling's class (as variable-doc-icon.js does) —
      // this script and the doc-icon script both insert a sibling
      // immediately after the same link, so whichever one runs last on
      // a given pass would see the OTHER script's wrapper as
      // nextElementSibling and misjudge whether it had already run.
      // Marking the link itself sidesteps that entirely.
      if (link.dataset.restrictedIconAdded) return;

      var varName = extractVarName(link.getAttribute('href') || '');
      if (!varName) return;

      var message = index[varName];
      if (!message) return;

      var icon = buildIcon(message);
      icon.classList.add('var-restricted-icon-wrap');
      link.insertAdjacentElement('afterend', icon);
      link.dataset.restrictedIconAdded = 'true';
    });

    // Keep the legend in sync with whether a restricted icon is
    // CURRENTLY present anywhere on the page — not just whether one was
    // added in this pass. addedAny alone only ever causes the legend to
    // appear, never disappear: once the last restricted row on a page
    // is removed (e.g. removing the last restricted variable from a
    // basket, which re-renders that table without it), its link and
    // dataset flag vanish from the DOM entirely, so addedAny quietly
    // stays false on the next pass — but nothing was ever telling the
    // legend itself to go. Checking for a live .var-restricted-icon-wrap
    // instead removes it as soon as none remain.
    if (window.OWLIconKey) {
      window.OWLIconKey.update('restricted', !!document.querySelector('.var-restricted-icon-wrap'));
    }
  }

  function run() {
    fetch(INDEX_URL)
      .then(function (res) { return res.ok ? res.json() : {}; })
      .then(function (index) {
        // Several of the pages this needs to run on (Search Data
        // Dictionary, Search by Year, Popular Variables, Browse by
        // Category, Longitudinal Variables) build their results table
        // with their own JS *after* the page has already loaded — a
        // single scan on page load finds nothing on those pages and
        // never looks again.
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
        // Lookup not available yet, or a network hiccup — fail silently,
        // the page works exactly as it did before this existed.
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();