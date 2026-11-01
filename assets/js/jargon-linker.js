/**
 * jargon-linker.js
 * ================
 * Sitewide auto-linker for cohort study jargon.
 *
 * Scans the rendered page text for every term loaded via
 * window.NSHD_JARGON_READY (see jargon-loader.js, which must load
 * first and fetches /assets/data/jargon-terms.json) and wraps EVERY
 * occurrence in a styled link that:
 *   - shows a hover/focus tooltip with the definition, and
 *   - navigates to that term's anchor on the Cohort Study Jargon page
 *     on click.
 *
 * Include this on every page via the shared footer, AFTER
 * jargon-loader.js and AFTER basket_header.js (order relative to
 * basket scripts doesn't matter, just needs jargon-loader.js first):
 *
 *   <script src="{{ site.baseurl }}/assets/js/jargon-loader.js"></script>
 *   <script src="{{ site.baseurl }}/assets/js/jargon-linker.js"></script>
 *
 * The glossary page itself (Cohort Study Jargon) is intentionally
 * skipped — see SKIP_PATH_MATCH below — so its own entries don't get
 * turned into self-referential links.
 */

(function () {

  const SITE_BASEURL     = "/OWL";
  const GLOSSARY_PATH    = `${SITE_BASEURL}/docs/getting-started/cohort-jargon/`;
  const SKIP_PATH_MATCH  = "cohort-jargon"; // don't run on the glossary page itself

  // Elements (and their descendants) that should never be scanned/linked
  const SKIP_SELECTORS = [
    "script", "style", "noscript", "code", "pre", "svg",
    "a", "button", "input", "textarea", "select",
    "header", "footer", "nav",
    ".site-nav", ".site-header", ".sidebar-summary",
    ".breadcrumb", "#loadingScreen",
    ".jargon-term", ".jargon-tooltip"
  ].join(",");

  function init(terms) {
    if (window.location.pathname.includes(SKIP_PATH_MATCH)) return;
    if (!terms || !terms.length) return;

    // Longest term first, so "Birth cohort study" matches before the
    // shorter "Cohort" contained inside it at the same text position.
    const sortedTerms = [...terms].sort((a, b) => b.term.length - a.term.length);

    function escapeRegex(s) {
      return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    // Word-boundary-safe, case-insensitive, single alternation covering
    // every term. Lookarounds instead of \b so multi-word terms with
    // spaces/slashes still get proper boundary checks either side.
    const pattern = sortedTerms.map(t => escapeRegex(t.term)).join("|");
    const termRegex = new RegExp(`(?<![A-Za-z0-9])(${pattern})(?![A-Za-z0-9])`, "gi");

    const termLookup = new Map(terms.map(t => [t.term.toLowerCase(), t]));

    // Slugs already linked on this page load. Persists across multiple
    // run() calls (e.g. if a late-rendering page calls
    // window.runJargonLinker() again), so a term is only ever highlighted
    // once per page, not once per run.
    const linkedTerms = new Set();

    // ── Tooltip (single shared element, reused for every hover) ─────────
    const tooltip = document.createElement("div");
    tooltip.className = "jargon-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.style.display = "none";
    document.body.appendChild(tooltip);

    let hideTimer = null;

    function showTooltip(anchor, def) {
      clearTimeout(hideTimer);
      tooltip.textContent = def;
      tooltip.style.display = "block";

      const rect = anchor.getBoundingClientRect();
      const tipRect = tooltip.getBoundingClientRect();
      let left = rect.left + rect.width / 2 - tipRect.width / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
      let top = rect.top - tipRect.height - 8;
      let placement = "top";
      if (top < 8) {
        top = rect.bottom + 8;
        placement = "bottom";
      }

      tooltip.style.left = `${left + window.scrollX}px`;
      tooltip.style.top  = `${top + window.scrollY}px`;
      tooltip.dataset.placement = placement;
    }

    function hideTooltip(immediate) {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => { tooltip.style.display = "none"; }, immediate ? 0 : 80);
    }

    // ── Collect candidate text nodes ─────────────────────────────────────
    function collectTextNodes(root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (parent.closest(SKIP_SELECTORS)) return NodeFilter.FILTER_REJECT;
          if (parent.isContentEditable) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      const nodes = [];
      let n;
      while ((n = walker.nextNode())) nodes.push(n);
      return nodes;
    }

    // ── Wrap every match in a text node with a linked, tooltipped span ──
    function linkifyTextNode(textNode) {
      const text = textNode.nodeValue;
      termRegex.lastIndex = 0;

      let match;
      let lastIndex = 0;
      const frag = document.createDocumentFragment();
      let matchedAny = false;

      while ((match = termRegex.exec(text)) !== null) {
        const matchedText = match[0];
        const start = match.index;
        const termData = termLookup.get(matchedText.toLowerCase());

        // Already linked once elsewhere on this page — leave this
        // occurrence as plain text instead of linking it again.
        if (linkedTerms.has(termData.slug)) continue;

        matchedAny = true;

        if (start > lastIndex) {
          frag.appendChild(document.createTextNode(text.slice(lastIndex, start)));
        }

        linkedTerms.add(termData.slug);

        const a = document.createElement("a");
        a.className = "jargon-term";
        a.href = `${GLOSSARY_PATH}#jargon-${termData.slug}`;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = matchedText;
        a.setAttribute("aria-describedby", "jargon-tooltip-live");

        a.addEventListener("mouseenter", () => showTooltip(a, termData.def));
        a.addEventListener("mouseleave", () => hideTooltip(false));
        a.addEventListener("focus", () => showTooltip(a, termData.def));
        a.addEventListener("blur", () => hideTooltip(true));

        frag.appendChild(a);
        lastIndex = start + matchedText.length;
      }

      if (!matchedAny) return;

      if (lastIndex < text.length) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex)));
      }

      textNode.parentNode.replaceChild(frag, textNode);
    }

    function run() {
      const contentRoot = document.querySelector("main") || document.body;
      // Work out which terms are STILL linked in the page right now. Pages that
      // redraw parts of themselves (filters, charts) throw their old links
      // away, and those terms must be allowed to link again on the next run.
      linkedTerms.clear();
      contentRoot.querySelectorAll("a.jargon-term").forEach(a => {
        const h = a.getAttribute("href") || "";
        const i = h.indexOf("#jargon-");
        if (i !== -1) linkedTerms.add(h.slice(i + 8));
      });
      // Snapshot text nodes BEFORE mutating the DOM — TreeWalker results
      // would otherwise go stale mid-loop as nodes get replaced.
      const nodes = collectTextNodes(contentRoot);
      nodes.forEach(linkifyTextNode);
    }

    // Run after the page's own data-driven content has rendered (tables
    // built from fetched JSON, etc.) rather than racing it. A short delay
    // covers most fetch-based pages; pages that render later can call
    // window.runJargonLinker() again manually after their own render.
    window.runJargonLinker = run;
    setTimeout(run, 300);
  }

  function start() {
    if (!window.NSHD_JARGON_READY) {
      console.error("jargon-linker.js: NSHD_JARGON_READY is missing — make sure jargon-loader.js is loaded first.");
      return;
    }
    window.NSHD_JARGON_READY.then(terms => {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => init(terms));
      } else {
        init(terms);
      }
    });
  }

  start();

})();