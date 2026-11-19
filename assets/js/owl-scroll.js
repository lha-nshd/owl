/* ============================================================
   OWL — scroll-in animation
   assets/js/owl-scroll.js

   Pair file: assets/css/owl-scroll.css

   What it does
   - Blocks that start BELOW the visible screen fade and slide up
     as they scroll into view. Blocks already on screen are left
     alone, so nothing flashes on load.
   - Blocks that arrive later (content drawn by other scripts) are
     picked up automatically.
   - Does nothing when the visitor has reduced motion switched on.
   - Never hides anything permanently: each block gets its normal
     look back as soon as its fade has finished.

   To change which blocks animate, edit SELECTORS below.
   To switch it off, remove the two lines from head_custom.html.
   ============================================================ */
(function () {
  "use strict";

  if (!("IntersectionObserver" in window)) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  /* ---- Edit this list to choose what animates ------------------
     Keep it to whole blocks (sections, cards, tables, headings).
     Do not add table rows or list items: they would animate every
     time a table redraws. */
  var SELECTORS = [
    /* Ordinary Just the Docs pages written in markdown */
    ".main-content > h2",
    ".main-content > h3",
    ".main-content > table",
    ".main-content > pre",
    ".main-content > blockquote",
    ".main-content > .highlighter-rouge",
    ".main-content > .highlight",

    /* The common building block across the site: Home, Getting Started,
       Topics, Data sharing, Metrics and Trends, all questionnaire pages */
    ".home-section",
    ".callout-note",

    /* Home page */
    ".home-page > *",
    ".home-page .sec-row",

    /* Wrapper-level blocks on the other page types */
    ".page-topics > *",
    ".page-wrap > *",
    ".page-nshd-questionnaires > *",
    ".q-decade-block",
    ".gs-cards-grid > *",
    ".gs-category-band",
    ".rv-steps",

    /* Search Data Dictionary and Browse by Category (static parts) */
    ".page-search-data-dictionary .hero-banner",
    ".page-browse_by_category2 .hero-banner",
    ".cat-tree-card",
    ".cat-selected-card"
  ].join(",");

  var STAGGER_MS = 70;   /* delay between blocks that appear together */
  var MAX_STAGGER = 5;   /* never delay any block by more than 5 steps */

  var seen = typeof WeakSet === "function" ? new WeakSet() : null;
  function alreadySeen(el) {
    if (!seen) return el.__owlSeen === true;
    return seen.has(el);
  }
  function markSeen(el) {
    if (seen) seen.add(el); else el.__owlSeen = true;
  }

  /* Blocks waiting to be revealed. Used to show, instantly, anything the
     visitor has jumped past (End key, #anchor link, scrollbar drag) so
     nothing above them is left invisible. */
  var waiting = [];

  function reveal(el, animate) {
    var i = waiting.indexOf(el);
    if (i > -1) waiting.splice(i, 1);
    io.unobserve(el);
    if (!animate) { el.classList.remove("owl-reveal", "owl-in"); el.style.transitionDelay = ""; }
  }

  var io = new IntersectionObserver(function (entries) {
    var step = 0;
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var el = entry.target;
      reveal(el, true);
      el.style.transitionDelay = (Math.min(step, MAX_STAGGER) * STAGGER_MS) + "ms";
      step++;
      /* next frame, so the browser has the hidden state to animate from */
      requestAnimationFrame(function () { el.classList.add("owl-in"); });

      var done = function (ev) {
        if (ev && ev.target !== el) return;
        el.removeEventListener("transitionend", done);
        el.classList.remove("owl-reveal", "owl-in");
        el.style.transitionDelay = "";
      };
      el.addEventListener("transitionend", done);
      /* safety net in case transitionend never fires */
      setTimeout(done, 1500 + MAX_STAGGER * STAGGER_MS);
    });
  }, { rootMargin: "0px 0px -6% 0px", threshold: 0.04 });

  function prepare(el) {
    if (alreadySeen(el)) return;
    /* Hidden right now (collapsed section, inactive tab, display:none):
       leave it alone and do not remember it. Whatever shows it later
       gets its own treatment. */
    if (!el.offsetParent && getComputedStyle(el).position !== "fixed") return;
    markSeen(el);
    var top = el.getBoundingClientRect().top;
    if (top < window.innerHeight * 0.92) return;   /* on screen, or already scrolled past */
    el.classList.add("owl-reveal");
    waiting.push(el);
    io.observe(el);
  }

  var sweepTimer = null;
  function sweep() {
    for (var i = waiting.length - 1; i >= 0; i--) {
      if (waiting[i].getBoundingClientRect().bottom < 0) reveal(waiting[i], false);
    }
  }
  window.addEventListener("scroll", function () {
    clearTimeout(sweepTimer);
    sweepTimer = setTimeout(sweep, 120);
  }, { passive: true });

  function scan(root) {
    if (root.nodeType !== 1) return;
    if (root.matches(SELECTORS)) prepare(root);
    var found = root.querySelectorAll(SELECTORS);
    for (var i = 0; i < found.length; i++) prepare(found[i]);
  }

  /* A change that only adds/removes our own animation classes must not
     trigger another scan, or the observer would feed itself. */
  function withoutOwl(v) {
    return (v || "").replace(/\bowl-(?:reveal|in)\b/g, "").replace(/\s+/g, " ").trim();
  }

  var scanTimer = null;
  function scanSoon() {
    if (scanTimer) return;
    scanTimer = setTimeout(function () { scanTimer = null; scan(document.body); }, 120);
  }

  function start() {
    scan(document.body);

    /* Pages like Metrics and Trends keep their sections display:none until
       the data has loaded, then reveal them with a class change. So watch
       for new content AND for class / style / hidden changes, and look
       over the whole page again a moment later. */
    new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var r = records[i];
        if (r.type === "attributes") {
          if (r.attributeName === "class" &&
              withoutOwl(r.oldValue) === withoutOwl(r.target.getAttribute("class"))) continue;
          scanSoon();
          return;
        }
        if (r.addedNodes.length) { scanSoon(); return; }
      }
    }).observe(document.body, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ["class", "style", "hidden", "open"],
      attributeOldValue: true
    });

    /* Backstop for slow pages */
    window.addEventListener("load", function () {
      setTimeout(scanSoon, 300);
      setTimeout(scanSoon, 1500);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
