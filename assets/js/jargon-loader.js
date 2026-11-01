/**
 * jargon-loader.js
 * ================
 * Fetches /assets/data/jargon-terms.json ONCE and exposes it to every
 * other script on the page. This replaces the old hardcoded
 * jargon-terms.js — the term list now lives entirely in the JSON file,
 * which both the glossary page (getting-started.js) and the sitewide
 * auto-linker (jargon-linker.js) consume.
 *
 * Load this FIRST, before jargon-linker.js and before getting-started.js:
 *
 *   <script src="{{ site.baseurl }}/assets/js/jargon-loader.js"></script>
 *   <script src="{{ site.baseurl }}/assets/js/jargon-linker.js"></script>
 *
 * Usage from any other script:
 *
 *   window.NSHD_JARGON_READY.then(terms => {
 *     // terms is the array from jargon-terms.json, each entry with
 *     // an added `slug` field (e.g. "Field ID" -> "field-id")
 *   });
 *
 * window.NSHD_JARGON_TERMS is also set once loading completes, for
 * code that runs later and doesn't need to await the promise.
 */

(function () {

  const SITE_BASEURL     = "/OWL";
  const JARGON_JSON_URL  = `${SITE_BASEURL}/assets/data/cohort_jargon/jargon-terms.json`;

  function slugify(str) {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  window.NSHD_JARGON_READY = fetch(JARGON_JSON_URL)
    .then(r => {
      if (!r.ok) throw new Error(`jargon-terms.json fetch failed: ${r.status}`);
      return r.json();
    })
    .then(terms => {
      terms.forEach(t => { t.slug = slugify(t.term); });
      window.NSHD_JARGON_TERMS = terms;
      return terms;
    })
    .catch(err => {
      console.error("Failed to load jargon-terms.json:", err);
      window.NSHD_JARGON_TERMS = [];
      return [];
    });

})();