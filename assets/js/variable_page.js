/* variable_page.js
 * Shared rendering engine for every OWL variable metadata page.
 *
 * Replaces owl_variable_metadata_renderer.py's old _render_metadata_page(),
 * which built a full HTML string per variable server-side. This file is
 * loaded ONCE (cached by the browser thereafter) by every variable's tiny
 * stub page; each stub only sets window.OWL_VARIABLE_ID (or the page is
 * opened as variable.html?id=<varname>) and this script does the rest:
 * fetch {varname}.json (the "page" section of the unified sidecar JSON
 * owl_db_pipeline.py now writes) and render it into #owl-app.
 *
 * Panel-building functions here mirror the old Python panel_meta/
 * panel_linked/panel_docs/panel_cats/panel_vals/panel_dist functions
 * 1:1 in structure and colour scheme - just producing DOM/HTML strings
 * from JSON instead of from a Python `data` dict.
 */
(function () {
  "use strict";

  function esc(s) {
    if (s === null || s === undefined) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getVariableId() {
    if (window.OWL_VARIABLE_ID) return window.OWL_VARIABLE_ID;
    var params = new URLSearchParams(window.location.search);
    return params.get("id") || params.get("var") || "";
  }

  function dataBaseUrl() {
    // Where {varname}.json files live. variable_page.js/.css now live in
    // the site's shared assets/js and assets/css folders (loaded once,
    // cached across every variable), which is a DIFFERENT folder from
    // {varname}.json/{varname}.html - those still live together in
    // assets/variable_metadata/ (one stub page next to its own JSON).
    // So the data lives next to the CURRENT PAGE, not next to this
    // script - default to this page's own directory. Override by
    // setting window.OWL_DATA_BASEURL before this script loads (e.g. if
    // variable.html is ever served from a different path than its data).
    if (window.OWL_DATA_BASEURL) return window.OWL_DATA_BASEURL;
    var path = window.location.pathname;
    return path.slice(0, path.lastIndexOf("/") + 1);
  }

  // ── Panel: Metadata ───────────────────────────────────────────────────
  function renderMeta(page) {
    var rows = page.meta_rows.map(function (r) {
      var valCell = r.is_field_id
        ? '<a href="' + esc(page.field_id_url) + '" target="_blank">' + esc(r.value) + "</a>"
        : esc(r.value);
      return "<tr><td>" + esc(r.field) + "</td><td>" + valCell + "</td></tr>";
    }).join("");
    return (
      '<div class="vm-panel active" data-panel="meta">' +
      '<table class="vm-table"><tr><th style="width:13%">Field</th><th>Value</th></tr>' +
      rows +
      "</table></div>"
    );
  }

  // ── Panel: Linked & Longitudinal ────────────────────────────────────────
  // ── Trajectory page trigger, shared by the Distribution and Linked &
  // Longitudinal panels - same URL from both, so both open the identical
  // page. Real <a target="_blank">, not window.open(): bookmarkable,
  // shareable, works with ctrl/cmd-click, not subject to popup blockers.
  function trajectoryButtonHtml(page) {
    if (!page.truly_longitudinal) return "";
    var fid = page.truly_longitudinal.field_id;
    var url = page.site_baseurl + "/assets/variable_metadata/trajectory.html?fid=" +
      encodeURIComponent(fid) + "&via=" + encodeURIComponent(page.varname);
    return '<div class="traj-btn-row"><a class="traj-btn" href="' + esc(url) + '" target="_blank" rel="noopener">' +
      '<i class="ti ti-timeline" aria-hidden="true"></i>View all sweeps' +
      '<i class="ti ti-external-link" aria-hidden="true"></i></a></div>';
  }

  function renderLinked(page) {
    var siteBase = page.site_baseurl;
    var longUrl = siteBase + "/docs/search_methods/longitudinal_variables/longitudinal-variables/";

    var defBlock =
      '<div class="def-grid">' +
      '<div class="def-box def-purple"><div class="def-title" style="color:#534AB7;">' +
      '<i class="ti ti-link"></i> Truly Longitudinal <span class="tag-strict">Strict</span></div>' +
      '<div class="def-text">Variables sharing the <strong>same Showcase Field ID</strong> ' +
      "&mdash; identical question text and response coding across sweeps. Directly comparable " +
      "measurements guaranteed.</div></div>" +
      '<div class="def-box def-green"><div class="def-title" style="color:#1A6B45;">' +
      '<i class="ti ti-arrows-shuffle"></i> Linked variables <span class="tag-flexible">Flexible</span></div>' +
      '<div class="def-text">Variables connected by a shared linking measure &mdash; may include ' +
      "the same construct with different wording or coding. Review before treating as directly " +
      "comparable.</div></div></div>";

    var tlBody;
    if (page.truly_longitudinal) {
      var fid = page.truly_longitudinal.field_id;
      var members = page.truly_longitudinal.members;
      var fidOpenUrl = longUrl + "?fid=" + encodeURIComponent(fid) + "&open=true";
      var tlRows = members.map(function (m) {
        var vnUrl = siteBase + "/assets/variable_metadata/" + encodeURIComponent(m.varname) + ".html";
        var rowClass = m.is_current ? "tl-current" : "";
        var vnCell = m.is_current
          ? '<strong style="color:#1A6B45;">' + esc(m.varname) + "</strong>"
          : '<a href="' + esc(vnUrl) + '">' + esc(m.varname) + "</a>";
        var lblCell = esc(m.label) + (m.is_current
          ? ' <span style="font-size:9.5px;color:#888;font-style:italic;">(this variable)</span>'
          : "");
        var viewCell = m.is_current
          ? '<span class="tl-current-badge">Current</span>'
          : '<a class="tl-view" href="' + esc(fidOpenUrl) + '">View &#9654;</a>';
        return (
          '<tr class="' + rowClass + '"><td>' + vnCell + "</td><td>" + lblCell + "</td>" +
          '<td style="text-align:center!important;">' + esc(m.year) + "</td>" +
          '<td class="tl-check" style="text-align:center!important;">&#10003;</td>' +
          '<td style="text-align:center!important;">' + viewCell + "</td></tr>"
        );
      }).join("");

      tlBody =
        '<div class="tl-section"><div class="tl-header">' +
        '<span class="tl-title"><i class="ti ti-link"></i> Truly Longitudinal</span>' +
        '<span class="tl-badge">Field ID ' + esc(fid) + " &middot; " + members.length + ' variables</span>' +
        '<a class="tl-link" href="' + esc(fidOpenUrl) + '">&#8635; View all in Longitudinal Search &rarr;</a>' +
        "</div><table class=\"tl-table\"><thead><tr><th>Variable</th><th>Label</th>" +
        '<th style="text-align:center!important;">Year</th>' +
        '<th style="text-align:center!important;">Same coding</th>' +
        '<th style="text-align:center!important;">View trajectory</th></tr></thead><tbody>' +
        tlRows + "</tbody></table>" +
        '<p class="tl-note">All variables share Field ID ' + esc(fid) + " &mdash; identical coding guaranteed. " +
        '<a href="' + esc(fidOpenUrl) + '">Open Field ID ' + esc(fid) + " on Longitudinal Search page &rarr;</a></p></div>";
    } else {
      tlBody =
        '<div class="tl-section"><div class="tl-header">' +
        '<span class="tl-title"><i class="ti ti-link"></i> Truly Longitudinal</span></div>' +
        '<p style="color:#666;font-style:italic;margin:0;">No same-Field-ID longitudinal variables recorded.</p></div>';
    }

    var lvBody;
    if (page.linked_rows && page.linked_rows.length) {
      var lvRows = page.linked_rows.map(function (r) {
        var lvUrl = siteBase + "/assets/variable_metadata/" + encodeURIComponent(r.varname) + ".html";
        return (
          '<tr><td><a href="' + esc(lvUrl) + '">' + esc(r.varname) + "</a></td>" +
          "<td>" + esc(r.description) + "</td>" +
          '<td style="text-align:center!important;">' + esc(r.year) + "</td>" +
          '<td style="text-align:center!important;">' + esc(r.form) + "</td>" +
          '<td style="text-align:center!important;">' + esc(r.question) + "</td>" +
          "<td>" + esc(r.library_file) + "</td></tr>"
        );
      }).join("");
      var n = page.linked_rows.length;
      lvBody =
        '<div class="condor-section"><div class="condor-header">' +
        '<span class="condor-title"><i class="ti ti-arrows-shuffle"></i> Linked variables</span>' +
        '<span class="condor-badge">' + n + " additional variable" + (n !== 1 ? "s" : "") + "</span></div>" +
        '<p style="font-size:11px;color:#555;margin-bottom:10px;">Connected by a shared linking measure &mdash; different Field IDs. ' +
        "Review coding differences before treating as directly comparable.</p>" +
        '<table class="condor-table"><thead><tr><th>Variable</th><th>Description</th>' +
        '<th style="text-align:center!important;">Year</th><th style="text-align:center!important;">Form</th>' +
        '<th style="text-align:center!important;">Question</th><th>Library File</th></tr></thead><tbody>' +
        lvRows + "</tbody></table></div>";
    } else {
      lvBody =
        '<div class="condor-section"><div class="condor-header">' +
        '<span class="condor-title"><i class="ti ti-arrows-shuffle"></i> Linked variables</span>' +
        '<span class="condor-badge">0 additional variables</span></div>' +
        '<p style="color:#666;font-style:italic;margin:0;">No additional linked variables recorded.</p></div>';
    }

    return '<div class="vm-panel" data-panel="linked">' + trajectoryButtonHtml(page) + defBlock + tlBody + lvBody + "</div>";
  }

  // ── Panel: Documents ─────────────────────────────────────────────────
  function renderDocs(page) {
    var body;
    if (page.doc_rows && page.doc_rows.length) {
      var rows = page.doc_rows.map(function (d) {
        return (
          "<tr><td>" + esc(d.type) + '</td><td><a href="' + esc(d.url) + '" target="_blank">' +
          esc(d.text) + " &rarr;</a></td></tr>"
        );
      }).join("");
      body = '<table class="doc-table"><tr><th style="width:25%">Type</th><th>Link</th></tr>' + rows + "</table>";
    } else {
      body = '<p style="color:#666;font-style:italic;">No associated documents.</p>';
    }
    return '<div class="vm-panel" data-panel="docs">' + body + "</div>";
  }

  // ── Panel: Categories ─────────────────────────────────────────────────
  function renderCats(page) {
    var rows = page.cat_rows.map(function (c) {
      var cell;
      if (c.is_legacy) {
        cell = esc(c.category) + ' <span class="cat-legacy">Legacy</span>';
      } else if (c.url) {
        cell = '<a href="' + esc(c.url) + '">' + esc(c.category) + "</a>";
      } else {
        cell = esc(c.category);
      }
      return "<tr><td>" + cell + "</td><td>" + esc(c.description) + "</td></tr>";
    }).join("");
    return (
      '<div class="vm-panel" data-panel="cats">' +
      '<p style="font-size:13px;color:#555;margin:0 0 10px;">Click a current category name to open it in Browse by Category. ' +
      "Legacy categories are shown for reference only.</p>" +
      '<table class="cat-table"><tr><th style="width:30%">Category</th><th>Description</th></tr>' +
      rows + "</table></div>"
    );
  }

  // ── Panel: Value Labels ───────────────────────────────────────────────
  function renderVals(page) {
    var body;
    if (page.val_rows && page.val_rows.length) {
      var hasMissing = false;
      var rows = page.val_rows.map(function (v) {
        if (v.is_missing) hasMissing = true;
        var cls = v.is_missing ? ' class="vl-missing"' : "";
        return "<tr" + cls + "><td>" + esc(v.value) + "</td><td>" + esc(v.label) + "</td></tr>";
      }).join("");
      var note = hasMissing
        ? '<p style="font-size:11px;color:#7A2E2E;font-style:italic;margin:12px 0 0;display:flex;align-items:center;gap:6px;">' +
          '<span style="display:inline-block;width:10px;height:10px;background:#FBE3E3;border:1px solid #F0C5C5;' +
          'border-radius:2px;flex-shrink:0;"></span>' +
          "Values shown in this colour are missing-value codes - they are excluded from the plots and statistics " +
          "shown in the Distribution tab.</p>"
        : "";
      body = '<table class="vl-table"><tr><th style="width:20%">Value</th><th>Label</th></tr>' + rows + "</table>" + note;
    } else {
      body = '<p style="color:#666;font-style:italic;">No value labels recorded.</p>';
    }
    return '<div class="vm-panel" data-panel="vals">' + body + "</div>";
  }

  // ── Panel: Distribution (chart + stats) ─────────────────────────────────
  var PURPLE = { bar: "#9C87D6", edge: "#4A3F7A", bg: "#F3F0FA", grid: "#DFD9F0" };
  var AXIS_TEXT = "#222222";

  function shadeFor(i, n) {
    var dark = [0x4a, 0x3f, 0x7a], light = [0xc4, 0xb5, 0xe8];
    var t = n > 1 ? i / (n - 1) : 0;
    var rgb = dark.map(function (d, k) { return Math.round(d + (light[k] - d) * t); });
    return "rgb(" + rgb.join(",") + ")";
  }

  // "Nice" round tick step (1/2/5 x a power of 10), same idea as
  // d3.ticks()/matplotlib's default locator - so the x-axis gets several
  // evenly spaced, cleanly rounded values instead of just endpoints.
  function niceTicks(min, max, count) {
    if (min === max) return [min];
    var span = max - min;
    var rawStep = span / Math.max(count - 1, 1);
    var mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    var norm = rawStep / mag;
    var niceNorm = norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1;
    var step = niceNorm * mag;
    var start = Math.ceil(min / step) * step;
    var ticks = [];
    for (var v = start; v <= max + step * 1e-6; v += step) {
      ticks.push(Math.round(v / step) * step);
    }
    if (!ticks.length || ticks[0] > min + step * 0.4) ticks.unshift(min);
    if (ticks[ticks.length - 1] < max - step * 0.4) ticks.push(max);
    return ticks;
  }

  // Sets canvas backing-store resolution high enough that text stays
  // crisp regardless of the screen's own pixel density - low-DPI
  // screens (dpr 1) were the main cause of blurry/fuzzy chart text.
  function sizeCanvasCrisp(canvas, W, H) {
    var dpr = Math.max(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    var ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    return ctx;
  }

  // Container-driven width so the chart matches its column instead of a
  // fixed pixel size that could render larger than the space available.
  function containerWidth(canvas, fallback, max) {
    var w = (canvas.parentElement && canvas.parentElement.clientWidth) || fallback;
    return Math.max(280, Math.min(w, max));
  }

  function drawContinuousChart(canvas, chart, label) {
    var W = containerWidth(canvas, 620, 640);
    var H = Math.round(W * 0.6);
    var ctx = sizeCanvasCrisp(canvas, W, H);
    ctx.fillStyle = PURPLE.bg; ctx.fillRect(0, 0, W, H);

    var box = chart.boxplot, bins = chart.bins;
    var edges = bins.edges, counts = bins.counts;
    var xMin = edges[0], xMax = edges[edges.length - 1];
    var padL = 48, padR = 20, padT = 50, padBottom = 46;
    var boxH = 40, gapBoxHist = 12;
    var plotW = W - padL - padR;
    var histTop = padT + boxH + gapBoxHist;
    var histH = H - histTop - padBottom;
    var maxCount = Math.max.apply(null, counts.concat([1]));

    function xPos(v) { return padL + ((v - xMin) / (xMax - xMin || 1)) * plotW; }

    // Title
    ctx.fillStyle = PURPLE.edge;
    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.textAlign = "center";
    wrapText(ctx, label || "", W / 2, 18, W - 40, 15);

    // Box plot strip
    var midY = padT + boxH / 2;
    ctx.strokeStyle = PURPLE.bar; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(xPos(box.min), midY); ctx.lineTo(xPos(box.q1), midY);
    ctx.moveTo(xPos(box.q3), midY); ctx.lineTo(xPos(box.max), midY);
    ctx.stroke();
    ["min", "max"].forEach(function (k) {
      ctx.beginPath();
      ctx.moveTo(xPos(box[k]), midY - 7); ctx.lineTo(xPos(box[k]), midY + 7);
      ctx.stroke();
    });
    var bx = xPos(box.q1), bw = Math.max(xPos(box.q3) - xPos(box.q1), 1);
    ctx.fillStyle = "rgba(156,135,214,0.55)";
    ctx.fillRect(bx, midY - 14, bw, 28);
    ctx.strokeStyle = PURPLE.edge; ctx.strokeRect(bx, midY - 14, bw, 28);
    ctx.beginPath();
    ctx.moveTo(xPos(box.median), midY - 14); ctx.lineTo(xPos(box.median), midY + 14);
    ctx.lineWidth = 2; ctx.stroke();

    // Histogram gridlines
    ctx.strokeStyle = PURPLE.grid; ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g++) {
      var gy = histTop + histH - (g / 4) * histH;
      ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(W - padR, gy); ctx.stroke();
    }
    for (var i = 0; i < counts.length; i++) {
      var x0 = xPos(edges[i]), x1 = xPos(edges[i + 1]);
      var barH = (counts[i] / maxCount) * histH;
      ctx.fillStyle = PURPLE.bar;
      ctx.fillRect(x0 + 1, histTop + histH - barH, Math.max(x1 - x0 - 2, 1), barH);
      ctx.strokeStyle = PURPLE.edge; ctx.lineWidth = 0.6;
      ctx.strokeRect(x0 + 1, histTop + histH - barH, Math.max(x1 - x0 - 2, 1), barH);
    }
    // axes
    ctx.strokeStyle = PURPLE.edge; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, histTop + histH); ctx.lineTo(W - padR, histTop + histH); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(padL, histTop); ctx.lineTo(padL, histTop + histH); ctx.stroke();

    // x-axis ticks - several "nice" rounded values plus the exact
    // endpoints, not just min/mid/max, with black, legible labels and
    // a short tick mark down from the axis line for each.
    var ticks = niceTicks(xMin, xMax, 6);
    ctx.font = "10px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = AXIS_TEXT;
    ticks.forEach(function (v) {
      var tx = xPos(v);
      ctx.strokeStyle = PURPLE.edge; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(tx, histTop + histH); ctx.lineTo(tx, histTop + histH + 4); ctx.stroke();
      ctx.fillText(round4(v), tx, histTop + histH + 16);
    });

    ctx.save();
    ctx.fillStyle = AXIS_TEXT; ctx.font = "10px system-ui, sans-serif";
    ctx.translate(15, histTop + histH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("Frequency", 0, 0);
    ctx.restore();
    var unitLabel = chart.units ? "Value (" + chart.units + ")" : "Value";
    ctx.fillStyle = AXIS_TEXT; ctx.font = "10px system-ui, sans-serif"; ctx.textAlign = "center";
    ctx.fillText(unitLabel, padL + plotW / 2, H - 8);
  }

  function drawCategoricalChart(canvas, chart, label) {
    var bars = chart.bars, n = bars.length;
    var titleTop = 34;                    // room for the chart title
    var rowH = 34, axisH = 26, padT = titleTop + 16;
    var chartH = Math.max(padT + n * rowH + axisH + 70, 260);
    var W = containerWidth(canvas, 620, 640);
    var H = chartH;
    var ctx = sizeCanvasCrisp(canvas, W, H);
    ctx.fillStyle = PURPLE.bg; ctx.fillRect(0, 0, W, H);

    var padL = Math.round(W * 0.19), padR = 50;
    var maxCount = Math.max.apply(null, bars.map(function (b) { return b.count; }).concat([1]));
    var plotW = W - padL - padR;
    var LABEL_CUTOFF = 34;
    var tooLong = bars.some(function (b) { return (b.label || "").length > LABEL_CUTOFF; });
    var barsBottom = padT + n * rowH;

    // Title, same treatment as the continuous chart's - this was missing
    // entirely before.
    ctx.fillStyle = PURPLE.edge;
    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.textAlign = "center";
    wrapText(ctx, label || "", W / 2, 18, W - 40, 15);

    // x-axis gridlines + tick numbers, drawn first so bars sit on top -
    // matches the reference design (0 / 200 / 400 / ... style ticks
    // beneath the bars, not just a bare axis line).
    var ticks = niceTicks(0, maxCount, 6);
    ctx.strokeStyle = PURPLE.grid; ctx.lineWidth = 1;
    ctx.font = "10px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = AXIS_TEXT;
    ticks.forEach(function (v) {
      var tx = padL + (v / (maxCount || 1)) * plotW;
      ctx.beginPath(); ctx.moveTo(tx, padT); ctx.lineTo(tx, barsBottom); ctx.stroke();
    });

    // Bars - square corners (not rounded), with a bit more vertical
    // breathing room between rows than before.
    ctx.font = "11px system-ui, sans-serif";
    bars.forEach(function (b, i) {
      var y = padT + i * rowH;
      var w = (b.count / maxCount) * plotW;
      var barH = rowH - 12;
      ctx.fillStyle = shadeFor(i, n);
      ctx.fillRect(padL, y, Math.max(w, 2), barH);
      ctx.strokeStyle = PURPLE.edge; ctx.lineWidth = 0.8;
      ctx.strokeRect(padL, y, Math.max(w, 2), barH);
      ctx.fillStyle = AXIS_TEXT; ctx.textAlign = "left";
      ctx.fillText(String(b.count), padL + w + 6, y + barH / 2 + 4);
      ctx.textAlign = "right";
      var lbl = tooLong ? b.value : (b.label || b.value);
      if (lbl.length > 26) lbl = lbl.slice(0, 24) + "...";
      ctx.fillText(lbl, padL - 8, y + barH / 2 + 4);
    });

    // x-axis line + tick labels, directly beneath the bars.
    ctx.strokeStyle = PURPLE.edge; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, barsBottom); ctx.lineTo(W - padR, barsBottom); ctx.stroke();
    ctx.font = "10px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = AXIS_TEXT;
    ticks.forEach(function (v) {
      var tx = padL + (v / (maxCount || 1)) * plotW;
      ctx.beginPath(); ctx.moveTo(tx, barsBottom); ctx.lineTo(tx, barsBottom + 4); ctx.stroke();
      ctx.fillText(String(Math.round(v)), tx, barsBottom + 15);
    });

    // 100% stacked bar underneath - given more breathing room below the
    // axis than before, so it doesn't crowd the tick labels.
    var stackY = barsBottom + 42, stackH = 22;
    var total = bars.reduce(function (s, b) { return s + b.count; }, 0) || 1;
    var x = padL;
    var stackW = W - padL - padR;
    bars.forEach(function (b, i) {
      var w = (b.count / total) * stackW;
      ctx.fillStyle = shadeFor(i, n);
      ctx.fillRect(x, stackY, w, stackH);
      if (w > stackW * 0.05) {
        ctx.fillStyle = i < n / 2 ? "#fff" : PURPLE.edge;
        ctx.textAlign = "center"; ctx.font = "10px system-ui, sans-serif";
        ctx.fillText(Math.round((b.count / total) * 100) + "%", x + w / 2, stackY + stackH / 2 + 3);
      }
      x += w;
    });

    if (tooLong) {
      ctx.fillStyle = PURPLE.edge; ctx.font = "italic 10px system-ui, sans-serif"; ctx.textAlign = "center";
      ctx.fillText("Category labels are too long to display here - see the stats table for the full text.", W / 2, H - 6);
    }
  }

  function wrapText(ctx, text, cx, y, maxWidth, lineHeight) {
    var words = text.split(" "), line = "", lines = [];
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + " " + words[i] : words[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line); line = words[i];
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    lines.slice(0, 3).forEach(function (l, i) { ctx.fillText(l, cx, y + i * lineHeight); });
  }

  function round4(v) {
    if (typeof v !== "number") return v;
    return Math.round(v * 10000) / 10000;
  }

  function csvDataUri(rows, header) {
    var lines = [header].concat(rows.map(function (r) {
      return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(",");
    }));
    return "data:text/csv;charset=utf-8," + encodeURIComponent(lines.join("\n"));
  }

  function renderDist(page, varname) {
    // Computed once, reused in every return path below (including the
    // "unavailable" ones) - this variable having no distribution of its
    // own doesn't mean the rest of its Truly Longitudinal group doesn't.
    var trajBtn = trajectoryButtonHtml(page);

    // Two independent, sometimes-overlapping reasons a variable has no
    // Distribution tab content: is_genomic/is_plot_excluded (on the
    // plot-exclusion list - deliberately suppressed even though the data
    // could be plotted), or dist_type === "unavailable" (no codedas
    // table for this variable's data type at all - e.g. string/free-text
    // variables). Both render the same message - the reader doesn't need
    // to know which reason applies, just that this tab has nothing to
    // show for this variable. The variable still gets every other tab
    // (Metadata/Linked/Documents/Categories/Value Labels) either way.
    if (page.is_genomic || page.is_plot_excluded || page.dist_type === "unavailable" || !page.dist_type) {
      return (
        '<div class="vm-panel" data-panel="dist">' + trajBtn + '<p style="font-size:14px;color:#555;font-style:italic;">' +
        "Plots/Statistics are unavailable for this variable.</p></div>"
      );
    }
    if (!page.chart && (!page.freq_rows || !page.freq_rows.length)) {
      return '<div class="vm-panel" data-panel="dist">' + trajBtn + '<p style="font-size:14px;color:#555;font-style:italic;">Plots/Statistics are unavailable for this variable.</p></div>';
    }

    var isContinuous = page.dist_type === "continuous";
    var canvasId = "dist-canvas-" + Math.random().toString(36).slice(2);
    var plotHtml = '<div class="dist-plot-wrap"><canvas id="' + canvasId + '"></canvas></div>';
    var unitsHtml = (page.dist_units && isContinuous)
      ? '<p class="dist-units">All measurements in ' + esc(page.dist_units) + "</p>" : "";

    var legendHtml = "";
    if (isContinuous) {
      legendHtml =
        '<div class="dist-legend"><p>Reading the box plot</p><table>' +
        "<tr><td>Box</td><td>Middle 50% of values (25th&ndash;75th percentile)</td></tr>" +
        "<tr><td>Line in box</td><td>Median</td></tr>" +
        "<tr><td>Whiskers</td><td>Range excluding outliers</td></tr>" +
        "<tr><td>Ends</td><td>Minimum / maximum plotted value</td></tr>" +
        "</table></div>";
    }

    var downloadPngHtml =
      '<div class="dist-download-row"><button type="button" class="dist-download-btn" data-download-chart="' + canvasId + '" data-varname="' + esc(varname) + '">' +
      '<i class="ti ti-download" aria-hidden="true"></i> Download plot as image</button></div>';

    var statsHtml, note, displayedN = null;
    if (isContinuous) {
      var sizeKeys = { "series size": 1, series_size: 1, "displayed n": 1 };
      var summaryKeys = { minimum: 1, maximum: 1, range: 1, median: 1, iqr: 1 };
      var spreadKeys = { mean: 1, "std dev.": 1, variance: 1 };
      var summary = [], spread = [], deciles = [];
      page.freq_rows.forEach(function (r) {
        var key = String(r[0]).toLowerCase();
        if (sizeKeys[key]) displayedN = r[1];
        else if (summaryKeys[key]) summary.push(r);
        else if (spreadKeys[key]) spread.push(r);
        else deciles.push(r);
      });
      function box(cls, title, rows) {
        var body = rows.map(function (r) {
          return "<tr><td>" + esc(r[0]) + "</td><td>" + esc(r[1]) + "</td></tr>";
        }).join("");
        return '<div class="dist-stat-box ' + cls + '"><p>' + title + "</p><table>" + body + "</table></div>";
      }
      statsHtml = box("box-summary", "Summary", summary) + box("box-spread", "Spread", spread) + box("box-deciles", "Deciles", deciles);
      note = "Missing values and distribution outside 5th and 95th percentiles removed from both the plot above and the statistics above.";
    } else {
      // Value -> label lookup, straight from the chart's own bar data
      // (already resolved via build_distribution()'s _label_for() on the
      // Python side) - NOT built by reformatting page.freq_rows itself,
      // since freq_rows[i][0] has to stay the raw, unlabelled value for
      // _build_sidecar()'s category_counts parsing (it does
      // float(item_text) to look the label up FROM the value - a value
      // already containing "— label" text would break that parse). This
      // keeps the display-only "value — label" formatting entirely
      // separate from that data contract.
      var labelByValue = {};
      if (page.chart && page.chart.bars) {
        page.chart.bars.forEach(function (b) { labelByValue[String(b.value)] = b.label; });
      }
      var hasPct = page.freq_rows.some(function (r) { return r.length > 2; });
      var rowsHtml = "";
      page.freq_rows.forEach(function (r) {
        var key = String(r[0]).toLowerCase();
        if (key === "series size" || key === "series_size" || key === "displayed n") { displayedN = r[1]; return; }
        var lbl = labelByValue[String(r[0])];
        var valueDisplay = lbl && lbl !== r[0] ? r[0] + " \u2014 " + lbl : r[0];
        var pctCell = hasPct && r[2] !== undefined ? "<td>" + esc(r[2]) + "</td>" : "";
        rowsHtml += "<tr><td>" + esc(valueDisplay) + "</td><td>" + esc(r[1]) + "</td>" + pctCell + "</tr>";
      });
      statsHtml =
        '<div class="fq-cat-box"><table class="fq-table" style="width:100%;"><tr><th style="width:40%">Value</th><th>Count</th>' +
        (hasPct ? "<th>Pct</th>" : "") + "</tr>" + rowsHtml + "</table></div>";
      note = "Missing values have been excluded, and categories with low cell counts have been suppressed, from both the plot above and the counts above.";
    }

    var nBanner = displayedN !== null
      ? '<div class="dist-n-banner"><span>Displayed N</span><span>' + esc(displayedN) + "</span></div>" : "";

    var csvHeader = isContinuous ? '"Item","Value"' : '"Value","Count","Pct"';
    var csvUri = csvDataUri(page.freq_rows, csvHeader);
    var statsDownloadHtml =
      '<div class="dist-download-row stats"><a class="dist-download-btn" href="' + csvUri + '" download="' +
      esc(varname) + '_stats.csv"><i class="ti ti-download" aria-hidden="true"></i> Download statistics as CSV</a></div>';

    var html =
      '<div class="vm-panel" data-panel="dist">' + trajBtn + '<div class="dist-flex">' +
      '<div class="dist-plot-col">' + plotHtml + unitsHtml + legendHtml + downloadPngHtml + "</div>" +
      '<div class="dist-stats-col">' + statsHtml + nBanner + statsDownloadHtml + "</div>" +
      "</div>" + '<p class="dist-note">' + note + "</p></div>";

    // Draw the chart on the next tick, once the canvas is in the DOM.
    // Also mirrors the finished canvas into a hidden <img id="dist-plot-img">
    // - not shown to the reader (the canvas is what's visible) - purely
    // so owl_pdf_client.js's existing
    // document.getElementById("dist-plot-img") lookup keeps finding a
    // data-URI PNG to embed in the PDF, completely unchanged, even though
    // the page itself no longer has a real <img> for the chart.
    setTimeout(function () {
      var canvas = document.getElementById(canvasId);
      if (!canvas || !page.chart) return;
      if (page.chart.type === "continuous") drawContinuousChart(canvas, page.chart, page.label);
      else drawCategoricalChart(canvas, page.chart, page.label);

      var pdfImg = document.getElementById("dist-plot-img");
      if (!pdfImg) {
        pdfImg = document.createElement("img");
        pdfImg.id = "dist-plot-img";
        pdfImg.alt = "";
        pdfImg.style.display = "none";
        document.body.appendChild(pdfImg);
      }
      pdfImg.src = canvas.toDataURL("image/png");
    }, 0);

    return html;
  }

  // ── Top-level page assembly ─────────────────────────────────────────────
  function badge(n) { return n ? ' <span style="font-size:11px;opacity:0.8;">(' + n + ")</span>" : ""; }

  function render(json) {
    var page = json.page;
    var app = document.getElementById("owl-app");
    document.title = page.varname + " \u2014 " + page.label;

    var siteBase = page.site_baseurl;
    var nav =
      '<div class="owl-nav"><a href="' + esc(siteBase) + '/"><i class="ti ti-arrow-left"></i> OWL</a>' +
      '<span class="sep">|</span><span class="current">' + esc(page.varname) + "</span></div>";

    var hero =
      '<div class="hero-banner"><div><h1><i class="ti ti-file-description" aria-hidden="true"></i> ' +
      esc(page.varname) + " &mdash; " + esc(page.label) + "</h1>" +
      "<p>Variable metadata, linked longitudinal variables, category memberships, value labels, and frequency distribution.</p></div>" +
      '<button class="pdf-btn" type="button" data-pdf-varname="' + esc(page.varname) + '"><i class="ti ti-download" aria-hidden="true"></i>Download PDF</button></div>';

    var restrictedBanner = "";
    if (page.is_restricted) {
      var restrictedUrl = siteBase + "/docs/getting-started/basket-management/#restricted-variables";
      restrictedBanner =
        '<div class="restricted-banner"><i class="ti ti-lock" aria-hidden="true"></i>' +
        "<div><strong>This variable is restricted.</strong> " + esc(page.security_message) + " &mdash; see " +
        '<a href="' + esc(restrictedUrl) + '">Restricted variables</a> for details.</div></div>';
    }

    var distIcon = page.dist_type === "continuous" ? "ti-chart-histogram" : "ti-chart-bar";
    var tabs =
      '<div class="vm-tabs">' +
      '<div class="vm-tab active" data-tab="meta"><i class="ti ti-info-circle" aria-hidden="true"></i> Metadata</div>' +
      '<div class="vm-tab" data-tab="linked"><i class="ti ti-arrows-transfer-up" aria-hidden="true"></i> Linked &amp; Longitudinal' + badge(page.counts.linked) + "</div>" +
      '<div class="vm-tab" data-tab="docs"><i class="ti ti-paperclip" aria-hidden="true"></i> Documents' + badge(page.counts.docs) + "</div>" +
      '<div class="vm-tab" data-tab="cats"><i class="ti ti-tags" aria-hidden="true"></i> Categories' + badge(page.counts.cats) + "</div>" +
      '<div class="vm-tab" data-tab="vals"><i class="ti ti-list-numbers" aria-hidden="true"></i> Value Labels' + badge(page.counts.vals) + "</div>" +
      '<div class="vm-tab" data-tab="dist"><i class="ti ' + distIcon + '" aria-hidden="true"></i> Distribution</div>' +
      "</div>";

    var panels = renderMeta(page) + renderLinked(page) + renderDocs(page) + renderCats(page) + renderVals(page) + renderDist(page, page.varname);

    app.innerHTML =
      nav + '<div class="owl-wrapper"><div class="page-topics page-questionnaire_by_year">' +
      hero + restrictedBanner + tabs + panels + "</div></div>";

    // Tab switching
    Array.prototype.forEach.call(app.querySelectorAll(".vm-tab"), function (tab) {
      tab.addEventListener("click", function () {
        var t = this.getAttribute("data-tab");
        Array.prototype.forEach.call(app.querySelectorAll(".vm-tab"), function (x) { x.classList.remove("active"); });
        Array.prototype.forEach.call(app.querySelectorAll(".vm-panel"), function (x) { x.classList.remove("active"); });
        this.classList.add("active");
        app.querySelector('.vm-panel[data-panel="' + t + '"]').classList.add("active");
      });
    });

    // "Download plot as image" - client-drawn canvas exports directly, no
    // server-rendered PNG needed any more.
    Array.prototype.forEach.call(app.querySelectorAll("[data-download-chart]"), function (btn) {
      btn.addEventListener("click", function () {
        var canvas = document.getElementById(this.getAttribute("data-download-chart"));
        if (!canvas) return;
        var a = document.createElement("a");
        a.href = canvas.toDataURL("image/png");
        a.download = this.getAttribute("data-varname") + "_distribution.png";
        a.click();
      });
    });

    // PDF button - same call signature as before: (varname, pageUrl).
    // owl_pdf_client.js uses pageUrl only for the cover's "view this
    // variable's live page" link (it fetches {varname}.json itself, from
    // the current directory) - so this still points at the stub HTML
    // page, exactly as the old server-rendered page's onclick did.
    //
    // The listener is always attached (not conditionally, based on
    // whether window.downloadVariablePdf already exists) - the stub
    // template loads owl_pdf_client.js before this script, so in normal
    // page loads it's always ready well before anyone could click the
    // button, but checking again inside the handler rather than only
    // once at render time means a future reordering (e.g. adding
    // `defer`/`async` to either script tag) fails with a clear message
    // instead of a silently-dead button.
    var pdfBtn = app.querySelector("[data-pdf-varname]");
    if (pdfBtn) {
      pdfBtn.addEventListener("click", function () {
        if (typeof window.downloadVariablePdf !== "function") {
          alert("PDF export isn't available right now - please reload the page and try again.");
          return;
        }
        var pageUrl = siteBase + "/assets/variable_metadata/" + encodeURIComponent(page.varname) + ".html";
        window.downloadVariablePdf(page.varname, pageUrl);
      });
    }
  }

  function init() {
    var app = document.getElementById("owl-app");
    var varname = getVariableId();
    if (!varname) {
      app.innerHTML = '<div class="owl-error">No variable specified.</div>';
      return;
    }
    app.innerHTML = '<div class="owl-loading">Loading ' + esc(varname) + "&hellip;</div>";
    fetch(dataBaseUrl() + encodeURIComponent(varname) + ".json")
      .then(function (resp) {
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        return resp.json();
      })
      .then(render)
      .catch(function (err) {
        app.innerHTML = '<div class="owl-error">Could not load data for "' + esc(varname) + '" (' + esc(err.message) + ").</div>";
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
