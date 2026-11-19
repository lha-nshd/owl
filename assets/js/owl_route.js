/* owl_route.js
   The "Four ways to build your basket" route animation on the OWL and
   Condor page. Framework-free. Only runs if #or-dyn is on the page.
   Choose a route and a trail is drawn along it, lighting each step in turn.
   Animation is skipped under prefers-reduced-motion. */
(function () {
  'use strict';

  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var ROUTE_KEY = 'owl-route-choice';

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* storage not available: fine */ } }

  /* Each node is [lane, label (| = line break), step number in the strip (0-3)].
     lane 'o' = on OWL, 'c' = in Condor. skip = strip steps this route does not use. */
  var ROUTES = {
    owl: {
      nodes: [['o', 'Search and|browse', 0], ['o', 'Add to your|basket', 1], ['o', 'Download the|data dictionary', 1], ['c', 'Upload the|data dictionary', 2], ['c', 'Checked, then|you confirm', 2], ['c', 'Save your|basket', 2], ['o', 'Data Access|Request Form', 3]],
      skip: [],
      p: 'Search and browse on OWL, add variables to your basket, download the data dictionary (the Request column is filled in for you), then upload it in Condor.',
      why: 'OWL has seven searches, questionnaires, topic pages and searchable documentation, so it is a good place to discover variables.'
    },
    condor: {
      nodes: [['c', 'Search or browse|in Condor', 2], ['c', 'Add to your|basket', 2], ['c', 'Save your|basket', 2], ['o', 'Data Access|Request Form', 3]],
      skip: [0, 1],
      p: 'Search by category, name or keyword in Condor, add variables to your basket and save it. No spreadsheet is needed.',
      why: 'Condor holds every variable, including any not yet on OWL, so this works well if you already know what you need.'
    },
    hand: {
      nodes: [['o', 'Download a|blank dictionary', 1], ['o', 'Mark Y in the|spreadsheet', 1], ['c', 'Upload the|data dictionary', 2], ['c', 'Checked, then|you confirm', 2], ['c', 'Save your|basket', 2], ['o', 'Data Access|Request Form', 3]],
      skip: [0],
      p: 'Download a blank data dictionary, mark Y against every variable you want, then upload it in Condor.',
      why: 'This works well if you already know the variable names.'
    },
    both: {
      nodes: [['o', 'Search and add|on OWL', 0], ['o', 'Download the|data dictionary', 1], ['c', 'Upload the|data dictionary', 2], ['c', 'Search and add|more in Condor', 2], ['c', 'Save your|basket', 2], ['o', 'Data Access|Request Form', 3]],
      skip: [],
      p: 'Start on OWL and download your data dictionary, upload it in Condor, then search for anything else directly in Condor before you save.',
      why: 'Every route makes the same basket, so you can mix them freely.'
    }
  };

  function journey() {
    var dyn = $('#or-dyn');
    if (!dyn) { return; }
    var NS = 'http://www.w3.org/2000/svg', steps = $$('.or-st'), box = $('#or-route-text'), dia = $('#or-dia');
    var cur = 'owl', raf = 0, L = 0, nodeLen = [], stepOf = [], track, trail, dot;

    function el(n, a, txt) {
      var e = document.createElementNS(NS, n);
      for (var k in a) { if (a.hasOwnProperty(k)) { e.setAttribute(k, a[k]); } }
      if (txt !== undefined) { e.textContent = txt; }
      return e;
    }

    function build(k) {
      var r = ROUTES[k], n = r.nodes.length;
      while (dyn.firstChild) { dyn.removeChild(dyn.firstChild); }
      var P = r.nodes.map(function (d, i) { return [70 + i * 760 / (n - 1), d[0] === 'o' ? 76 : 196]; });
      var d = 'M' + P.map(function (p) { return p[0] + ',' + p[1]; }).join(' L');
      dyn.appendChild(el('path', { 'class': 'track', id: 'or-track', d: d }));
      dyn.appendChild(el('path', { 'class': 'trail', id: 'or-trail', d: d }));
      r.nodes.forEach(function (nd, i) {
        var g = el('g', { 'class': 'nd' });
        g.appendChild(el('circle', { cx: P[i][0], cy: P[i][1], r: 18 }));
        g.appendChild(el('text', { 'class': 'n', x: P[i][0], y: P[i][1] + 5 }, String(i + 1)));
        nd[1].split('|').forEach(function (s, j) {
          g.appendChild(el('text', { 'class': 'l', x: P[i][0], y: (nd[0] === 'o' ? 36 : 234) + j * 15 }, s));
        });
        dyn.appendChild(g);
      });
      dot = el('circle', { 'class': 'dot', r: 8, cx: P[0][0], cy: P[0][1] });
      dyn.appendChild(dot);
      track = $('#or-track'); trail = $('#or-trail'); L = track.getTotalLength();
      trail.style.strokeDasharray = L; trail.style.strokeDashoffset = L;
      nodeLen = [0];
      for (var i = 1; i < n; i++) {
        nodeLen.push(nodeLen[i - 1] + Math.sqrt(Math.pow(P[i][0] - P[i - 1][0], 2) + Math.pow(P[i][1] - P[i - 1][1], 2)));
      }
      stepOf = r.nodes.map(function (x) { return x[2]; });
      steps.forEach(function (s, j) { s.classList.toggle('skip', r.skip.indexOf(j) > -1); s.classList.remove('on', 'done'); });
      if (box) { box.innerHTML = '<p>' + r.p + '</p><p class="why">' + r.why + '</p>'; }
    }

    function setState(len) {
      trail.style.strokeDashoffset = L - len;
      var pt = track.getPointAtLength(Math.min(len, L - 0.01));
      dot.setAttribute('cx', pt.x); dot.setAttribute('cy', pt.y);
      var c = -1;
      $$('#or-dyn .nd').forEach(function (nd, i) {
        var lit = len >= nodeLen[i] - 0.5;
        nd.classList.toggle('lit', lit);
        if (lit) { c = i; }
      });
      steps.forEach(function (s, j) {
        var a = c >= 0 ? stepOf[c] : -1;
        s.classList.toggle('on', j === a);
        s.classList.toggle('done', j < a && !s.classList.contains('skip'));
      });
    }

    function play() {
      window.cancelAnimationFrame(raf);
      if (reduce) { setState(L); return; }
      setState(0);
      var t0 = null, dur = 1100 * ROUTES[cur].nodes.length;
      (function f(t) {
        if (t0 === null) { t0 = t; }
        var p = Math.min((t - t0) / dur, 1);
        setState(L * (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2));
        if (p < 1) { raf = window.requestAnimationFrame(f); }
      })(window.performance.now());
    }

    function choose(k, replay) {
      cur = k;
      $$('.or-tab').forEach(function (x) {
        var on = x.getAttribute('data-r') === k;
        x.classList.toggle('on', on);
        x.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      build(k); lsSet(ROUTE_KEY, k);
      if (replay) { play(); } else { setState(L); }
    }

    $$('.or-tab').forEach(function (t) { t.addEventListener('click', function () { choose(t.getAttribute('data-r'), true); }); });
    var rp = $('#or-replay'); if (rp) { rp.addEventListener('click', play); }
    var saved = lsGet(ROUTE_KEY); choose(ROUTES[saved] ? saved : 'owl', false);
    /* play once when the diagram first scrolls into view */
    if (!reduce && 'IntersectionObserver' in window && dia) {
      var io = new IntersectionObserver(function (es, o) { if (es[0].isIntersecting) { play(); o.disconnect(); } }, { threshold: 0.5 });
      io.observe(dia);
    } else { setState(L); }
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', journey); } else { journey(); }
})();