/*
 * OWL — Longitudinal variable link icon
 * /OWL/assets/js/variable-longitudinal-icon.js
 *
 * Page-agnostic, drop-in script (same approach as variable-restricted-icon.js):
 * adds a small pink link icon next to every variable-name link on ANY page
 * whose variable is part of a longitudinal group — i.e. the same measure
 * collected at several sweeps, sharing one Showcase Field ID. It works purely
 * by scanning the page's already-rendered HTML for links matching the variable
 * metadata page's URL pattern (/assets/variable_metadata/{name}, with or
 * without a trailing .html), then looking each one up in
 * longitudinal_variables.json.
 *
 * Include once, site-wide, via _includes/head_custom.html:
 *   <link rel="stylesheet" href="{{ '/assets/css/variable-longitudinal-icon.css' | relative_url }}">
 *   <script src="/OWL/assets/js/variable-longitudinal-icon.js"></script>
 *
 * Behaviour:
 *   - Hover the icon -> how many other variables are linked to this one
 *   - Click the icon -> opens the Longitudinal Variables page for that
 *     variable's Showcase Field ID, already expanded (?fid=...&open=true)
 *   - Runs inside .doc-var-table too, like the restricted icon
 *
 * Depends on longitudinal_variables.json at
 * assets/data/longitudinal/longitudinal_variables.json, written by
 * build_longitudinal_lookup() in Category_pages_generator.py, in the form
 *   { "<showcase field id>": ["var1", "var2", ...], ... }
 * (only IDs shared by more than one variable). If the file isn't there, or a
 * variable isn't in it, nothing changes on the page — this never removes or
 * alters anything that was already there.
 */
(function () {
  var INDEX_URL = '/OWL/assets/data/longitudinal/longitudinal_variables.json';
  var PAGE_URL  = '/OWL/docs/search_methods/longitudinal_variables/longitudinal-variables/';
  var LINK_PATTERN = /\/assets\/variable_metadata\/([^/?#]+?)(?:\.html)?(?:[/?#]|$)/;

  function extractVarName(href) {
    var m = href.match(LINK_PATTERN);
    return m ? decodeURIComponent(m[1]) : null;
  }

  // The JSON is { fid: [variables] }. Invert it once into
  // { variable: { fid, others } } so each link is an O(1) lookup.
  function buildVarIndex(groups) {
    var byVar = {};
    Object.keys(groups).forEach(function (fid) {
      var vars = groups[fid];
      if (!Array.isArray(vars) || vars.length < 2) return;
      vars.forEach(function (v) {
        if (!byVar[v]) byVar[v] = { fid: fid, others: vars.length - 1 };
      });
    });
    return byVar;
  }

  function buildIcon(info) {
    var msg = 'Longitudinal variable — linked to ' + info.others +
      ' other variable' + (info.others === 1 ? '' : 's') +
      '. Click to view them.';
    var icon = document.createElement('a');
    icon.className = 'var-longitudinal-icon var-longitudinal-icon-wrap';
    icon.href = PAGE_URL + '?fid=' + encodeURIComponent(info.fid) + '&open=true';
    icon.target = '_blank';
    icon.rel = 'noopener';
    icon.title = msg;
    icon.setAttribute('aria-label', msg);
    icon.innerHTML = '<i class="ti ti-link" aria-hidden="true"></i>';
    return icon;
  }

  function decorate(index) {
    document.querySelectorAll('a[href*="/assets/variable_metadata/"]').forEach(function (link) {
      // Flag on the link itself (not nextElementSibling), because the
      // restricted and doc icon scripts also insert siblings after the
      // same link — see variable-restricted-icon.js.
      if (link.dataset.longitudinalIconAdded) return;

      var varName = extractVarName(link.getAttribute('href') || '');
      if (!varName) return;

      var info = index[varName];
      if (!info) return;

      // Place after any icons already added by the other scripts, so the
      // order next to the name stays stable rather than depending on which
      // script happened to run first.
      var anchor = link;
      while (anchor.nextElementSibling &&
             /(^|\s)var-[a-z-]*icon[a-z-]*(\s|$)/.test(anchor.nextElementSibling.className)) {
        anchor = anchor.nextElementSibling;
      }
      anchor.insertAdjacentElement('afterend', buildIcon(info));
      link.dataset.longitudinalIconAdded = 'true';
    });

    // The shared icon key (variable-icon-key.js) shows/hides itself from this
    if (window.OWLIconKey) {
      window.OWLIconKey.update('longitudinal', !!document.querySelector('.var-longitudinal-icon-wrap'));
    }
  }

  function run() {
    // Every variable on the Longitudinal Variables page is already
    // longitudinal, so an icon (and legend) there would just be noise.
    // Matches the page with or without a trailing slash / .html, but not
    // the sibling longitudinal_search_guide page.
    if (window.location.pathname.indexOf(
          '/search_methods/longitudinal_variables/longitudinal-variables') !== -1) {
      return;
    }

    fetch(INDEX_URL)
      .then(function (res) { return res.ok ? res.json() : {}; })
      .then(function (groups) {
        var index = buildVarIndex(groups);

        // Many pages build their tables with their own JS after load, so
        // re-run decorate() whenever content is added (pagination, search,
        // re-renders). decorate() skips links it has already handled.
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
