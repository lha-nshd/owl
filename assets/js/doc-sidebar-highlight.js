/*
 * OWL — Sidebar summary section-colour highlighting
 * /OWL/assets/js/doc-sidebar-highlight.js
 *
 * Generic, page-agnostic script: colours each "On this page" sidebar
 * link to match its target section's own colour, and highlights
 * whichever section is currently scrolled into view.
 *
 * Unlike the hub pages (Getting Started, Search Overview, etc.), where
 * each sidebar link's colour is a hand-written CSS rule tied to that
 * page's own fixed, small set of section names, a generated
 * documentation page has no fixed set of section names at all — there
 * could be hundreds of these pages, each with completely different,
 * dynamically-titled sections. Hand-writing a colour rule per section
 * name isn't just more work here, it isn't really possible to maintain.
 *
 * Instead, this reads something that already exists on every one of
 * these pages regardless of what its sections are actually called: each
 * <div class="home-section"> already carries one of six gs-card-*
 * classes (search/explore/sidebar/basket/blue/lavender), cycling
 * automatically per section — visible today as that section's card
 * background colour. This script just looks up the matching sidebar
 * link for each section, reads which gs-card-* class that section has,
 * and applies the same colour family to the link — entirely generically,
 * with no per-document or per-section data needed anywhere.
 *
 * Include once, site-wide, via _includes/head_custom.html:
 *   <link rel="stylesheet" href="{{ '/assets/css/doc-sidebar-highlight.css' | relative_url }}">
 *   <script src="/OWL/assets/js/doc-sidebar-highlight.js"></script>
 *
 * No-ops harmlessly on any page without a .sidebar-summary or matching
 * .home-section elements.
 */
(function () {
  // Same six colours as getting-started.css's own gs-card-* rules,
  // darkened for text and lightened for the active-state background —
  // matching the exact convention already used throughout the site's
  // hand-written per-section sidebar colours (e.g. .so-toc-which,
  // .gs-toc-search), just derived generically here instead of hardcoded
  // per page.
  var COLOR_MAP = {
    'gs-card-search':   { text: 'hsl(180 45% 20%)', bg: 'hsl(180 45% 94%)', border: 'hsl(180 45% 45%)' },
    'gs-card-explore':  { text: 'hsl(35 60% 25%)',  bg: 'hsl(35 60% 94%)',  border: 'hsl(35 60% 45%)'  },
    'gs-card-sidebar':  { text: 'hsl(340 45% 28%)', bg: 'hsl(340 45% 95%)', border: 'hsl(340 45% 50%)' },
    'gs-card-basket':   { text: 'hsl(125 35% 20%)', bg: 'hsl(125 35% 93%)', border: 'hsl(125 35% 45%)' },
    'gs-card-blue':     { text: 'hsl(210 45% 22%)', bg: 'hsl(210 45% 94%)', border: 'hsl(210 45% 45%)' },
    'gs-card-lavender': { text: 'hsl(270 35% 25%)', bg: 'hsl(270 35% 95%)', border: 'hsl(270 35% 50%)' },
  };
  var COLOR_CLASSES = Object.keys(COLOR_MAP);

  function colorSidebarLinks() {
    var links = document.querySelectorAll('.page-topics .sidebar-summary a[href^="#"]');
    var pairs = [];
    links.forEach(function (link) {
      var id = decodeURIComponent(link.getAttribute('href').slice(1));
      var section = document.getElementById(id);
      if (!section) return;

      var colorClass = COLOR_CLASSES.filter(function (c) { return section.classList.contains(c); })[0];
      if (!colorClass) return;

      var colors = COLOR_MAP[colorClass];
      link.style.setProperty('--doc-section-color', colors.text);
      link.style.setProperty('--doc-section-bg-active', colors.bg);
      link.style.setProperty('--doc-section-border-active', colors.border);
      pairs.push({ link: link, section: section });
    });
    return pairs;
  }

  function setupScrollTracking(pairs) {
    if (!pairs.length) return;

    // The active section is whichever one's top has most recently
    // scrolled past a fixed reference line near the top of the
    // viewport — recomputed directly from getBoundingClientRect() on
    // every scroll frame, not via IntersectionObserver. IntersectionObserver
    // was tried first, using a thin rootMargin trigger band: found in
    // testing to skip short sections entirely, since a section shorter
    // than that band can scroll straight through it between observer
    // callbacks without ever registering as "intersecting" at all —
    // the highlight jumped straight to whatever section came after it.
    // A "largest overlap with a band" comparison was tried next, but
    // that was worse in a different way: a short section positioned
    // right at the band's start still loses to whatever taller section
    // fills the rest of the same band, even at the exact moment of
    // landing on it via a sidebar-link click — the most common real
    // way a reader reaches a given section. This single-reference-line
    // version correctly shows a section as active the instant its top
    // reaches the line, regardless of that section's own height, which
    // is what matters most: clicking a link and immediately seeing it
    // highlighted. Natural scrolling afterwards then gives every
    // section a highlighted window sized to its own height — brief for
    // a short section, same as in effectively every other scrollspy
    // implementation, and not something worth fighting.
    var REFERENCE_LINE = 100; // px from the top of the viewport

    function updateActive() {
      var active = pairs[0];
      for (var i = 0; i < pairs.length; i++) {
        if (pairs[i].section.getBoundingClientRect().top <= REFERENCE_LINE) {
          active = pairs[i];
        }
      }
      pairs.forEach(function (p) {
        p.link.classList.toggle('active', p === active);
      });
    }

    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        updateActive();
        ticking = false;
      });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    updateActive();
  }

  function run() {
    // Scoped deliberately to generated documentation pages only — every
    // hand-authored hub page (Getting Started, Search Overview, the
    // Longitudinal Search Guide, etc.) uses the exact same .page-topics
    // / .sidebar-summary / gs-card-* building blocks this script looks
    // for, but several of them already have their own, different
    // active-highlighting mechanism (a CSS-only :target trick that
    // activates on click, not on scroll). Running unconditionally would
    // add a second, independent scroll-triggered highlight to those
    // pages too — one that never existed there and could show a
    // different link highlighted than their own :target rule while
    // scrolling without the URL updating. .doc-pdf-download is a marker
    // unique to render_page()'s own output (the "Download PDF version"
    // button), present on every generated documentation page and no
    // page's own build_pages.py output, present on no hand-authored
    // page. Checking for several rather than just one guards against a
    // single marker being absent on some pages (e.g. if PDF generation
    // failed for a particular document) silently disabling this
    // entirely.
    var isDocPage = document.querySelector('.doc-pdf-download, .doc-var-table, .doc-content-body');
    if (!isDocPage) return;
    setupScrollTracking(colorSidebarLinks());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();