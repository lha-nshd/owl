/* ============================================================
   NSHD Questionnaire Sub-page — shared JavaScript
   Active section highlighting in the fixed sidebar.
   Click locks the highlight; scroll updates it once settled.
   ============================================================ */
 
document.addEventListener('DOMContentLoaded', function () {
 
  const sections = document.querySelectorAll('.home-section[id]');
  const links    = document.querySelectorAll('.sidebar-link');
 
  /* Build a quick id → link map */
  const map = {};
  links.forEach(link => {
    const id = link.getAttribute('href').replace('#', '');
    map[id] = link;
  });
 
  function setActive(id) {
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
 
      /* Suppress the observer for long enough to finish scrolling */
      scrollLock = true;
      clearTimeout(lockTimer);
      lockTimer = setTimeout(() => { scrollLock = false; }, 1000);
    });
  });
 
  /* ── Scroll: pick the section whose top is closest to the top of the viewport ── */
  const observer = new IntersectionObserver(entries => {
    if (scrollLock) return;
 
    /* Find the section nearest the top of the viewport */
    let best     = null;
    let bestTop  = Infinity;
 
    sections.forEach(section => {
      const rect = section.getBoundingClientRect();
      /* Only consider sections that are at least partially visible */
      if (rect.bottom > 0 && rect.top < window.innerHeight) {
        const distFromTop = Math.abs(rect.top);
        if (distFromTop < bestTop) {
          bestTop = distFromTop;
          best    = section.id;
        }
      }
    });
 
    if (best) setActive(best);
 
  }, { threshold: [0, 0.1, 0.25, 0.5, 1] });
 
  sections.forEach(section => observer.observe(section));
 
});