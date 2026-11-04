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
 *   data-analytics="off" turn off the optional Google Analytics events (see track() below)
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
  var owlUrl = (script && script.getAttribute('data-owl')) || OWL_BUILTIN;
  var DRAFT = /[?&]helpbot=draft\b/.test(location.search);

  var content = null;
  var api = {
    open: function () { if (ui) setOpen(true); },
    close: function () { if (ui) setOpen(false); },
    ask: function (text) { if (ui) { setOpen(true); ask(text); } },
    match: function (text) { return content ? findAnswers(text) : null; }
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
    '.log{background:#241338;padding:14px;display:flex;flex-direction:column;gap:12px;overflow-y:auto;min-height:150px;flex:1 1 auto;max-height:340px}',
    '.msg{max-width:94%;padding:9px 12px;border-radius:12px;overflow-wrap:anywhere}',
    '.me{align-self:flex-end;background:#7c2fc4;color:#fff;border-bottom-right-radius:3px}',
    '.bot{align-self:flex-start;background:#fff;border-bottom-left-radius:3px;width:94%}',
    '.bot p{margin:0 0 8px}.bot ul,.bot ol{margin:0 0 8px;padding-left:20px}.bot li{margin-bottom:3px}.bot>*:last-child{margin-bottom:0}',
    '.tbc{display:inline-block;margin:2px 0 8px;padding:3px 8px;border-radius:6px;background:#fff1d6;color:#7a4f00;border:1px solid #e0b04a;font-size:12px}',
    '.links{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}',
    '.links a,.alt{font:inherit;font-size:12.5px;padding:4px 10px;border-radius:999px;border:1px solid var(--plum);background:transparent;color:#5b0b95;text-decoration:none;cursor:pointer}',
    '.links a:hover,.alt:hover{background:var(--plum);color:#fff}',
    '.meta{margin-top:8px;font-size:11.5px;color:var(--muted)}',
    '.tabs{display:flex;flex-wrap:wrap;gap:6px;padding:12px 14px 10px;background:#fff7e6;border-top:3px solid #f5a623}.tabs::before{content:"Quick questions";flex:0 0 100%;font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:#8a5a00;margin-bottom:2px}',
    '.tabs button{font:inherit;font-size:12.5px;padding:4px 10px;border-radius:999px;border:0;background:#fbe9c4;color:#6b4a00;cursor:pointer}',
    '.tabs button[aria-pressed="true"]{background:#8a5a00;color:#fff}',
    '.chips{display:flex;flex-wrap:wrap;gap:7px;padding:0 14px 12px;background:#fff7e6}',
    '.chips button{font:inherit;font-size:13px;font-weight:600;padding:6px 12px;border-radius:999px;border:0;background:#f5a623;color:#2a1a00;cursor:pointer;text-align:left}',
    '.chips button:hover{background:#e8941a}',
    'form{display:flex;gap:8px;padding:10px 14px 8px;background:#fff7e6}',
    'input{flex:1;min-width:0;font:inherit;font-size:14px;padding:9px 11px;border-radius:999px;border:2px solid #f5a623;background:#fff;color:var(--ink)}',
    'form button{font:inherit;font-weight:700;padding:9px 18px;border-radius:999px;border:0;background:#241338;color:#fff;cursor:pointer}',
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
    launch.setAttribute('aria-label', 'Ask Tawny, the OWL help assistant'); launch.title = 'Ask Tawny';
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

    [head, log, tabs, chips, form, foot].forEach(function (n) { chat.appendChild(n); });
    root.appendChild(launch); root.appendChild(hint); root.appendChild(chat);
    document.body.appendChild(host);

    ui = { reset: reset, host: host, root: root, launch: launch, hint: hint, chat: chat, log: log, tabs: tabs, chips: chips, form: form, input: input, x: x, cur: content.groups[0].id };

    launch.addEventListener('click', function () { setOpen(chat.hidden); });
    x.addEventListener('click', function () { setOpen(false); launch.focus(); });
    root.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !chat.hidden) { setOpen(false); launch.focus(); } });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !chat.hidden) { setOpen(false); } });
    form.addEventListener('submit', function (e) { e.preventDefault(); var t = input.value.trim(); if (t) { input.value = ''; ask(t); } });
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-owl-help]') : null;
      if (t) { e.preventDefault(); setOpen(true); }
    });

    content.groups.forEach(function (g) {
      var b = el('button', null, g.label); b.type = 'button'; b.dataset.g = g.id;
      b.addEventListener('click', function () { ui.cur = g.id; drawChips(); });
      tabs.appendChild(b);
    });
    drawChips();
    content.entries.forEach(function (e) { byId[e.id] = e; });
    state = loadState();
    if (state.msgs.length) redraw(); else push({ k: 'greet' });
    reset.addEventListener('click', startOver);
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

  function setOpen(open, quiet) {
    ui.chat.hidden = !open;
    ui.launch.setAttribute('aria-expanded', String(open));
    ui.hint.classList.add('gone');
    if (open) { ui.launch.classList.add('compact'); if (ui.chat.dataset.t !== '1') { ui.chat.dataset.t = '1'; track('help_bot_open'); } }
    if (open) { if (!quiet) ui.input.focus(); ui.log.scrollTop = ui.log.scrollHeight; }
  }

  function drawChips() {
    ui.chips.textContent = '';
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
    m.appendChild(el('p', null, 'Pick a question below, or type your own.'));
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
          return m && ((m.k === 'me' && typeof m.text === 'string') || (m.k === 'ans' && byId[m.id]) || /^(greet|hello|thanks|none)$/.test(m.k));
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
    if (it.k === 'ans') {
      var rel = (it.rel || []).map(function (id) { return byId[id]; }).filter(Boolean);
      answer(byId[it.id], rel);
    }
  }
  function push(it) {
    state.msgs.push(it);
    if (state.msgs.length > MAXMSG) state.msgs = state.msgs.slice(-MAXMSG);
    renderItem(it);
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
    state.msgs = []; ui.log.textContent = '';
    push({ k: 'greet' });
    ui.input.focus();
  }

  function ask(text) {
    addMe(text);
    var t = norm(text).trim();
    if (/^(hi|hello|hey|good (morning|afternoon|evening))\b/.test(t) && t.split(' ').length <= 3) { push({ k: 'hello' }); return; }
    if (/^(thanks|thank you|cheers)\b/.test(t)) { push({ k: 'thanks' }); return; }
    var r = findAnswers(text);
    if (r.best) { track('help_bot_answer', { answer_id: r.best.id, via: 'typed' }); addAns(r.best, r.related || []); }
    else { track('help_bot_no_match'); push({ k: 'none' }); }
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
