/* ============================================================
   OWL — Home page
   /OWL/assets/js/home.js
   Drives the two-level accordion (sections + nested tools) and
   the right-hand sidebar summary that expands/scrolls to them,
   including highlighting whichever sidebar link is currently
   open, and correctly resetting child items when a parent
   section is collapsed (via either the accordion or the sidebar).
   Kept as an external file (rather than inline <script>) so
   Jekyll/kramdown's markdown processing can never touch or
   mangle the JS content.
   ============================================================ */

(function () {

  // Run fn once the DOM is ready, whether or not DOMContentLoaded
  // has already fired by the time this script executes.
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {

    /* ----------------------------------------------------------
       SIDEBAR ACTIVE-STATE SYNC
       Adds/removes the .active class on every sidebar link so it
       reflects whether its target section/sub-item is currently
       expanded. Called after any accordion or sidebar interaction.
       Declared early so the accordion handlers below can call it.
       ---------------------------------------------------------- */
    function syncSidebarActiveStates() {
      document.querySelectorAll('.sidebar-summary a[data-sec]').forEach(function (link) {
        var secId = link.dataset.sec;
        var innerId = link.dataset.inner;
        var isActive;

        if (innerId) {
          // Sub-item link: active only if that specific inner item is open
          var item = document.getElementById(innerId);
          var innerTrigger = item ? item.querySelector('.inner-trigger') : null;
          isActive = !!innerTrigger && innerTrigger.getAttribute('aria-expanded') === 'true';
        } else {
          // Top-level link: active if its section is open
          var row = document.getElementById(secId);
          var trigger = row ? row.querySelector('.sec-trigger') : null;
          isActive = !!trigger && trigger.getAttribute('aria-expanded') === 'true';
        }

        link.classList.toggle('active', isActive);
      });

      // Collapse/expand each sidebar sub-item group so it mirrors
      // whether its parent accordion section is currently open.
      // This is the single source of truth for sidebar grouping —
      // it fires after every outer-accordion click, inner-accordion
      // click, sidebar-link click, and on initial load, so the
      // sidebar never needs its own independent open/closed state.
      document.querySelectorAll('.sidebar-summary li.sb-parent').forEach(function (parentLi) {
        var secId = parentLi.dataset.sec;
        var row = document.getElementById(secId);
        var trigger = row ? row.querySelector('.sec-trigger') : null;
        var isOpen = !!trigger && trigger.getAttribute('aria-expanded') === 'true';

        parentLi.classList.toggle('open', isOpen);

        // Keep the collapsed group out of the tab order / AT tree
        // (it's still in the DOM with zero height for the CSS
        // grid-rows transition, so without this a keyboard user
        // could tab into invisible links).
        var subgroupInner = parentLi.querySelector('.sb-subgroup-inner');
        if (subgroupInner) {
          if (isOpen) subgroupInner.removeAttribute('inert');
          else subgroupInner.setAttribute('inert', '');
        }
      });
    }

    /* ----------------------------------------------------------
       OUTER ACCORDION
       Top-level rows: About, Getting Started, Data Coverage,
       Search Methods, Explore Documentation, Access.
       Clicking a .sec-trigger toggles its own .sec-body open/closed.
       If the row is being CLOSED, also reset any inner items
       inside it so they don't stay "active" while hidden.
       ---------------------------------------------------------- */
    try {
      document.querySelectorAll('.sections-accordion .sec-trigger').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var expanded = this.getAttribute('aria-expanded') === 'true';
          var willOpen = !expanded;
          this.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
          var body = this.parentElement.querySelector('.sec-body');
          if (body) body.classList.toggle('open', willOpen);

          // Closing this section: reset any open inner items inside it
          if (!willOpen && body) {
            body.querySelectorAll('.inner-trigger[aria-expanded="true"]').forEach(function (innerBtn) {
              innerBtn.setAttribute('aria-expanded', 'false');
              var innerBody = innerBtn.parentElement.querySelector('.inner-body');
              if (innerBody) innerBody.classList.remove('open');
            });
          }

          syncSidebarActiveStates();
        });
      });
    } catch (err) {
      // Isolated in its own try/catch so a failure here doesn't
      // prevent the inner accordion or sidebar nav from initialising
      console.error('Outer accordion init failed:', err);
    }

    /* ----------------------------------------------------------
       INNER ACCORDION
       Nested tool/page items inside Getting Started, Search
       Methods, and Explore Documentation. Same open/close pattern
       as the outer accordion, just one level deeper.
       ---------------------------------------------------------- */
    try {
      document.querySelectorAll('.inner-accordion .inner-trigger').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var expanded = this.getAttribute('aria-expanded') === 'true';
          this.setAttribute('aria-expanded', expanded ? 'false' : 'true');
          var body = this.parentElement.querySelector('.inner-body');
          if (body) body.classList.toggle('open', !expanded);
          syncSidebarActiveStates();
        });
      });
    } catch (err) {
      console.error('Inner accordion init failed:', err);
    }

    /* ----------------------------------------------------------
       SIDEBAR SUMMARY NAVIGATION
       Clicking a link in .sidebar-summary should:
         1. Open (or close, if already open) the relevant section
         2. If it's a sub-item link, open/close that inner item too
         3. If closing a section, reset any open inner items inside it
         4. Smooth-scroll to the section/item once it's expanded
         5. Keep sidebar .active highlighting in sync throughout
       ---------------------------------------------------------- */
    try {

      // Is the outer accordion row with this id currently expanded?
      function isOuterOpen(id) {
        var row = document.getElementById(id);
        if (!row) return false;
        var trigger = row.querySelector('.sec-trigger');
        return !!trigger && trigger.getAttribute('aria-expanded') === 'true';
      }

      // Force the outer row with this id open or closed. Closing
      // also resets any open inner items inside it.
      function setOuter(id, open) {
        var row = document.getElementById(id);
        if (!row) return;
        var trigger = row.querySelector('.sec-trigger');
        var body = row.querySelector('.sec-body');
        if (!trigger || !body) return;
        trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
        body.classList.toggle('open', open);

        if (!open) {
          body.querySelectorAll('.inner-trigger[aria-expanded="true"]').forEach(function (innerBtn) {
            innerBtn.setAttribute('aria-expanded', 'false');
            var innerBody = innerBtn.parentElement.querySelector('.inner-body');
            if (innerBody) innerBody.classList.remove('open');
          });
        }
      }

      // Force the inner item with this id open or closed
      function setInner(id, open) {
        var item = document.getElementById(id);
        if (!item) return;
        var trigger = item.querySelector('.inner-trigger');
        var body = item.querySelector('.inner-body');
        if (!trigger || !body) return;
        trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
        body.classList.toggle('open', open);
      }

      // Every sidebar link carries data-sec (always) and data-inner
      // (only on sub-item links) — see index.md for the markup
      document.querySelectorAll('.sidebar-summary a[data-sec]').forEach(function (link) {
        link.addEventListener('click', function (e) {
          e.preventDefault(); // stop the default #anchor jump; we handle scrolling ourselves
          var secId = this.dataset.sec;
          var innerId = this.dataset.inner;

          if (innerId) {
            // SUB-ITEM LINK (e.g. "Where should I start?")
            // Always make sure its parent section is open first...
            if (!isOuterOpen(secId)) setOuter(secId, true);
            // ...then toggle just this inner item open/closed
            var item = document.getElementById(innerId);
            var innerTrigger = item ? item.querySelector('.inner-trigger') : null;
            var innerOpen = innerTrigger && innerTrigger.getAttribute('aria-expanded') === 'true';
            setInner(innerId, !innerOpen);
          } else {
            // TOP-LEVEL LINK (e.g. "Getting Started")
            // Simple toggle: open if closed, close if already open
            // (closing also resets any open inner items, via setOuter)
            var open = isOuterOpen(secId);
            setOuter(secId, !open);
          }

          syncSidebarActiveStates();

          // Scroll to whichever element was just acted on
          var targetId = innerId || secId;
          var target = document.getElementById(targetId);
          if (!target) return;

          // Small delay so the browser has reflowed the now-expanded
          // section before we measure its position — without this,
          // scrollIntoView can target where the element used to be
          setTimeout(function () {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 50);
        });
      });

    } catch (err) {
      console.error('Sidebar nav init failed:', err);
    }

    // Run once on load in case anything is pre-expanded
    syncSidebarActiveStates();

  });

})();