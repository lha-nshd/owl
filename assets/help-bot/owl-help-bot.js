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
  var owlUrl = (script && script.getAttribute('data-owl')) || baseDir + 'tawny.svg';
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
    '.launch{position:fixed;z-index:2147483000;right:max(16px,env(safe-area-inset-right,0px));bottom:calc(16px + var(--owl-lift,0px) + env(safe-area-inset-bottom,0px));height:56px;padding:0 20px 0 12px;border:0;border-radius:999px;background:var(--plum);color:#fff;font-family:inherit;font-size:15px;font-weight:600;line-height:1;display:flex;align-items:center;gap:8px;cursor:pointer;box-shadow:0 6px 18px rgba(80,30,120,.35)}',
    '.launch img{height:36px;width:36px;display:block}',
    '.launch:hover{background:#5a0a94}',
    '.hint{position:fixed;z-index:2147483000;right:max(16px,env(safe-area-inset-right,0px));bottom:calc(86px + var(--owl-lift,0px) + env(safe-area-inset-bottom,0px));max-width:min(260px,calc(100vw - 32px));background:var(--card);color:var(--ink);border:1.5px solid var(--plum);border-radius:12px;padding:8px 12px;font-size:13px;line-height:1.4;box-shadow:0 6px 18px rgba(80,30,120,.2);transition:opacity .4s}',
    '.hint.gone{opacity:0;pointer-events:none}',
    '.chat{position:fixed;z-index:2147483001;right:max(16px,env(safe-area-inset-right,0px));bottom:calc(88px + var(--owl-lift,0px) + env(safe-area-inset-bottom,0px));width:min(420px,calc(100vw - 32px));max-height:calc(100vh - 120px);display:flex;flex-direction:column;background:var(--card);color:var(--ink);border:1.5px solid var(--plum);border-radius:14px;overflow:hidden;box-shadow:0 12px 36px rgba(80,30,120,.28);font-size:14px;line-height:1.5}',
    '.chat[hidden],.hint[hidden],.launch[hidden]{display:none}',
    '.head{background:var(--plum);color:#fff;padding:10px 12px 10px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px}',
    '.who{display:flex;align-items:center;gap:10px;min-width:0}',
    '.who img{height:38px;width:38px;display:block;flex:none}',
    '.who strong{font-size:16px}.who span{font-size:12px;opacity:.9}',
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
    '@media(prefers-reduced-motion:reduce){.hint{transition:none}}',
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
    var limg = el('img'); limg.src = owlUrl; limg.alt = ''; limg.setAttribute('aria-hidden', 'true');
    launch.appendChild(limg); launch.appendChild(document.createTextNode('Ask Tawny'));

    var hint = el('div', 'hint', 'Questions about applying for data? Ask Tawny.');
    hint.setAttribute('aria-hidden', 'true');

    var chat = el('section', 'chat'); chat.id = 'chat'; chat.hidden = true;
    chat.setAttribute('role', 'dialog'); chat.setAttribute('aria-label', 'Tawny, the OWL help assistant');

    var head = el('div', 'head');
    var who = el('div', 'who');
    var himg = el('img'); himg.src = owlUrl; himg.alt = '';
    var wt = el('div'); var wn = el('strong', null, 'Tawny'); var ws = el('span', null, 'OWL’s help assistant · automated');
    wt.appendChild(wn); wt.appendChild(document.createElement('br')); wt.appendChild(ws);
    who.appendChild(himg); who.appendChild(wt);
    var x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close help');
    head.appendChild(who); head.appendChild(x);

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

    ui = { host: host, root: root, launch: launch, hint: hint, chat: chat, log: log, tabs: tabs, chips: chips, form: form, input: input, x: x, cur: content.groups[0].id };

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
    greet();

    var seen = false;
    try { seen = sessionStorage.getItem('owlHelpBotHint') === '1'; } catch (e) { }
    if (seen) { hint.hidden = true; }
    else {
      setTimeout(function () { hint.classList.add('gone'); }, 7000);
      try { sessionStorage.setItem('owlHelpBotHint', '1'); } catch (e) { }
    }
  }

  function setOpen(open) {
    ui.chat.hidden = !open;
    ui.launch.setAttribute('aria-expanded', String(open));
    ui.hint.classList.add('gone');
    if (open) { ui.input.focus(); ui.log.scrollTop = ui.log.scrollHeight; }
  }

  function drawChips() {
    ui.chips.textContent = '';
    content.entries.filter(function (e) { return e.group === ui.cur; }).forEach(function (e) {
      var b = el('button', null, e.question); b.type = 'button';
      b.addEventListener('click', function () { say(e.question, 'me'); answer(e); });
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
      row.appendChild(a);
    });
    return row.childNodes.length ? row : null;
  }

  function answer(e) {
    var m = say(null, 'bot');
    safeHtml(e.answer, m);
    if (DRAFT && e.tbc) { m.appendChild(el('div', 'tbc', 'To confirm with LHA: ' + e.tbc)); }
    var lr = linkRow(e.links); if (lr) m.appendChild(lr);
    var d = fmtDate(e.reviewed);
    if (d) m.appendChild(el('div', 'meta', 'Last reviewed ' + d));
    ui.log.scrollTop = ui.log.scrollHeight;
  }

  function greet() {
    var m = say(null, 'bot');
    m.appendChild(el('p', null, 'Hello, I’m Tawny, OWL’s automated help assistant. I can answer common questions about applying for NSHD data: the steps, the forms, baskets and what happens after you apply.'));
    m.appendChild(el('p', null, 'Pick a question below, or type your own.'));
  }

  function ask(text) {
    say(text, 'me');
    var t = norm(text).trim();
    if (/^(hi|hello|hey|good (morning|afternoon|evening))\b/.test(t) && t.split(' ').length <= 3) {
      var g = say(null, 'bot'); g.appendChild(el('p', null, 'Hello. What would you like to know about applying for data?')); return;
    }
    if (/^(thanks|thank you|cheers)\b/.test(t)) {
      var th = say(null, 'bot'); th.appendChild(el('p', null, 'You’re welcome.')); return;
    }
    var r = findAnswers(text);
    if (r.best) {
      answer(r.best);
      if (r.related.length) {
        var m = ui.log.lastChild;
        var row = el('div', 'links');
        row.appendChild(el('span', 'meta', 'Related: '));
        r.related.forEach(function (e) {
          var b = el('button', 'alt', e.question); b.type = 'button';
          b.addEventListener('click', function () { say(e.question, 'me'); answer(e); });
          row.appendChild(b);
        });
        m.appendChild(row);
      }
    } else {
      var f = say(null, 'bot');
      f.appendChild(el('p', null, 'I couldn’t find an answer to that. Try one of the topics below, or contact the NSHD data sharing team.'));
      var cu = fixUrl(content.meta && content.meta.contactUrl);
      var lr = linkRow(cu ? [{ label: 'Contact the team', url: cu }] : []);
      if (lr) f.appendChild(lr);
    }
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
