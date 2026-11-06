/*
 * Ask Tawny: the OWL help assistant ("Tawny").
 *
 * A self-contained help widget. It answers common questions about applying for
 * NSHD data from a content file (help-bot-content.json) using keyword matching.
 * No AI, no server and no tracking: nothing a visitor types leaves their browser.
 *
 * Install: put this file, help-bot-content.json and tawny.svg in one folder
 * (assets/help-bot/) and add one line to the site layout:
 *   <script src="{{ '/assets/help-bot/owl-help-bot.js' | relative_url }}" defer></script>
 *
 * Optional attributes on the script tag:
 *   data-content="URL"   use a different content file
 *   data-owl="URL"       use a different owl picture
 *   data-variables="URL" use a different variable search file (default: help-bot-variables.json next to this script)
 *   data-analytics="off" turn off the optional Google Analytics events (see track() below)
 *   (the owl button can be dragged anywhere; its place is remembered. Double-click it to put it back.)
 *   data-bottom="PX"    lift the button and panel this far from the bottom (e.g. 70 to clear a cookie button)
 *   data-site="URL"      the OWL site address that {{OWL}} in the content stands for
 *
 * Reviewers can add ?helpbot=draft to any page address to see the internal
 * "to confirm with LHA" notes that the content file carries.
 *
 * The widget draws inside a shadow root, so the site's own CSS cannot change
 * it and it cannot change the site.
 */
(function () {
  'use strict';
  if (!window.fetch || !window.DOMParser || !Element.prototype.attachShadow) return;
  if (window.owlHelpBot) return;

  var script = document.currentScript || document.querySelector('script[src*="owl-help-bot"]');
  var scriptUrl = script && script.src ? script.src : location.href;
  var baseDir = scriptUrl.split('#')[0].split('?')[0].replace(/[^\/]*$/, '');
  var siteBase = (script && script.getAttribute('data-site')) ||
    baseDir.replace(/\/$/, '').replace(/\/assets\/help-bot$/, '');
  var contentUrl = (script && script.getAttribute('data-content')) || baseDir + 'help-bot-content.json';
  /* the owl is built in (Tawny, drawn for NSHD), so the button never depends on a separate file path; data-owl can still override it */
  var OWL_BUILTIN = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj4KPHBhdGggZD0iTTIyIDMwIEwyNCA4IEw0MCAyMloiIGZpbGw9IiM2YjQyMjAiLz48cGF0aCBkPSJNNzggMzAgTDc2IDggTDYwIDIyWiIgZmlsbD0iIzZiNDIyMCIvPgo8ZWxsaXBzZSBjeD0iNTAiIGN5PSI1OCIgcng9IjMzIiByeT0iMzUiIGZpbGw9IiM4YTVhMmIiLz4KPGVsbGlwc2UgY3g9IjUwIiBjeT0iNjYiIHJ4PSIyMSIgcnk9IjI1IiBmaWxsPSIjZjNkY2I0Ii8+CjxwYXRoIGQ9Ik0zOCA2MHE0IDQgOCAwTTU0IDYwcTQgNCA4IDBNMzQgNzBxNCA0IDggME00NiA3MHE0IDQgOCAwTTU4IDcwcTQgNCA4IDBNNDAgODBxNCA0IDggME01MiA4MHE0IDQgOCAwIiBmaWxsPSJub25lIiBzdHJva2U9IiNjODlhNjIiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CjxlbGxpcHNlIGN4PSIyMiIgY3k9IjYyIiByeD0iOSIgcnk9IjIyIiBmaWxsPSIjNmI0MjIwIi8+PGVsbGlwc2UgY3g9Ijc4IiBjeT0iNjIiIHJ4PSI5IiByeT0iMjIiIGZpbGw9IiM2YjQyMjAiLz4KPGVsbGlwc2UgY3g9IjUwIiBjeT0iMzgiIHJ4PSIyNyIgcnk9IjIxIiBmaWxsPSIjYzg5YTYyIi8+CjxjaXJjbGUgY3g9IjM4IiBjeT0iMzgiIHI9IjEyIiBmaWxsPSIjZmZmIi8+PGNpcmNsZSBjeD0iNjIiIGN5PSIzOCIgcj0iMTIiIGZpbGw9IiNmZmYiLz4KPGNpcmNsZSBjeD0iMzkiIGN5PSIzOSIgcj0iNi41IiBmaWxsPSIjMmIxYjBlIi8+PGNpcmNsZSBjeD0iNjEiIGN5PSIzOSIgcj0iNi41IiBmaWxsPSIjMmIxYjBlIi8+CjxjaXJjbGUgY3g9IjQxIiBjeT0iMzYuNSIgcj0iMiIgZmlsbD0iI2ZmZiIvPjxjaXJjbGUgY3g9IjYzIiBjeT0iMzYuNSIgcj0iMiIgZmlsbD0iI2ZmZiIvPgo8cGF0aCBkPSJNNTAgNDEgTDQ1IDQ5IEw1MCA1NSBMNTUgNDlaIiBmaWxsPSIjZjA4YTI0Ii8+CjxwYXRoIGQ9Ik0zOCA5MyBoOCBNNTQgOTMgaDgiIHN0cm9rZT0iI2YwOGEyNCIgc3Ryb2tlLXdpZHRoPSI0IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48L3N2Zz4=';
  /* Optional Google Analytics 4 events. Sent only if the page already has gtag() (so the site's cookie/consent
     tool and blockers decide whether anything is recorded). Never includes typed text. data-analytics="off" disables. */
  var ANALYTICS = !(script && script.getAttribute('data-analytics') === 'off');
  function track(name, params) {
    if (!ANALYTICS) return;
    try { if (typeof window.gtag === 'function') window.gtag('event', name, params || {}); } catch (e) { }
  }
  var varsUrl = (script && script.getAttribute('data-variables')) || baseDir + 'help-bot-variables.json';
  var owlUrl = (script && script.getAttribute('data-owl')) || OWL_BUILTIN;
  var DRAFT = /[?&]helpbot=draft\b/.test(location.search);

  var content = null;
  var api = {
    open: function () { if (ui) setOpen(true); },
    close: function () { if (ui) setOpen(false); },
    ask: function (text) { if (ui) { setOpen(true); ask(text); } },
    match: function (text) { return content ? findAnswers(text) : null; },
    findVariables: function (text) { return loadVars().then(function () { return searchVars(text).map(function (i) { var r = VARS.v[i]; return { name: r[0], label: r[1], projects: r[8] }; }); }); }
  };
  window.owlHelpBot = api;

  var ui = null, tokensIndex = null;

  /* ---------- text matching ---------- */

  function norm(s) {
    return (' ' + String(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9+ ]+/g, ' ').replace(/\s+/g, ' ') + ' ');
  }
  function stem(w) {
    w = stem1(w);
    return w.length > 4 && /e$/.test(w) ? w.slice(0, -1) : w;
  }
  function stem1(w) {
    if (w.length > 5 && /ing$/.test(w)) return w.slice(0, -3);
    if (w.length > 4 && /ied$/.test(w)) return w.slice(0, -3) + 'y';
    if (w.length > 4 && /ed$/.test(w)) return w.slice(0, -2);
    if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + 'y';
    if (w.length > 3 && /es$/.test(w) && /(ss|x|ch|sh)es$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
    return w;
  }
  function tokens(s, stop) {
    var out = [], parts = norm(s).trim().split(' ');
    for (var i = 0; i < parts.length; i++) {
      var w = parts[i];
      if (!w || (stop && stop[w])) continue;
      out.push(stem(w));
    }
    return out;
  }

  function buildIndex() {
    var stop = {};
    (content.stopwords || []).forEach(function (w) { stop[w] = 1; });
    var entries = content.entries.map(function (e) {
      var w = {};
      tokens(e.question, stop).forEach(function (t) { w[t] = Math.max(w[t] || 0, 2); });
      tokens(e.keywords || '', stop).forEach(function (t) { w[t] = Math.max(w[t] || 0, 1); });
      (e.examples || []).forEach(function (ex) { tokens(ex, stop).forEach(function (t) { w[t] = Math.max(w[t] || 0, 2); }); });
      return { entry: e, w: w };
    });
    var df = {};
    entries.forEach(function (x) { Object.keys(x.w).forEach(function (t) { df[t] = (df[t] || 0) + 1; }); });
    var n = entries.length;
    var syn = [];
    var s = content.synonyms || {};
    Object.keys(s).forEach(function (k) {
      var phrases = [k].concat(s[k]).map(function (p) { return norm(p); });
      syn.push({ phrases: phrases, add: tokens(k, stop) });
    });
    tokensIndex = { stop: stop, entries: entries, df: df, n: n, syn: syn };
  }

  function findAnswers(text) {
    var ix = tokensIndex, q = {}, hay = norm(text);
    tokens(text, ix.stop).forEach(function (t) { q[t] = Math.max(q[t] || 0, 1); });
    ix.syn.forEach(function (g) {
      for (var i = 0; i < g.phrases.length; i++) {
        if (hay.indexOf(g.phrases[i]) !== -1) {
          g.add.forEach(function (t) { q[t] = Math.max(q[t] || 0, 0.6); });
          break;
        }
      }
    });
    var qtotal = 0;
    Object.keys(q).forEach(function (t) { if (q[t] === 1) qtotal += 1; });
    (String(text).match(/\d[\d,]*/g) || []).forEach(function (n) {
      if (parseInt(n.replace(/,/g, ''), 10) > 500) { q['500'] = Math.max(q['500'] || 0, 0.6); q.limit = Math.max(q.limit || 0, 0.6); q.large = Math.max(q.large || 0, 0.6); }
    });
    var scored = ix.entries.map(function (x) {
      var s = 0, hit = 0;
      Object.keys(q).forEach(function (t) {
        if (x.w[t]) { s += q[t] * x.w[t] * Math.log(1 + ix.n / (ix.df[t] || 1)); if (q[t] === 1) hit += 1; }
      });
      var cover = qtotal ? hit / qtotal : 0;
      s = s * (0.6 + 0.4 * cover);
      return { e: x.entry, s: s };
    }).filter(function (r) { return r.s > 0; }).sort(function (a, b) { return b.s - a.s; });
    var MIN = 2.2;
    if (!scored.length || scored[0].s < MIN) return { best: null, related: scored.slice(0, 0) };
    var related = scored.slice(1, 4).filter(function (r) { return r.s >= MIN * 0.8 && r.s >= scored[0].s * 0.55; }).slice(0, 2);
    return { best: scored[0].e, related: related.map(function (r) { return r.e; }), scores: scored.slice(0, 4).map(function (r) { return [r.e.id, Math.round(r.s * 10) / 10]; }) };
  }

  /* ---------- safe content ---------- */

  var ALLOWED = { P: 1, UL: 1, OL: 1, LI: 1, B: 1, STRONG: 1, EM: 1, I: 1, BR: 1 };
  function cleanInto(src, dest) {
    for (var n = src.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) { dest.appendChild(document.createTextNode(n.nodeValue)); }
      else if (n.nodeType === 1) {
        if (ALLOWED[n.tagName]) { var c = document.createElement(n.tagName.toLowerCase()); cleanInto(n, c); dest.appendChild(c); }
        else { cleanInto(n, dest); }
      }
    }
  }
  function safeHtml(html, dest) {
    var doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
    cleanInto(doc.body, dest);
  }
  function fixUrl(u) {
    u = String(u || '').replace('{{OWL}}', siteBase);
    return /^https:\/\//i.test(u) || (/^http:\/\/localhost/i.test(u)) ? u : '';
  }
  function fmtDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return '';
    var mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m[2] - 1];
    return +m[3] + ' ' + mo + ' ' + m[1];
  }

  /* ---------- interface ---------- */

  var CSS = [
    ':host{all:initial;color-scheme:light;font-family:"Segoe UI",system-ui,-apple-system,Roboto,Helvetica,Arial,sans-serif}',
    '*{box-sizing:border-box}',
    '.launch,.chat,.hint{--plum:#6a0dad;--ink:#2b1b3d;--muted:#6b5f78;--line:#e3dcec;--bg:#faf8fc;--card:#fff}',
    '.launch{position:fixed;z-index:2147483000;right:max(16px,env(safe-area-inset-right,0px));bottom:calc(16px + var(--owl-lift,0px) + env(safe-area-inset-bottom,0px));height:60px;padding:0 20px 0 10px;border:0;border-radius:999px;background:var(--plum);color:#fff;font-family:inherit;font-size:15px;font-weight:600;line-height:1;display:flex;align-items:center;gap:8px;cursor:pointer;box-shadow:0 6px 18px rgba(80,30,120,.35)}',
    '.launch{touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab}.launch.dragging{cursor:grabbing;transition:none!important}.launch.dragging *{pointer-events:none}',
    '.launch img{height:40px;width:40px;display:block;flex:none;background:#fff;border-radius:50%;padding:3px}',
    '.fb-owl{display:grid;place-items:center;flex:none;width:40px;height:40px;background:#fff;border-radius:50%;font-size:24px;line-height:1}',
    '.launch .lbl{max-width:130px;overflow:hidden;white-space:nowrap;transition:max-width .35s ease,opacity .25s ease}',
    '.launch .q{position:absolute;top:-4px;right:-4px;width:22px;height:22px;border-radius:50%;background:#f5a623;color:#2a1a00;border:2px solid #fff;font-size:14px;font-weight:700;line-height:18px;text-align:center;opacity:0;transition:opacity .25s ease;pointer-events:none}',
    '.launch.compact{padding:0 10px;gap:0;transition:padding .35s ease,gap .35s ease}',
    '.launch.compact .lbl{max-width:0;opacity:0}',
    '.launch.compact .q{opacity:1}',
    '.launch.compact:hover,.launch.compact:focus-visible{padding:0 20px 0 10px;gap:8px}',
    '.launch.compact:hover .lbl,.launch.compact:focus-visible .lbl{max-width:130px;opacity:1}',
    '.launch.compact:hover .q,.launch.compact:focus-visible .q{opacity:0}',
    '.launch:hover{background:#5a0a94}',
    '.hint{position:fixed;z-index:2147483000;right:max(16px,env(safe-area-inset-right,0px));bottom:calc(86px + var(--owl-lift,0px) + env(safe-area-inset-bottom,0px));max-width:min(260px,calc(100vw - 32px));background:var(--card);color:var(--ink);border:1.5px solid var(--plum);border-radius:12px;padding:8px 12px;font-size:13px;line-height:1.4;box-shadow:0 6px 18px rgba(80,30,120,.2);transition:opacity .4s}',
    '.hint.gone{opacity:0;pointer-events:none}',
    '.chat{position:fixed;z-index:2147483001;right:max(16px,env(safe-area-inset-right,0px));bottom:calc(88px + var(--owl-lift,0px) + env(safe-area-inset-bottom,0px));width:min(420px,calc(100vw - 32px));max-height:calc(100vh - 120px);display:flex;flex-direction:column;background:var(--card);color:var(--ink);border:1.5px solid var(--plum);border-radius:14px;overflow:hidden;box-shadow:0 12px 36px rgba(80,30,120,.28);font-size:14px;line-height:1.5}',
    '.chat[hidden],.hint[hidden],.launch[hidden]{display:none}',
    '.head{background:var(--plum);color:#fff;padding:10px 12px 10px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px}',
    '.who{display:flex;align-items:center;gap:10px;min-width:0}',
    '.who img{height:38px;width:38px;display:block;flex:none}',
    '.who strong{font-size:16px}.who span{font-size:12px;opacity:.9}',
    '.hr{display:flex;align-items:center;gap:4px;flex:none}.reset{font:inherit;font-size:12px;background:transparent;border:1px solid rgba(255,255,255,.55);color:#fff;border-radius:999px;padding:3px 10px;cursor:pointer}.reset:hover{background:rgba(255,255,255,.2)}',
    '.x{font:inherit;font-size:24px;line-height:1;background:transparent;border:0;color:#fff;cursor:pointer;padding:2px 9px;border-radius:6px}',
    '.x:hover{background:rgba(255,255,255,.2)}',
    '.log{background:#241338;padding:14px;display:flex;flex-direction:column;gap:12px;overflow-y:auto;min-height:40px;flex:1 1 auto;max-height:340px}',
    '.msg{max-width:94%;padding:9px 12px;border-radius:12px;overflow-wrap:anywhere}',
    '.me{align-self:flex-end;background:#7c2fc4;color:#fff;border-bottom-right-radius:3px}',
    '.bot{align-self:flex-start;background:#fff;border-bottom-left-radius:3px;width:94%}',
    '.bot p{margin:0 0 8px}.bot ul,.bot ol{margin:0 0 8px;padding-left:20px}.bot li{margin-bottom:3px}.bot>*:last-child{margin-bottom:0}',
    '.tbc{display:inline-block;margin:2px 0 8px;padding:3px 8px;border-radius:6px;background:#fff1d6;color:#7a4f00;border:1px solid #e0b04a;font-size:12px}',
    '.links{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}',
    '.links a,.alt{font:inherit;font-size:12.5px;padding:4px 10px;border-radius:999px;border:1px solid var(--plum);background:transparent;color:#5b0b95;text-decoration:none;cursor:pointer}',
    '.links a:hover,.alt:hover{background:var(--plum);color:#fff}',
    '.meta{margin-top:8px;font-size:11.5px;color:var(--muted)}',
    '.th{display:flex;align-items:center;justify-content:space-between;padding:10px 14px 6px;background:#fff7e6;border-top:3px solid #f5a623;font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:#8a5a00}.tg{font:inherit;font-size:11.5px;text-transform:none;letter-spacing:0;font-weight:600;background:transparent;border:0;color:#8a5a00;text-decoration:underline;cursor:pointer;padding:2px 4px}',
    '.tabs{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 10px;background:#fff7e6}.chat.min .tabs,.chat.min .chips{display:none}.chat.min .log{max-height:min(560px,calc(100vh - 300px))}',
    '.tabs button{font:inherit;font-size:12.5px;padding:4px 10px;border-radius:999px;border:0;background:#fbe9c4;color:#6b4a00;cursor:pointer}',
    '.tabs button[aria-pressed="true"]{background:#8a5a00;color:#fff}',
    '.chips{display:flex;flex-wrap:wrap;gap:7px;padding:0 14px 12px;background:#fff7e6;overflow-y:auto;min-height:0;flex:0 1 auto}.head,.th,.tabs,form,.foot{flex:none}',
    '.chips button{font:inherit;font-size:13px;font-weight:600;padding:6px 12px;border-radius:999px;border:0;background:#f5a623;color:#2a1a00;cursor:pointer;text-align:left}',
    '.chips button:hover{background:#e8941a}',
    '.chips button.tp{background:#fbe9c4;color:#6b4a00;font-weight:600}.chips button.tp:hover{background:#f6dca5}',
    '.chips .ml{flex:0 0 100%;margin:6px 0 0;font-size:11.5px;font-weight:700;color:#8a5a00}',
    '.tabs.menu{align-items:center}.tabs .mcrumb{font-size:12.5px;color:#6b4a00;font-weight:600}',
    'form{display:flex;gap:8px;padding:10px 14px 8px;background:#fff7e6}',
    'input{flex:1;min-width:0;font:inherit;font-size:14px;padding:9px 11px;border-radius:999px;border:2px solid #f5a623;background:#fff;color:var(--ink)}',
    'form button{font:inherit;font-weight:700;padding:9px 18px;border-radius:999px;border:0;background:#241338;color:#fff;cursor:pointer}',
    '.vcard{padding:8px 0;border-top:1px solid #eee3f3}.vcard:first-of-type{border-top:0;padding-top:2px}.vtop{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.vn{font-family:ui-monospace,SFMono-Regular,Consolas,Menlo,monospace;font-weight:700;font-size:13px;color:#4b0a7d}.vl{font-size:13.5px;margin-top:2px}.vm{font-size:11.5px;color:var(--muted);margin-top:2px}',
    '.alt.cta{background:#6a0dad;color:#fff;border-color:#6a0dad;font-weight:600}.alt.cta:hover{background:#4b0a7d}',
    '.vsec{font-weight:700;font-size:13px;margin:10px 0 2px;color:#4b0a7d}.vsec:first-of-type{margin-top:4px}',
    '.badge{font-size:11px;font-weight:700;border-radius:999px;padding:1px 8px}.b-r{background:#ffe3e3;color:#8a1c1c}.b-s{background:#fff1d6;color:#7a4f00}.vwarn{margin-top:5px;font-size:12px;padding:5px 8px;border-radius:8px;background:#ffe9e9;color:#6e1414;border:1px solid #f1b7b7}.vwarn.s{background:#fff5df;color:#6b4a00;border-color:#efd08a}.vtog{display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin-top:6px}.vhint{flex:0 0 100%;margin:0 0 2px;font-size:12.5px;color:#6b4a00}.vload{color:var(--muted)}',
    '.foot{font-size:11.5px;color:#6b5a3a;padding:0 14px 12px;background:#fff7e6}',
    '.foot a{color:#5b0b95}',
    'button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid #241338;outline-offset:2px}',
    '@media(max-width:600px){.chat{inset:0;width:100%;max-height:none;border-radius:0;border-width:0}.log{max-height:none}}',
    '@media(prefers-reduced-motion:reduce){.hint,.launch,.launch .lbl,.launch .q{transition:none!important}}',
    '@media print{:host{display:none}}'
  ].join('\n');

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function build() {
    /* a custom-element name, so page rules for "div" never reach it; inline styles keep the host itself out of the page layout */
    var host = document.createElement('owl-help-bot');
    host.id = 'owl-help-bot';
    [['display', 'block'], ['position', 'fixed'], ['width', '0'], ['height', '0'], ['overflow', 'visible'], ['margin', '0'], ['padding', '0'], ['border', '0'], ['background', 'none'], ['box-shadow', 'none'], ['transform', 'none'], ['filter', 'none'], ['z-index', '2147483647']].forEach(function (d) { host.style.setProperty(d[0], d[1], 'important'); });
    var lift = parseInt(script && script.getAttribute('data-bottom'), 10);
    if (lift > 0) host.style.setProperty('--owl-lift', lift + 'px', 'important');
    var root = host.attachShadow({ mode: 'open' });
    var style = document.createElement('style'); style.textContent = CSS; root.appendChild(style);

    var launch = el('button', 'launch');
    launch.type = 'button';
    launch.setAttribute('aria-expanded', 'false');
    launch.setAttribute('aria-controls', 'chat');
    var limg = el('img'); limg.onerror = function () { var f = el('span', 'fb-owl', '🦉'); f.setAttribute('aria-hidden', 'true'); if (limg.parentNode) limg.parentNode.replaceChild(f, limg); }; limg.src = owlUrl; limg.alt = ''; limg.setAttribute('aria-hidden', 'true');
    launch.setAttribute('aria-label', 'Ask Tawny, the OWL help assistant'); launch.title = 'Ask Tawny (drag to move)';
    var seen = false;
    try { seen = sessionStorage.getItem('owlHelpBotHint') === '1'; } catch (e) { }
    if (seen) launch.classList.add('compact');
    var lbl = el('span', 'lbl', 'Ask Tawny'); lbl.setAttribute('aria-hidden', 'true');
    var qb = el('span', 'q', '?'); qb.setAttribute('aria-hidden', 'true');
    launch.appendChild(limg); launch.appendChild(lbl); launch.appendChild(qb);

    var hint = el('div', 'hint', 'Questions about applying for data? Ask Tawny.');
    hint.setAttribute('aria-hidden', 'true'); hint.hidden = true;

    var chat = el('section', 'chat'); chat.id = 'chat'; chat.hidden = true;
    chat.setAttribute('role', 'dialog'); chat.setAttribute('aria-label', 'Tawny, the OWL help assistant');

    var head = el('div', 'head');
    var who = el('div', 'who');
    var himg = el('img'); himg.onerror = function () { var f = el('span', 'fb-owl', '🦉'); f.setAttribute('aria-hidden', 'true'); if (himg.parentNode) himg.parentNode.replaceChild(f, himg); }; himg.src = owlUrl; himg.alt = '';
    var wt = el('div'); var wn = el('strong', null, 'Tawny'); var ws = el('span', null, 'OWL’s help assistant · automated');
    wt.appendChild(wn); wt.appendChild(document.createElement('br')); wt.appendChild(ws);
    who.appendChild(himg); who.appendChild(wt);
    var reset = el('button', 'reset', 'Start over'); reset.type = 'button'; reset.setAttribute('aria-label', 'Start over and clear this conversation');
    var x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close help');
    var hr = el('div', 'hr'); hr.appendChild(reset); hr.appendChild(x);
    head.appendChild(who); head.appendChild(hr);

    var log = el('div', 'log'); log.setAttribute('aria-live', 'polite'); log.setAttribute('role', 'log');
    var th = el('div', 'th'); th.appendChild(el('span', null, 'Quick questions'));
    var tg = el('button', 'tg', 'Hide'); tg.type = 'button'; tg.setAttribute('aria-expanded', 'true'); tg.setAttribute('aria-label', 'Hide or show the quick questions');
    th.appendChild(tg);
    var tabs = el('div', 'tabs'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', 'Topics');
    var chips = el('div', 'chips');
    var form = el('form'); form.setAttribute('autocomplete', 'off');
    var input = el('input'); input.type = 'text'; input.id = 'q'; input.maxLength = 200;
    input.placeholder = 'Ask about applying for data…'; input.setAttribute('aria-label', 'Your question');
    var go = el('button', null, 'Ask'); go.type = 'submit';
    form.appendChild(input); form.appendChild(go);
    var foot = el('div', 'foot');
    foot.appendChild(document.createTextNode('General help only. Decisions about your application are made by the NSHD data sharing team.'));
    var fb = fixUrl(content.meta && content.meta.feedbackUrl);
    if (fb) {
      foot.appendChild(document.createTextNode(' '));
      var fa = el('a', null, 'Suggest a question or report a mistake'); fa.href = fb; fa.target = '_blank'; fa.rel = 'noopener';
      foot.appendChild(fa);
    }

    [head, log, th, tabs, chips, form, foot].forEach(function (n) { chat.appendChild(n); });
    root.appendChild(launch); root.appendChild(hint); root.appendChild(chat);
    document.body.appendChild(host);

    ui = { tg: tg, reset: reset, host: host, root: root, launch: launch, hint: hint, chat: chat, log: log, tabs: tabs, chips: chips, form: form, input: input, x: x, cur: content.groups[0].id };

    launch.addEventListener('click', function () { if (suppressClick) { suppressClick = false; return; } setOpen(chat.hidden); });
    x.addEventListener('click', function () { setOpen(false); launch.focus(); });
    root.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !chat.hidden) { setOpen(false); launch.focus(); } });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !chat.hidden) { setOpen(false); } });
    form.addEventListener('submit', function (e) { e.preventDefault(); var t = input.value.trim(); if (t) { input.value = ''; ask(t); } });
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-owl-help]') : null;
      if (t) { e.preventDefault(); setOpen(true); }
    });

    content.entries.forEach(function (e) { byId[e.id] = e; });
    ui.nav = { a: null, b: null };
    if (menuAreas()) {
      th.firstChild.textContent = 'Browse topics';
    } else {
      content.groups.forEach(function (g) {
        var b = el('button', null, g.label); b.type = 'button'; b.dataset.g = g.id;
        b.addEventListener('click', function () { ui.cur = g.id; drawChips(); });
        tabs.appendChild(b);
      });
    }
    drawChips();
    state = loadState();
    if (state.msgs.length) redraw(); else push({ k: 'greet' });
    reset.addEventListener('click', startOver);
    ui.pos = loadPos(); applyPos(); wireMove();
    tg.addEventListener('click', function () { setTray(ui.chat.classList.contains('min')); });
    window.addEventListener('storage', function (ev) {
      if (ev.key !== KEY) return;
      var st = loadState(); state.msgs = st.msgs; redraw();
      if (!st.msgs.length) greet(); /* shown only; nothing written, so tabs never overwrite each other */
    });

    /* first visit in a session: the full "Ask Tawny" pill for 6 seconds, then it shrinks to the owl with a ? badge */
    if (!seen) {
      setTimeout(function () { launch.classList.add('compact'); }, 6000);
      try { sessionStorage.setItem('owlHelpBotHint', '1'); } catch (e) { }
    }
  }

  /* ---------- movable button ----------
     The owl can be dragged anywhere. Its place is saved as a distance from the nearest edges
     (localStorage key owlHelpBot.pos), so it stays put on every page and after the window is resized.
     The chat window opens beside it, on the side with most room, and always fits on screen. */
  var POS_KEY = 'owlHelpBot.pos', EDGE = 4, suppressClick = false;

  function loadPos() {
    try {
      var p = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if (p && (p.ax === 'l' || p.ax === 'r') && (p.ay === 't' || p.ay === 'b') && isFinite(p.x) && isFinite(p.y)) return { ax: p.ax, ay: p.ay, x: +p.x, y: +p.y };
    } catch (e) { }
    return null;
  }
  function savePos(p) {
    try { if (p) localStorage.setItem(POS_KEY, JSON.stringify(p)); else localStorage.removeItem(POS_KEY); } catch (e) { }
  }
  function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), Math.max(lo, hi)); }

  function applyPos() {
    var L = ui.launch.style, p = ui.pos;
    if (!p) { L.left = L.right = L.top = L.bottom = ''; return; }
    var w = ui.launch.offsetWidth, h = ui.launch.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    var x = clamp(p.x, EDGE, vw - w - EDGE), y = clamp(p.y, EDGE, vh - h - EDGE);
    L.left = p.ax === 'l' ? x + 'px' : 'auto'; L.right = p.ax === 'r' ? x + 'px' : 'auto';
    L.top = p.ay === 't' ? y + 'px' : 'auto'; L.bottom = p.ay === 'b' ? y + 'px' : 'auto';
  }
  function setPosFromTopLeft(left, top) {
    var w = ui.launch.offsetWidth, h = ui.launch.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    left = clamp(left, EDGE, vw - w - EDGE); top = clamp(top, EDGE, vh - h - EDGE);
    var right = left + w > vw / 2 + w / 2 ? true : false, bottom = top + h > vh / 2 + h / 2 ? true : false;
    ui.pos = { ax: right ? 'r' : 'l', x: right ? vw - (left + w) : left, ay: bottom ? 'b' : 't', y: bottom ? vh - (top + h) : top };
    applyPos();
    if (!ui.chat.hidden) placeChat();
  }

  /* put the chat window next to the button, on the roomier side, sized to the space available */
  function placeChat() {
    var c = ui.chat.style, GAP = 10, M = 8, vw = window.innerWidth, vh = window.innerHeight;
    if (vw <= 600) { c.top = c.bottom = c.left = c.right = c.maxHeight = c.width = ''; return; } /* phones: full screen (CSS) */
    var r = ui.launch.getBoundingClientRect();
    var width = Math.min(420, vw - 32);
    var above = r.top - GAP - M, below = vh - r.bottom - GAP - M;
    var preferAbove = (r.top + r.height / 2) > vh / 2;
    var useAbove = preferAbove ? (above >= 300 || above >= below) : !(below >= 300 || below >= above);
    c.width = width + 'px';
    var side = false;
    if (Math.max(above, below) < 300) {
      /* not enough height above or below: use the full height of the window and sit beside the owl if there is room */
      c.top = M + 'px'; c.bottom = 'auto'; c.maxHeight = (vh - 2 * M) + 'px';
      var roomR = vw - r.right - GAP - M, roomL = r.left - GAP - M;
      if (roomR >= width) { c.left = (r.right + GAP) + 'px'; c.right = 'auto'; side = true; }
      else if (roomL >= width) { c.right = (vw - r.left + GAP) + 'px'; c.left = 'auto'; side = true; }
    }
    else if (useAbove) { c.bottom = (vh - r.top + GAP) + 'px'; c.top = 'auto'; c.maxHeight = Math.max(260, above) + 'px'; }
    else { c.top = (r.bottom + GAP) + 'px'; c.bottom = 'auto'; c.maxHeight = Math.max(260, below) + 'px'; }
    if (side) return;
    if ((r.left + r.width / 2) > vw / 2) { c.right = clamp(vw - r.right, M, vw - width - M) + 'px'; c.left = 'auto'; }
    else { c.left = clamp(r.left, M, vw - width - M) + 'px'; c.right = 'auto'; }
  }

  function wireMove() {
    var launch = ui.launch, drag = null;
    launch.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      var r = launch.getBoundingClientRect();
      drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, moved: false };
      /* capture at once, so a fast flick that leaves the button is still followed */
      try { launch.setPointerCapture(e.pointerId); } catch (x) { }
    });
    launch.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!drag.moved) {
        if (Math.abs(dx) + Math.abs(dy) < 6) return;
        drag.moved = true; launch.classList.add('dragging');
      }
      setPosFromTopLeft(drag.ox + dx, drag.oy + dy);
      e.preventDefault();
    });
    function end(e) {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      var moved = drag.moved; drag = null; launch.classList.remove('dragging');
      if (moved) { savePos(ui.pos); suppressClick = true; setTimeout(function () { suppressClick = false; }, 350); track('help_bot_moved'); }
    }
    launch.addEventListener('pointerup', end); launch.addEventListener('pointercancel', end);
    /* keyboard: Shift + arrow keys move the button */
    launch.addEventListener('keydown', function (e) {
      if (!e.shiftKey || !/^Arrow(Left|Right|Up|Down)$/.test(e.key)) return;
      e.preventDefault();
      var r = launch.getBoundingClientRect(), step = 24;
      setPosFromTopLeft(r.left + (e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0), r.top + (e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0));
      savePos(ui.pos);
    });
    /* double-click puts it back in the default corner */
    launch.addEventListener('dblclick', function () { ui.pos = null; savePos(null); applyPos(); if (!ui.chat.hidden) placeChat(); });
    window.addEventListener('resize', function () { applyPos(); if (!ui.chat.hidden) placeChat(); });
    window.addEventListener('storage', function (ev) { if (ev.key === POS_KEY) { ui.pos = loadPos(); applyPos(); if (!ui.chat.hidden) placeChat(); } });
  }

  function setOpen(open, quiet) {
    ui.chat.hidden = !open;
    if (open) placeChat();
    ui.launch.setAttribute('aria-expanded', String(open));
    ui.hint.classList.add('gone');
    if (open) { ui.launch.classList.add('compact'); if (ui.chat.dataset.t !== '1') { ui.chat.dataset.t = '1'; track('help_bot_open'); } }
    if (open) { if (!quiet) ui.input.focus(); ui.log.scrollTop = ui.log.scrollHeight; }
  }

  /* ---------- topic menu ----------
     When help-bot-content.json has a "menu" block, the quick questions become a three-step menu:
     area, then topic, then question. Without a menu block the old topic tabs are used. */
  function menuAreas() {
    var m = content.menu;
    if (!m || !Array.isArray(m.areas)) return null;
    var out = [];
    m.areas.forEach(function (a) {
      var topics = [];
      (a.topics || []).forEach(function (t) {
        var items = (t.entries || []).map(function (id) { return byId[id]; }).filter(Boolean);
        if (items.length) topics.push({ label: t.label, items: items });
      });
      if (topics.length || a.id === 'vars') out.push({ id: a.id, label: a.label, topics: topics });
    });
    return out.length ? out : null;
  }
  function mbtn(label, fn, cls) {
    var b = el('button', cls || null, label); b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  }
  function askFromMenu(e) {
    track('help_bot_answer', { answer_id: e.id, via: 'menu' });
    addMe(e.question); addAns(e, []);
  }
  function drawMenu() {
    var areas = menuAreas(), nav = ui.nav, A = null, T = null;
    areas.forEach(function (a) { if (a.id === nav.a) A = a; });
    if (!A) { nav.a = null; nav.b = null; }
    if (A && nav.b !== null && A.topics[nav.b]) T = A.topics[nav.b]; else nav.b = null;
    ui.chips.textContent = ''; ui.tabs.textContent = '';
    ui.tabs.style.display = A ? '' : 'none';
    ui.cur = (A && A.id === 'vars') ? 'vars' : content.groups[0].id;
    ui.input.placeholder = ui.cur === 'vars' ? 'Type a topic, e.g. smoking…' : 'Ask about applying for data…';
    if (A) {
      ui.tabs.appendChild(mbtn('\u2190 Back', function () { if (nav.b !== null) nav.b = null; else nav.a = null; drawMenu(); }));
      ui.tabs.appendChild(mbtn('All topics', function () { nav.a = null; nav.b = null; drawMenu(); }));
      ui.tabs.appendChild(el('span', 'mcrumb', A.label + (T ? ' \u203a ' + T.label : '')));
    }
    if (!A) {
      areas.forEach(function (a) { ui.chips.appendChild(mbtn(a.label, function () { nav.a = a.id; nav.b = null; track('help_bot_menu', { menu_area: a.id }); drawMenu(); })); });
      var ma = ((content.menu && content.menu.mostAsked) || []).map(function (id) { return byId[id]; }).filter(Boolean);
      if (ma.length) {
        ui.chips.appendChild(el('p', 'ml', 'Most asked'));
        ma.forEach(function (e) { ui.chips.appendChild(mbtn(e.question, function () { askFromMenu(e); })); });
      }
      return;
    }
    if (!T) {
      if (A.id === 'vars') {
        var vf = content.variableFinder || {};
        ui.chips.appendChild(el('p', 'vhint', vf.hint || 'Type a topic in the box, or try one of these:'));
        (content.varExamples || []).forEach(function (t) {
          ui.chips.appendChild(mbtn(t, function () { addMe(t); push({ k: 'vars', q: t, via: 'example' }); }));
        });
        if (A.topics.length) ui.chips.appendChild(el('p', 'ml', 'More about variables'));
      }
      A.topics.forEach(function (t, i) { ui.chips.appendChild(mbtn(t.label + ' \u203a', function () { nav.b = i; drawMenu(); }, 'tp')); });
      return;
    }
    T.items.forEach(function (e) { ui.chips.appendChild(mbtn(e.question, function () { askFromMenu(e); })); });
  }

  function drawChips() {
    if (ui.nav && menuAreas()) { drawMenu(); return; }
    ui.chips.textContent = '';
    ui.input.placeholder = ui.cur === 'vars' ? 'Type a topic, e.g. smoking…' : 'Ask about applying for data…';
    if (ui.cur === 'vars') {
      var vf = content.variableFinder || {};
      ui.chips.appendChild(el('p', 'vhint', vf.hint || 'Type a topic in the box, or try one of these:'));
      (content.varExamples || []).forEach(function (t) {
        var b = el('button', null, t); b.type = 'button';
        b.addEventListener('click', function () { addMe(t); push({ k: 'vars', q: t, via: 'example' }); });
        ui.chips.appendChild(b);
      });
      Array.prototype.forEach.call(ui.tabs.children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.g === ui.cur)); });
      return;
    }
    content.entries.filter(function (e) { return e.group === ui.cur; }).forEach(function (e) {
      var b = el('button', null, e.question); b.type = 'button';
      b.addEventListener('click', function () { track('help_bot_answer', { answer_id: e.id, via: 'topic_button' }); addMe(e.question); addAns(e, []); });
      ui.chips.appendChild(b);
    });
    Array.prototype.forEach.call(ui.tabs.children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.g === ui.cur)); });
  }

  function say(text, cls) {
    var m = el('div', 'msg ' + cls);
    if (typeof text === 'string') m.textContent = text;
    ui.log.appendChild(m); ui.log.scrollTop = ui.log.scrollHeight;
    return m;
  }

  function linkRow(links) {
    var row = el('div', 'links');
    (links || []).forEach(function (l) {
      var u = fixUrl(l.url); if (!u) return;
      var a = el('a', null, l.label); a.href = u; a.target = '_blank'; a.rel = 'noopener';
      a.addEventListener('click', function () { track('help_bot_link_click', { link_label: String(l.label).slice(0, 60) }); });
      row.appendChild(a);
    });
    return row.childNodes.length ? row : null;
  }

  function answer(e, related) {
    var m = say(null, 'bot');
    safeHtml(e.answer, m);
    if (DRAFT && e.tbc) { m.appendChild(el('div', 'tbc', 'To confirm with LHA: ' + e.tbc)); }
    var lr = linkRow(e.links); if (lr) m.appendChild(lr);
    var d = fmtDate(e.reviewed);
    if (d) m.appendChild(el('div', 'meta', 'Last reviewed ' + d));
    if (related && related.length) {
      var row = el('div', 'links');
      row.appendChild(el('span', 'meta', 'Related: '));
      related.forEach(function (r) {
        var b = el('button', 'alt', r.question); b.type = 'button';
        b.addEventListener('click', function () { track('help_bot_answer', { answer_id: r.id, via: 'related' }); addMe(r.question); addAns(r, []); });
        row.appendChild(b);
      });
      m.appendChild(row);
    }
    ui.log.scrollTop = ui.log.scrollHeight;
  }

  function greet() {
    var m = say(null, 'bot');
    m.appendChild(el('p', null, 'Hello, I’m Tawny, OWL’s automated help assistant. I can answer common questions about applying for NSHD data: the steps, the forms, baskets and what happens after you apply.'));
    m.appendChild(el('p', null, 'Pick a topic below, or type your own question.'));
  }

  /* ---------- conversation memory ----------
     The last 20 messages are kept in this browser (localStorage), like the basket, so the chat survives page
     changes and new tabs. Nothing is sent anywhere. Only the typed words and the ids of the answers shown are
     stored, never page content. It is cleared by "Start over" and expires after 24 hours of inactivity. */
  var KEY = 'owlHelpBot.v1', MAXMSG = 20, TTL = 24 * 3600 * 1000;
  var state = { msgs: [], open: false, ts: 0 };
  var byId = {};

  function loadState() {
    var st = { msgs: [], open: false, ts: 0 };
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (raw && raw.ts && Date.now() - raw.ts < TTL && Array.isArray(raw.msgs)) {
        st.open = raw.open === true; st.ts = raw.ts;
        st.msgs = raw.msgs.filter(function (m) {
          return m && ((m.k === 'me' && typeof m.text === 'string') || (m.k === 'ans' && byId[m.id]) || (m.k === 'vars' && typeof m.q === 'string') || (m.k === 'var' && typeof m.name === 'string') || /^(greet|hello|thanks|none)$/.test(m.k));
        }).slice(-MAXMSG);
      }
    } catch (e) { }
    return st;
  }
  function saveState() {
    state.ts = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { }
  }

  function renderItem(it) {
    if (it.k === 'me') { say(it.text, 'me'); return; }
    if (it.k === 'greet') { greet(); return; }
    if (it.k === 'hello') { say(null, 'bot').appendChild(el('p', null, 'Hello. What would you like to know about applying for data?')); return; }
    if (it.k === 'thanks') { say(null, 'bot').appendChild(el('p', null, 'You’re welcome.')); return; }
    if (it.k === 'none') {
      var f = say(null, 'bot');
      f.appendChild(el('p', null, 'I couldn’t find an answer to that. Try one of the topics below, or contact the NSHD data sharing team.'));
      var cu = fixUrl(content.meta && content.meta.contactUrl);
      var lr = linkRow(cu ? [{ label: 'Contact the team', url: cu }] : []);
      if (lr) f.appendChild(lr);
      return;
    }
    if (it.k === 'vars' || it.k === 'var') { renderVars(it, true); return; }
    if (it.k === 'ans') {
      var rel = (it.rel || []).map(function (id) { return byId[id]; }).filter(Boolean);
      answer(byId[it.id], rel);
    }
  }
  function push(it) {
    state.msgs.push(it);
    if (state.msgs.length > MAXMSG) state.msgs = state.msgs.slice(-MAXMSG);
    if (it.k === 'vars' || it.k === 'var') renderVars(it, false); else renderItem(it);
    while (ui.log.children.length > MAXMSG) ui.log.removeChild(ui.log.firstChild);
    saveState();
  }
  function redraw() {
    ui.log.textContent = '';
    state.msgs.forEach(renderItem);
    ui.log.scrollTop = ui.log.scrollHeight;
  }
  function addMe(text) { push({ k: 'me', text: String(text).slice(0, 200) }); }
  function addAns(e, rel) { push({ k: 'ans', id: e.id, rel: (rel || []).map(function (r) { return r.id; }) }); }
  function startOver() {
    track('help_bot_start_over');
    state.msgs = []; ui.log.textContent = ''; setTray(true);
    push({ k: 'greet' });
    ui.input.focus();
  }

  function ask(text) {
    addMe(text);
    var t = norm(text).trim();
    if (/^(hi|hello|hey|good (morning|afternoon|evening))\b/.test(t) && t.split(' ').length <= 3) { push({ k: 'hello' }); return; }
    if (/^(thanks|thank you|cheers)\b/.test(t)) { push({ k: 'thanks' }); return; }
    var r = findAnswers(text);
    var finder = (content.variableFinder || {}).enabled !== false;
    if (finder && ui.cur === 'vars') { push({ k: 'vars', q: text, via: 'finder_tab' }); return; }
    if (finder && looksLikeVarQuery(text)) { push({ k: 'vars', q: text, topic: varTopic(text), via: 'typed' }); return; }
    if (r.best) { track('help_bot_answer', { answer_id: r.best.id, via: 'typed' }); addAns(r.best, r.related || []); }
    else if (finder) { push({ k: 'vars', q: text, fallback: true, via: 'typed_fallback' }); }
    else { track('help_bot_no_match'); push({ k: 'none' }); }
  }


  /* ---------- variable finder ----------
     Searches help-bot-variables.json (built from the public data dictionary and the approved-project lists by
     build_variable_index.py). It is loaded the first time someone looks for variables. Results are ranked by how
     well the words match, then nudged up by how many approved projects requested the variable. */
  var VARS = null, VARS_PROMISE = null;
  var PAGE = 8;

  function loadVars() {
    if (VARS_PROMISE) return VARS_PROMISE;
    VARS_PROMISE = fetch(varsUrl, { credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      if (!j || !j.v || !j.v.length || !j.ctx) throw new Error('empty variable file');
      prepVars(j); VARS = j; return j;
    }).catch(function (e) { VARS_PROMISE = null; throw e; });
    return VARS_PROMISE;
  }

  function prepVars(j) {
    var stop = tokensIndex.stop, df = {}, nameAt = {};
    var ctxTok = j.ctx.map(function (c) { var o = {}; tokens(c, stop).forEach(function (t) { o[t] = 1; }); return o; });
    j.docs = j.v.map(function (r, i) {
      var lab = {}; tokens(r[1], stop).forEach(function (t) { lab[t] = 1; });
      nameAt[String(r[0]).toLowerCase()] = i;
      Object.keys(lab).forEach(function (t) { df[t] = (df[t] || 0) + 1; });
      return { lab: lab, ctx: ctxTok[r[2]] || {}, name: String(r[0]).toLowerCase() };
    });
    Object.keys(ctxTok).forEach(function () { });
    j.df = df; j.nameAt = nameAt; j.N = j.v.length;
    var syn = [], s = content.varSynonyms || {};
    Object.keys(s).forEach(function (k) {
      var phrases = [k].concat(s[k]).map(function (p) { return norm(p); });
      var add = []; [k].concat(s[k]).forEach(function (p) { tokens(p, stop).forEach(function (t) { if (add.indexOf(t) < 0) add.push(t); }); });
      syn.push({ phrases: phrases, add: add });
    });
    j.syn = syn;
  }

  /* drop the "help me find variables for ..." wrapper so only the topic is searched */
  var VAR_FILLER = /^(variable|variables|find|search|searching|need|want|looking|look|for|data|about|related|relating|relate|on|measure|measures|measured|any|show|me|do|you|have|is|there|are|what|which|the|a|an|of|to|my|i|please|list|get|can|how|where|in|nshd|owl|that|with|and|some|available|include|including|collected|information|info|ask|asked|question|questions|study|my)$/;
  function varTopic(text) {
    return norm(text).trim().split(' ').filter(function (w) { return w && !VAR_FILLER.test(w); }).join(' ');
  }
  function looksLikeVarQuery(text) {
    var t = norm(text);
    return /\b(variables?|measures?|measured|data on|data about|questions? about|information on|info on)\b/.test(t) && varTopic(text).length > 0;
  }

  /* Words that mean the same thing (varSynonyms in the content file) are alternatives, not extra points:
     a variable gets credit for the best matching alternative, so it cannot win just by containing many of them. */
  function searchVars(text) {
    var j = VARS, ix = tokensIndex, hay = norm(text);
    var base = {}, baseKeys = [];
    tokens(text, ix.stop).forEach(function (t) { if (!base[t]) { base[t] = 1; baseKeys.push(t); } });
    var groups = [];
    j.syn.forEach(function (g) {
      for (var i = 0; i < g.phrases.length; i++) {
        if (hay.indexOf(g.phrases[i]) !== -1) { groups.push(g.add.filter(function (t) { return !base[t]; })); break; }
      }
    });
    var all = baseKeys.slice(); groups.forEach(function (g) { g.forEach(function (t) { if (all.indexOf(t) < 0) all.push(t); }); });
    var idf = {}; all.forEach(function (t) { idf[t] = Math.log(1 + j.N / ((j.df[t] || 0) + 1)); });
    var nb = baseKeys.length, out = [], best = 0;
    for (var i = 0; i < j.N; i++) {
      var d = j.docs[i], sc = 0, hit = 0, k, t;
      for (k = 0; k < nb; k++) {
        t = baseKeys[k];
        if (d.lab[t]) { sc += idf[t]; hit++; } else if (d.ctx[t]) { sc += idf[t] * 0.5; hit += 0.5; }
      }
      for (k = 0; k < groups.length; k++) {
        var gb = 0, g = groups[k];
        for (var m = 0; m < g.length; m++) {
          t = g[m]; var v = d.lab[t] ? idf[t] : d.ctx[t] ? idf[t] * 0.5 : 0;
          if (v > gb) gb = v;
        }
        sc += 0.6 * gb;
      }
      if (!sc) continue;
      var cover = nb ? hit / nb : 1;
      if (nb >= 2 && cover < 0.5) continue;
      sc = sc * (0.5 + 0.5 * cover);
      if (sc > best) best = sc;
      out.push([sc, i]);
    }
    /* drop weak matches, then rank: relevance first, nudged up by how many projects requested the variable */
    var floor = best * 0.3, ranked = [];
    /* anything at least 60% as relevant as the best match counts as equally relevant, so popularity decides the order among them */
    out.forEach(function (x) { if (x[0] >= floor) ranked.push([Math.min(1, x[0] / (0.6 * best)) * (1 + Math.log(1 + (j.v[x[1]][8] || 0))), x[1]]); });
    ranked.sort(function (a, b) { return b[0] - a[0] || a[1] - b[1]; });
    return ranked.map(function (x) { return x[1]; });
  }

  /* "childhood social class and heart attack, adjusting for smoking" -> separate topics */
  function splitTopics(text) {
    var parts = String(text).split(/\s+(?:and|vs\.?|versus|with|adjusting for|adjust for|adjusted for|controlling for|plus)\s+|[,;+]/i)
      .map(function (p) { return varTopic(p); }).filter(function (p) { return p; });
    var seen = {}; return parts.filter(function (p) { if (seen[p]) return false; seen[p] = 1; return true; }).slice(0, 4);
  }

  /* scroll so the start of a long answer is in view, not its end */
  function showTop(m) {
    var top = m.getBoundingClientRect().top - ui.log.getBoundingClientRect().top + ui.log.scrollTop - 8;
    ui.log.scrollTop = Math.max(0, top);
  }
  /* give long results room by folding the question tray; the visitor can open it again */
  function setTray(open) {
    ui.chat.classList.toggle('min', !open);
    ui.tg.textContent = open ? 'Hide' : 'Show questions';
    ui.tg.setAttribute('aria-expanded', String(open));
  }

  /* Hand the whole result list to the data dictionary page. The names are saved in this browser
     (localStorage, key owlHelpBot.results) and the page is opened with ?tawny=1; the dictionary page
     then shows just those variables so they can be added to the basket. Nothing is sent anywhere. */
  function openInDictionary(topic, ids) {
    var vf = content.variableFinder || {};
    var url = fixUrl(vf.resultsUrl);
    if (!url) return false;
    try {
      var names = ids.slice(0, 1000).map(function (i) { return VARS.v[i][0]; });
      localStorage.setItem('owlHelpBot.results', JSON.stringify({ q: String(topic).slice(0, 120), names: names, ts: Date.now() }));
    } catch (e) { return false; }
    track('help_bot_open_dictionary', { results: ids.length <= 5 ? '1-5' : ids.length <= 20 ? '6-20' : ids.length <= 100 ? '21-100' : '100+' });
    window.location.href = url + (url.indexOf('?') < 0 ? '?' : '&') + 'tawny=1';
    return true;
  }

  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

  function varCard(i, withPartners) {
    var j = VARS, r = j.v[i], flags = r[5], card = el('div', 'vcard');
    var top = el('div', 'vtop');
    top.appendChild(el('span', 'vn', r[0]));
    if (flags & 1) top.appendChild(el('span', 'badge b-r', 'Restricted'));
    if (flags & 2) top.appendChild(el('span', 'badge b-s', 'Sensitive'));
    card.appendChild(top);
    card.appendChild(el('div', 'vl', r[1]));
    var bits = [];
    if (r[3] >= 0 && j.files[r[3]]) bits.push('File: ' + j.files[r[3]]);
    if (r[4]) bits.push('Collected: ' + r[4]);
    var years = j.meta && j.meta.popularity_years;
    bits.push(r[8] ? 'Requested in ' + plural(r[8], 'project') + (years ? ' since ' + years[0] : '') : 'No requests recorded' + (years ? ' since ' + years[0] : ''));
    card.appendChild(el('div', 'vm', bits.join(' · ')));
    var vf = content.variableFinder || {};
    if (flags & 1) {
      var msg = r[6] >= 0 ? j.msgs[r[6]] : (vf.restrictedFallback || 'This variable is restricted. Please contact the NSHD data sharing team to ask how to request it.');
      card.appendChild(el('div', 'vwarn', msg));
    }
    if (flags & 2) {
      var why = r[7] >= 0 ? j.reasons[r[7]] : '';
      var note = el('div', 'vwarn s', (why ? 'Marked sensitive: ' + why.replace(/\.$/, '') + '. ' : 'Marked sensitive. ') + (vf.sensitiveNote || 'Extra checks may apply. Ask the data sharing team if you are unsure.'));
      card.appendChild(note);
      if (DRAFT && vf.sensitiveTbc) card.appendChild(el('div', 'tbc', 'To confirm with LHA: ' + vf.sensitiveTbc));
    }
    if (withPartners) {
      var pl = j.together[String(i)];
      if (pl && pl.length) {
        var row = el('div', 'vtog'); row.appendChild(el('span', 'meta', 'Often requested with: '));
        pl.slice(0, 5).forEach(function (pi) {
          var b = el('button', 'alt', j.v[pi][0]); b.type = 'button'; b.title = j.v[pi][1];
          b.addEventListener('click', function () { track('help_bot_variable_click', { via: 'requested_together' }); addMe(j.v[pi][0]); push({ k: 'var', name: j.v[pi][0] }); });
          row.appendChild(b);
        });
        card.appendChild(row);
      }
    }
    return card;
  }

  function renderVars(it, quiet) {
    var m = say(null, 'bot');
    m.appendChild(el('p', 'vload', 'Searching the variables…'));
    loadVars().then(function () {
      m.textContent = '';
      var vf = content.variableFinder || {};
      if (it.k === 'var') {
        var idx = VARS.nameAt[String(it.name).toLowerCase()];
        if (idx === undefined) { m.appendChild(el('p', null, 'I can’t find that variable.')); return; }
        m.appendChild(varCard(idx, true));
        m.appendChild(el('div', 'meta', 'Check the full details in OWL before you add it to a request.'));
        showTop(m); if (!quiet) setTray(false);
        return;
      }
      var topic = it.topic || it.q;
      var exact = VARS.nameAt[String(it.q).trim().toLowerCase()];
      if (exact !== undefined && !it.off) {
        m.appendChild(el('p', null, 'That is a variable name:'));
        m.appendChild(varCard(exact, true));
        m.appendChild(el('div', 'meta', vf.footer || 'Check the full details in OWL before you add a variable to a request.'));
        showTop(m); if (!quiet) setTray(false);
        return;
      }
      var parts = it.off ? [topic] : splitTopics(topic);
      if (parts.length > 1) {
        m.appendChild(el('p', null, 'I split that into ' + parts.length + ' topics. Here are the most requested variables for each:'));
        var any = false;
        parts.forEach(function (pt) {
          var r = searchVars(pt);
          m.appendChild(el('div', 'vsec', '“' + pt + '” · ' + (r.length > 200 ? 'over 200 match' : plural(r.length, 'variable'))));
          if (!r.length) { m.appendChild(el('div', 'vm', 'No variables found. Try another word.')); return; }
          any = true;
          r.slice(0, 4).forEach(function (i) { m.appendChild(varCard(i, false)); });
          var one = el('button', 'alt', 'More for “' + pt + '”'); one.type = 'button';
          one.addEventListener('click', function () { addMe(pt); push({ k: 'vars', q: pt, via: 'split_more' }); });
          var row = el('div', 'links'); row.appendChild(one);
          if ((content.variableFinder || {}).resultsUrl) {
            var op = el('button', 'alt cta', 'Open all ' + Math.min(r.length, 1000) + ' in the data dictionary'); op.type = 'button';
            op.addEventListener('click', function () {
              if (!openInDictionary(pt, r)) { op.disabled = true; op.textContent = 'Could not open (browser storage is blocked)'; }
            });
            row.appendChild(op);
          }
          m.appendChild(row);
        });
        m.appendChild(el('div', 'meta', 'These are suggestions to start from. Check each variable in OWL, and ask the data sharing team if you are unsure.'));
        showTop(m);
        if (!quiet) { setTray(false); track('help_bot_variable_search', { results: any ? 'multi' : '0', via: it.via || 'typed' }); }
        return;
      }
      var ids = searchVars(topic), off = it.off || 0, page = ids.slice(off, off + PAGE);
      if (!ids.length) {
        m.appendChild(el('p', null, it.fallback ? 'I couldn’t find an answer or a matching variable. Try a different word, one of the topics below, or contact the NSHD data sharing team.' : 'I couldn’t find a variable for that. Try a different word, for example “smoking”, “blood pressure” or “social class”.'));
        var cu = fixUrl(content.meta && content.meta.contactUrl);
        var lr = linkRow(cu ? [{ label: 'Contact the team', url: cu }] : []); if (lr) m.appendChild(lr);
        if (!quiet) track('help_bot_variable_search', { results: '0', via: it.via || 'typed' });
        return;
      }
      m.appendChild(el('p', null, (off ? 'More variables' : (ids.length > 200 ? 'Over 200 variables match' : plural(ids.length, 'variable') + ' found')) + ' for “' + topic + '”. ' + (off ? '' : 'The most requested come first.')));
      page.forEach(function (i, n) { m.appendChild(varCard(i, !off && n < 3)); });
      var left = ids.length - off - page.length;
      var foot = el('div', 'links');
      if (!off && (content.variableFinder || {}).resultsUrl) {
        var shown = Math.min(ids.length, 1000);
        var open = el('button', 'alt cta', 'Open ' + (ids.length > 1000 ? 'the top 1,000' : 'all ' + shown) + ' in the data dictionary'); open.type = 'button';
        open.title = 'See these variables in a table and add them to your basket';
        open.addEventListener('click', function () {
          if (!openInDictionary(topic, ids)) { open.disabled = true; open.textContent = 'Could not open the data dictionary (browser storage is blocked)'; }
        });
        foot.appendChild(open);
      }
      if (left > 0 && off + PAGE < 40) {
        var more = el('button', 'alt', 'Show ' + Math.min(PAGE, left) + ' more'); more.type = 'button';
        more.addEventListener('click', function () { more.disabled = true; push({ k: 'vars', q: it.q, topic: it.topic, off: off + PAGE }); });
        foot.appendChild(more);
      } else if (left > 0) {
        m.appendChild(el('p', 'meta', 'There are more. Try a more specific word to narrow it down.'));
      }
      if (foot.childNodes.length) m.appendChild(foot);
      m.appendChild(el('div', 'meta', vf.footer || 'Check the full details in OWL before you add a variable to a request.'));
      showTop(m);
      if (!quiet) { setTray(false); var n2 = ids.length; track('help_bot_variable_search', { results: n2 <= 5 ? '1-5' : n2 <= 20 ? '6-20' : '21+', via: it.via || 'typed' }); }
    }).catch(function () {
      m.textContent = '';
      m.appendChild(el('p', null, 'The variable search isn’t available right now. You can still search for variables in OWL.'));
    });
  }

  /* ---------- start ---------- */

  function start() {
    fetch(contentUrl, { credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      if (!j || !j.entries || !j.entries.length || !j.groups || !j.groups.length) throw new Error('empty content');
      content = j; buildIndex(); build();
    }).catch(function (err) {
      if (window.console) console.warn('Ask OWL help bot not started:', err && err.message);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
