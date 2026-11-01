/* ============================================================
   OWL — Explore Topics
   /OWL/assets/js/topics.js
   Shared script: active-section sidebar highlighting,
   variable-code table linking, and table alignment fixes.

   Supports two sidebar markup styles used across the site:
     - .sidebar-link                  (older question/year pages)
     - .sidebar-summary a[href^="#"]  (topic sub-pages)

   Sections are identified by .home-section elements containing
   an h2[id] (the id lives on the heading, not the wrapper div).

   Active section = whichever .home-section's vertical midpoint
   is closest to a reference line near the top of the viewport.
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {

  /* ── Sidebar menu label for the Data Sharing section ──────────
     The "Data sharing" label above its menu item is drawn by CSS (navigation_sidebar.css). On the Data Sharing page
     itself the theme draws that menu item a little differently, and the CSS could not recognise it there, so the
     label vanished. This marks the item with a class (nav-label-data-sharing) on every Data Sharing page, whichever
     way the menu is drawn, and the CSS shows the label for that class. It runs first, before anything below can
     return early. */
  (function markDataSharingNavItem() {
    try {
      if (location.pathname.indexOf('/docs/data_sharing') === -1) return;
      var items = document.querySelectorAll('.nav-list > .nav-list-item');
      for (var i = 0; i < items.length; i++) {
        var links = items[i].querySelectorAll('a[href]');
        for (var j = 0; j < links.length; j++) {
          var path = (links[j].pathname || '').replace(/\/+$/, '');
          if (path.slice(-'/docs/data_sharing'.length) === '/docs/data_sharing') {
            items[i].classList.add('nav-label-data-sharing');
            return;
          }
        }
      }
    } catch (e) { /* the label is cosmetic: never let it stop the page's own script */ }
  })();


  const DEBUG = true;

  /* ── Getting Started / Documentation pages (anything loading
     getting-started.css) already ship a complete, hand-built colour
     system of their own — every .home-section carries a specific
     gs-card-* class with a permanent, deliberately-chosen colour, and
     getting-started.css already matches each sidebar link's colour
     and active-state highlight to it via :target/.active selectors.
     The automatic rainbow/group colouring below is built for the
     Topics section, which has no such system — on Getting Started
     pages it would only fight with the existing design, so it's
     skipped entirely here. The scroll-driven active-section
     highlighting further down still runs as normal either way, since
     getting-started.css's own .active rules depend on it. ── */
  const usesGettingStartedColours = !!document.querySelector('link[href*="getting-started.css"]');

  if (!usesGettingStartedColours) {

  /* ── Colour every section, grouped where the page uses grouping ──
     Some page templates (getting-started, documentation hub) insert
     .gs-category-band divider bars to group several .home-section
     cards under one labelled heading (e.g. "Search methods"). On
     those pages, every card in a group shares ONE colour rather than
     each rotating independently — otherwise five cards visually
     grouped under one band end up in five unrelated colours, which
     reads as chaotic rather than as a single labelled group.

     Plain pages with no bands (most topics pages) are unaffected:
     with no band ever encountered, each headed .home-section still
     gets its own colour in the rotation, exactly as before.

     Only .home-section blocks with an h2/h3 heading enter the
     rotation — a headerless intro block (no heading, just text)
     using the .home-section class doesn't burn a colour slot, so it
     can't push every real section one slot out of sync.

     The matching .sidebar-summary link for each coloured section
     (found via its heading's id) gets the SAME colour class, so the
     TOC entry's text colour matches its section's heading colour,
     and its active-state background matches that section's
     background. Any sidebar link whose target never received a
     colour — e.g. one pointing at a headerless welcome/intro block
     instead of a real section — gets a neutral grey style instead of
     staying default purple, so it can't be mistaken for section 1. ── */
  let colourIndex = 0;
  let groupColourClass = null;
  let inGroup = false;

  /* Known band → fixed colour mapping, matched by substring against
     the band's class list. "search"-themed bands are always blue
     (section-color-3), "explore"-themed bands are always amber
     (section-color-7) — regardless of where they fall in the page —
     so a page like "Where should I start?" keeps a stable identity
     rather than whatever colour the rotation happens to land on.
     A band whose class doesn't match either keyword falls back to
     the normal auto-rotating colour. */
  const FIXED_BAND_COLORS = [
    ['search', 'section-color-3'],
    ['explore', 'section-color-7']
  ];
  function fixedColorForBand(bandEl) {
    const cls = bandEl.className;
    for (let i = 0; i < FIXED_BAND_COLORS.length; i++) {
      if (cls.indexOf(FIXED_BAND_COLORS[i][0]) !== -1) return FIXED_BAND_COLORS[i][1];
    }
    return null;
  }

  Array.from(document.querySelectorAll('.home-section, .gs-category-band')).forEach(el => {
    if (el.classList.contains('gs-category-band')) {
      const fixed = fixedColorForBand(el);
      if (fixed) {
        groupColourClass = fixed;
      } else {
        groupColourClass = 'section-color-' + ((colourIndex % 10) + 1);
        colourIndex++;
      }
      inGroup = true;
      return;
    }
    if (el.classList.contains('no-auto-color')) return;
    const heading = el.querySelector('h2, h3');
    if (!heading) return;

    let colorClass;
    if (inGroup) {
      colorClass = groupColourClass;
    } else {
      colorClass = 'section-color-' + ((colourIndex % 10) + 1);
      colourIndex++;
    }
    el.classList.add(colorClass);
    if (heading.id) {
      const link = document.querySelector('.sidebar-summary a[href="#' + heading.id + '"]');
      if (link) link.classList.add(colorClass);
    }
  });

  Array.from(document.querySelectorAll('.sidebar-summary a[href^="#"]')).forEach(link => {
    if (!/section-color-\d+/.test(link.className)) {
      link.classList.add('toc-neutral');
    }
  });

  } // end !usesGettingStartedColours

  /* ── Find sections: .home-section elements with an h2[id] inside ── */
  const sections = Array.from(document.querySelectorAll('.home-section'))
    .map(el => {
      const heading = el.querySelector('h2[id], h3[id]');
      return heading ? { el: el, id: heading.id } : null;
    })
    .filter(Boolean);

  /* ── Find links: prefer .sidebar-summary if present, else .sidebar-link ── */
  let links;
  if (document.querySelector('.sidebar-summary')) {
    links = Array.from(document.querySelectorAll('.sidebar-summary a[href^="#"]'));
  } else {
    links = Array.from(document.querySelectorAll('.sidebar-link'));
  }

  if (DEBUG) {
    console.log('[topics] sections:', sections.map(s => s.id));
    console.log('[topics] links:', links.map(l => l.getAttribute('href')));
  }

  if (!sections.length || !links.length) {
    if (DEBUG) console.warn('[topics] No sections or links found — aborting.');
  } else {

    /* Build a quick id → link map */
    const map = {};
    links.forEach(link => {
      const id = link.getAttribute('href').replace('#', '');
      map[id] = link;
    });

    function setActive(id) {
      if (DEBUG) console.log('[topics] setActive ->', id);
      links.forEach(l => l.classList.remove('active'));
      if (map[id]) map[id].classList.add('active');
    }

    /* ── Click: lock the clicked item immediately ── */
    let scrollLock = false;
    let lockTimer  = null;

    links.forEach(link => {
      link.addEventListener('click', function () {
        const id = this.getAttribute('href').replace('#', '');
        setActive(id);

        scrollLock = true;
        clearTimeout(lockTimer);
        lockTimer = setTimeout(() => { scrollLock = false; }, 1000);
      });
    });

    /* ── Reference line: how far down the viewport do we consider
       "where the reader's attention is"? ── */
    const REFERENCE_LINE_RATIO = 0.3; // 30% down the viewport

    function updateActive() {
      if (scrollLock) return;

      /* If scrolled (at or near) the bottom of the page, force the
         last section active — its midpoint may never be able to
         reach the reference line if the page doesn't scroll far
         enough past it. */
      const atBottom = (window.innerHeight + window.scrollY)
        >= (document.documentElement.scrollHeight - 2);

      if (atBottom) {
        if (DEBUG) console.log('[topics] at bottom of page, forcing last section');
        setActive(sections[sections.length - 1].id);
        return;
      }

      /* Similarly, if at the very top of the page, force the first
         section active. */
      if (window.scrollY <= 2) {
        setActive(sections[0].id);
        return;
      }

      const referenceY = window.innerHeight * REFERENCE_LINE_RATIO;

      let best = sections[0].id;
      let bestDist = Infinity;

      sections.forEach(section => {
        const rect = section.el.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        const dist = Math.abs(midpoint - referenceY);

        if (DEBUG) {
          console.log(`[topics] ${section.id} midpoint=${midpoint.toFixed(0)} dist=${dist.toFixed(0)}`);
        }

        if (dist < bestDist) {
          bestDist = dist;
          best = section.id;
        }
      });

      setActive(best);
    }

    let ticking = false;
    window.addEventListener('scroll', function () {
      if (!ticking) {
        window.requestAnimationFrame(function () {
          updateActive();
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });

    window.addEventListener('resize', updateActive);

    /* Initial state on load */
    updateActive();
  }

  /* ============================================================
     Variable-code linking
     Turns any table cell in .topic-table whose full text is a
     single alphanumeric token (e.g. WIC66, BRONC09) into a link
     pointing at the variable metadata page, lowercased.
     Cells with spaces, punctuation, or "—" are left untouched.
     Cells that already contain a link (e.g. topic-name cells
     like "Diabetes" or "Medication") are skipped entirely, since
     genuine variable-code cells are always plain text with no
     existing <a> tag.
     ============================================================ */
(function linkVariableCodes() {
  const baseUrl = 'https://rmjdish.github.io/OWL/assets/variable_metadata/';
  const cells = document.querySelectorAll('.topic-table tbody td');
  cells.forEach(function (cell) {
    if (cell.querySelector('a')) return;
    const text = cell.textContent.trim();
    if (/^[a-zA-Z0-9]+$/.test(text)) {
      const link = document.createElement('a');
      link.href = baseUrl + text.toLowerCase();
      link.textContent = text;
      link.target = '_blank';
      link.rel = 'noopener';
      cell.innerHTML = '';
      cell.appendChild(link);
    }
  });
})();

  /* ============================================================
     Description column alignment
     The base .topic-table styling center-aligns all columns
     except the first. Any column whose header is literally
     "Description" should stay left-aligned instead.
     ============================================================ */
  (function leftAlignDescriptionColumns() {
    document.querySelectorAll('.topic-table').forEach(function (table) {
      const headers = table.querySelectorAll('thead th');
      headers.forEach(function (th, index) {
        if (th.textContent.trim() === 'Description') {
          th.style.textAlign = 'left';
          table.querySelectorAll('tbody tr').forEach(function (row) {
            const cell = row.children[index];
            if (cell) cell.style.setProperty('text-align', 'left', 'important');
          });
        }
      });
    });
  })();

});