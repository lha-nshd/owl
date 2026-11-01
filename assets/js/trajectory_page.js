/* trajectory_page.js
 * Renders the "trajectory across sweeps" page for one Truly Longitudinal
 * Field ID group - one shared template for every group (trajectory.html),
 * selected via ?fid=<field_id>&via=<varname the reader clicked from>.
 *
 * NO PIPELINE CHANGES: every member variable already has its own full
 * {varname}.json (chart data + freq_rows), because every public variable
 * gets one. This page fetches each member's existing file directly -
 * `via`'s own file first (to get the authoritative, already-sorted member
 * list from its page.truly_longitudinal.members), then every member's
 * file in parallel. Nothing here is written by the pipeline; it is all
 * assembled in the browser from files that already exist.
 */
(function () {
  "use strict";

  function esc(s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function getParams() {
    var p = new URLSearchParams(window.location.search);
    return { fid: p.get("fid") || "", via: p.get("via") || "" };
  }

  function dataBaseUrl() {
    var path = window.location.pathname;
    return path.slice(0, path.lastIndexOf("/") + 1);
  }

  function fetchJson(varname) {
    return fetch(dataBaseUrl() + encodeURIComponent(varname) + ".json").then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  // ── Shared drawing helpers (same palette/logic as variable_page.js's
  // Distribution tab, sized for a 2-up grid rather than a single full-width
  // chart) ──────────────────────────────────────────────────────────────
  var PURPLE = { bar: "#9C87D6", edge: "#4A3F7A", bg: "#F3F0FA", grid: "#DFD9F0" };
  var AXIS_TEXT = "#222222";

  function shadeFor(i, n) {
    var dark = [0x4a, 0x3f, 0x7a], light = [0xc4, 0xb5, 0xe8];
    var t = n > 1 ? i / (n - 1) : 0;
    var rgb = dark.map(function (d, k) { return Math.round(d + (light[k] - d) * t); });
    return "rgb(" + rgb.join(",") + ")";
  }

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
    for (var v = start; v <= max + step * 1e-6; v += step) ticks.push(Math.round(v / step) * step);
    if (!ticks.length || ticks[0] > min + step * 0.4) ticks.unshift(min);
    if (ticks[ticks.length - 1] < max - step * 0.4) ticks.push(max);
    return ticks;
  }

  function round4(v) { return typeof v === "number" ? Math.round(v * 10000) / 10000 : v; }

  function sizeCanvas(canvas, W, H) {
    var dpr = Math.max(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    var ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    return ctx;
  }

  function cardWidth(canvas) {
    var w = (canvas.parentElement && canvas.parentElement.clientWidth) || 420;
    return Math.max(280, Math.min(w, 520));
  }

  // Each card uses its OWN x/y scale, from its own chart's own bins -
  // deliberately not aligned with any other card in the group.
  function drawContinuousMini(canvas, chart, label) {
    var W = cardWidth(canvas);
    var titleLineH = 13;
    var measureCtx = document.createElement("canvas").getContext("2d");
    measureCtx.font = "bold 11px system-ui, sans-serif";
    var titleLines = label ? wrapCanvasText(measureCtx, label, W - 20) : [];
    var titleH = titleLines.length ? titleLines.length * titleLineH + 6 : 0;

    var H = Math.round(W * 0.54) + titleH;
    var ctx = sizeCanvas(canvas, W, H);
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, W, H);

    // Title - the variable's own label, same text already shown as the
    // card's HTML description on the live page, drawn INTO the canvas
    // here too so it travels with the chart into the downloaded/
    // composited image, not just the live DOM.
    if (titleLines.length) {
      ctx.fillStyle = PURPLE.edge; ctx.font = "bold 11px system-ui, sans-serif"; ctx.textAlign = "center";
      titleLines.forEach(function (line, i) { ctx.fillText(line, W / 2, 12 + i * titleLineH); });
    }

    var box = chart.boxplot, bins = chart.bins;
    var xMin = bins.edges[0], xMax = bins.edges[bins.edges.length - 1];
    var padL = 42, padR = 14, padT = 8 + titleH, padBottom = 30;
    var boxH = 26, gap = 8;
    var plotW = W - padL - padR;
    var histTop = padT + boxH + gap;
    var histH = H - histTop - padBottom;
    var maxCount = Math.max.apply(null, bins.counts.concat([1]));

    function xPos(v) { return padL + ((v - xMin) / (xMax - xMin || 1)) * plotW; }

    var midY = padT + boxH / 2;
    ctx.strokeStyle = PURPLE.bar; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(xPos(box.min), midY); ctx.lineTo(xPos(box.q1), midY);
    ctx.moveTo(xPos(box.q3), midY); ctx.lineTo(xPos(box.max), midY);
    ctx.stroke();
    ["min", "max"].forEach(function (k) {
      ctx.beginPath(); ctx.moveTo(xPos(box[k]), midY - 5); ctx.lineTo(xPos(box[k]), midY + 5); ctx.stroke();
    });
    var bx = xPos(box.q1), bw = Math.max(xPos(box.q3) - xPos(box.q1), 1);
    ctx.fillStyle = "rgba(156,135,214,0.55)"; ctx.fillRect(bx, midY - 9, bw, 18);
    ctx.strokeStyle = PURPLE.edge; ctx.strokeRect(bx, midY - 9, bw, 18);
    ctx.beginPath(); ctx.moveTo(xPos(box.median), midY - 9); ctx.lineTo(xPos(box.median), midY + 9);
    ctx.lineWidth = 1.6; ctx.stroke();

    ctx.strokeStyle = PURPLE.grid; ctx.lineWidth = 1;
    for (var g = 0; g <= 3; g++) {
      var gy = histTop + histH - (g / 3) * histH;
      ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(W - padR, gy); ctx.stroke();
    }
    for (var i = 0; i < bins.counts.length; i++) {
      var x0 = xPos(bins.edges[i]), x1 = xPos(bins.edges[i + 1]);
      var barH = (bins.counts[i] / maxCount) * histH;
      ctx.fillStyle = PURPLE.bar;
      ctx.fillRect(x0 + 0.5, histTop + histH - barH, Math.max(x1 - x0 - 1, 1), barH);
    }
    ctx.strokeStyle = PURPLE.edge; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, histTop + histH); ctx.lineTo(W - padR, histTop + histH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(padL, histTop); ctx.lineTo(padL, histTop + histH); ctx.stroke();

    var ticks = niceTicks(xMin, xMax, 5);
    ctx.font = "9px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = AXIS_TEXT;
    ticks.forEach(function (v) {
      var tx = xPos(v);
      ctx.strokeStyle = PURPLE.edge; ctx.beginPath(); ctx.moveTo(tx, histTop + histH); ctx.lineTo(tx, histTop + histH + 3); ctx.stroke();
      ctx.fillText(round4(v), tx, histTop + histH + 13);
    });
    ctx.textAlign = "right"; ctx.font = "9px system-ui, sans-serif"; ctx.fillStyle = AXIS_TEXT;
    ctx.fillText(String(maxCount), padL - 4, histTop + 8);
    ctx.fillText("0", padL - 4, histTop + histH);
    var unitLabel = chart.units ? label + " (" + chart.units + ")" : label;
    ctx.textAlign = "center"; ctx.fillText(unitLabel, padL + plotW / 2, H - 6);
  }

  // Each card uses its own category set (sorted by count, descending) and
  // its own count-axis max - not aligned with other cards in the group.
  // Same two elements as the main Distribution tab's categorical chart -
  // bars with a real x/y axis, plus a 100%-stacked summary bar beneath -
  // just sized down to fit a 2-up card. label is drawn as a title, same
  // treatment as the continuous chart - previously this chart had no
  // label anywhere on the canvas at all, so it was lost the moment a
  // reader downloaded or printed the image rather than viewing the live
  // page (where the label is separate HTML text next to the canvas).
  function drawCategoricalMini(canvas, chart, label) {
    var bars = chart.bars.slice().sort(function (a, b) { return b.count - a.count; });
    var n = bars.length;
    var maxCount = Math.max.apply(null, bars.map(function (b) { return b.count; }).concat([1]));
    var W = cardWidth(canvas);
    var titleLineH = 13;
    var measureCtx = document.createElement("canvas").getContext("2d");
    measureCtx.font = "bold 11px system-ui, sans-serif";
    var titleLines = label ? wrapCanvasText(measureCtx, label, W - 20) : [];
    var titleH = titleLines.length ? titleLines.length * titleLineH + 6 : 0;
    var rowH = 26, padT = 6 + titleH, axisGap = 20, stackGap = 14, stackH = 18, padB = 10;
    var barsBottom = padT + n * rowH;
    var stackY = barsBottom + axisGap + stackGap;
    var H = stackY + stackH + padB;
    var ctx = sizeCanvas(canvas, W, H);
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, W, H);

    if (titleLines.length) {
      ctx.fillStyle = PURPLE.edge; ctx.font = "bold 11px system-ui, sans-serif"; ctx.textAlign = "center";
      titleLines.forEach(function (line, i) { ctx.fillText(line, W / 2, 12 + i * titleLineH); });
    }

    var padL = Math.round(W * 0.28), padR = 40;
    var plotW = W - padL - padR;

    ctx.font = "10px system-ui, sans-serif";
    bars.forEach(function (b, i) {
      var y = padT + i * rowH;
      var w = (b.count / maxCount) * plotW;
      ctx.fillStyle = shadeFor(i, n);
      ctx.fillRect(padL, y, Math.max(w, 2), rowH - 9);
      ctx.strokeStyle = PURPLE.edge; ctx.lineWidth = 0.7;
      ctx.strokeRect(padL, y, Math.max(w, 2), rowH - 9);
      ctx.fillStyle = AXIS_TEXT; ctx.textAlign = "left";
      ctx.fillText(String(b.count), padL + w + 5, y + (rowH - 9) / 2 + 3);
      ctx.textAlign = "right";
      var lbl = b.label || b.value;
      if (lbl.length > 22) lbl = lbl.slice(0, 20) + "...";
      ctx.fillText(lbl, padL - 6, y + (rowH - 9) / 2 + 3);
    });

    // x-axis (bottom) and y-axis (left) lines - both were missing before;
    // the left line in particular is what makes this read as a real
    // chart with two axes, not just a list of floating bars.
    ctx.strokeStyle = PURPLE.edge; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, barsBottom); ctx.lineTo(W - padR, barsBottom); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, barsBottom); ctx.stroke();

    var ticks = niceTicks(0, maxCount, 4);
    ctx.font = "9px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = AXIS_TEXT;
    ticks.forEach(function (v) {
      var tx = padL + (v / (maxCount || 1)) * plotW;
      ctx.beginPath(); ctx.moveTo(tx, barsBottom); ctx.lineTo(tx, barsBottom + 4); ctx.stroke();
      ctx.fillText(String(Math.round(v)), tx, barsBottom + 14);
    });

    // 100% stacked summary bar beneath, same as the main Distribution tab.
    var total = bars.reduce(function (s, b) { return s + b.count; }, 0) || 1;
    var x = padL;
    bars.forEach(function (b, i) {
      var w = (b.count / total) * plotW;
      ctx.fillStyle = shadeFor(i, n);
      ctx.fillRect(x, stackY, w, stackH);
      if (w > plotW * 0.08) {
        ctx.fillStyle = i < n / 2 ? "#fff" : PURPLE.edge;
        ctx.textAlign = "center"; ctx.font = "9px system-ui, sans-serif";
        ctx.fillText(Math.round((b.count / total) * 100) + "%", x + w / 2, stackY + stackH / 2 + 3);
      }
      x += w;
    });
  }

  // ── Page assembly ───────────────────────────────────────────────────
  function csvEscape(v) { return '"' + String(v).replace(/"/g, '""') + '"'; }

  function downloadBlob(text, mime, filename) {
    var blob = new Blob([text], { type: mime });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function wrapCanvasText(ctx, text, maxWidth) {
    var words = text.split(" "), line = "", lines = [];
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + " " + words[i] : words[i];
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = words[i]; }
      else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  function downloadCompositeImage(members, fid, noteText) {
    var canvases = Array.prototype.slice.call(document.querySelectorAll(".traj-card canvas"));
    if (!canvases.length) return;
    var cols = 2, gap = 16, labelH = 20;
    var cardW = Math.max.apply(null, canvases.map(function (c) { return c.width; }));
    var cardH = Math.max.apply(null, canvases.map(function (c) { return c.height; }));
    var dpr = canvases[0].width / parseFloat(canvases[0].style.width);
    var rows = Math.ceil(canvases.length / cols);
    var lineH = 15 * dpr;
    var noteLines = [];
    var out = document.createElement("canvas");
    var gridW = cols * cardW + (cols - 1) * gap * dpr;
    var gridH = rows * (cardH + labelH * dpr) + (rows - 1) * gap * dpr;
    var probeCtx = out.getContext("2d");
    probeCtx.font = (11 * dpr) + "px system-ui, sans-serif";
    if (noteText) noteLines = wrapCanvasText(probeCtx, noteText, gridW - 20 * dpr);
    var noteH = noteText ? (16 * dpr) + noteLines.length * lineH + (10 * dpr) : 0;
    out.width = gridW;
    out.height = gridH + noteH;
    var ctx = out.getContext("2d");
    ctx.fillStyle = "#F3F0FA"; ctx.fillRect(0, 0, out.width, out.height);
    canvases.forEach(function (c, i) {
      var col = i % cols, row = Math.floor(i / cols);
      var x = col * (cardW + gap * dpr), y = row * (cardH + labelH * dpr + gap * dpr);
      var head = c.closest(".traj-card").querySelector(".traj-card-head");
      var nameSpan = head ? head.querySelector("span:first-child") : null;
      var nSpan = head ? head.querySelector(".n") : null;
      ctx.font = (12 * dpr) + "px system-ui, sans-serif";
      ctx.textAlign = "left"; ctx.fillStyle = "#4A3F7A";
      ctx.fillText(nameSpan ? nameSpan.textContent.trim() : "", x, y + 14 * dpr);
      if (nSpan) {
        ctx.textAlign = "right"; ctx.fillStyle = "#8A7FB0";
        ctx.fillText(nSpan.textContent.trim(), x + cardW, y + 14 * dpr);
      }
      ctx.textAlign = "left";
      ctx.drawImage(c, x, y + labelH * dpr);
    });
    // Same disclosure note the page itself shows, so it travels with the
    // image if someone downloads or prints it rather than viewing the
    // live page.
    if (noteLines.length) {
      ctx.fillStyle = "#6B5F9E"; ctx.font = "italic " + (11 * dpr) + "px system-ui, sans-serif";
      var ny = gridH + (16 * dpr);
      noteLines.forEach(function (line) { ctx.fillText(line, 0, ny); ny += lineH; });
    }
    var a = document.createElement("a");
    a.href = out.toDataURL("image/png");
    a.download = "field_id_" + fid + "_trajectory.png";
    a.click();
  }

  function render(via, members, results) {
    var app = document.getElementById("traj-app");
    var fid = via.page.truly_longitudinal.field_id;
    var siteBase = via.page.site_baseurl;
    document.title = via.page.label + " \u2014 trajectory across sweeps";

    var ok = results.filter(function (r) { return r.ok; });
    var refType = null;
    for (var i = 0; i < ok.length; i++) {
      if (ok[i].data.page.dist_type === "continuous" || ok[i].data.page.dist_type === "categorical") {
        refType = ok[i].data.page.dist_type; break;
      }
    }

    var nav =
      '<div class="traj-nav"><a href="' + esc(siteBase) + '/"><i class="ti ti-arrow-left"></i> OWL</a>' +
      '<span class="sep">|</span><span class="current">Trajectory \u00b7 Field ID ' + esc(fid) + '</span></div>';

    var head =
      '<p class="traj-title">' + esc(via.page.label.replace(/\s*-\s*at age.*$/i, "")) + ' \u2014 trajectory across sweeps</p>' +
      '<p class="traj-sub">Field ID ' + esc(fid) + " \u00b7 " + members.length + ' truly longitudinal sweeps \u00b7 same disclosure-controlled data as each variable\u2019s own Distribution tab</p>';

    // Categories are still unioned across the group here, but ONLY to
    // give the merged STATS TABLE a common set of rows to line up
    // against - unrelated to the charts above, which each now draw
    // strictly from their own data, on their own scale.
    var categories = null;
    if (refType === "categorical") {
      var seen = {}; var order = [];
      ok.forEach(function (r) {
        if (r.data.page.dist_type === "categorical" && r.data.page.chart) {
          r.data.page.chart.bars.forEach(function (b) {
            if (!(b.value in seen)) { seen[b.value] = true; order.push(b.value); }
          });
        }
      });
      categories = order;
    }

    var cardsHtml = members.map(function (m, idx) {
      var r = results[idx];
      var headHtml = '<div class="traj-card-head"><span>' + esc(m.year) + " \u00b7 " + esc(m.varname) + '</span>';
      if (!r.ok) {
        return '<div class="traj-card">' + headHtml + '</div><div class="traj-card-placeholder">Couldn\u2019t load this sweep</div></div>';
      }
      var pg = r.data.page;
      headHtml += pg.dist_type && pg.freq_rows && pg.freq_rows.length
        ? '<span class="n">n=' + esc((pg.freq_rows.filter(function (row) { return /displayed n/i.test(row[0]); })[0] || [])[1] || "") + "</span>"
        : "";
      headHtml += "</div>";
      // Own description per card - the variable's full label, not just
      // its year and varname, so each plot stands on its own.
      var descHtml = pg.label ? '<p class="traj-card-desc">' + esc(pg.label) + "</p>" : "";
      if (pg.dist_type === "unavailable" || pg.is_plot_excluded || pg.is_genomic || !pg.chart) {
        return '<div class="traj-card">' + headHtml + descHtml + '<div class="traj-card-placeholder">Plots/statistics unavailable for this sweep</div></div>';
      }
      var canvasId = "traj-canvas-" + idx;
      return '<div class="traj-card">' + headHtml + descHtml + '<canvas id="' + canvasId + '"></canvas></div>';
    }).join("");

    var statsHtml = buildStatsTable(refType, members, ok, categories);

    // Same disclosure-control note every individual variable's own
    // Distribution tab already shows (missing values / percentile
    // trimming for continuous, low-cell-count suppression for
    // categorical) - all sweeps in a Truly Longitudinal group share the
    // same coding and therefore the same note, so the first one found is
    // representative of the whole group.
    var noteText = null;
    ok.forEach(function (r) { if (!noteText && r.data.page.freq_note) noteText = r.data.page.freq_note; });
    var noteHtml = noteText ? '<p class="traj-disclosure-note" id="traj-disclosure-note">' + esc(noteText) + "</p>" : "";

    var sidebar =
      '<nav class="traj-sidebar">' +
      '<a href="#traj-top">\u2191 Top of page</a>' +
      '<a href="#traj-plots">Plots</a>' +
      '<a href="#traj-statistics">Statistics</a>' +
      "</nav>";

    app.innerHTML =
      nav + '<div class="traj-wrapper" id="traj-top">' +
      '<div class="traj-layout">' + sidebar +
      '<div class="traj-main">' + head +
      '<h2 id="traj-plots" class="traj-section-heading">Plots</h2>' +
      '<div class="traj-grid">' + cardsHtml + "</div>" +
      noteHtml +
      '<h2 id="traj-statistics" class="traj-section-heading">Statistics</h2>' +
      statsHtml +
      '<div class="traj-download-row">' +
      '<button type="button" class="traj-dl-btn secondary" id="traj-dl-csv"><i class="ti ti-download" aria-hidden="true"></i>Download table as CSV</button>' +
      '<button type="button" class="traj-dl-btn primary" id="traj-dl-img"><i class="ti ti-photo" aria-hidden="true"></i>Download charts as image</button>' +
      "</div></div></div></div>";

    setTimeout(function () {
      members.forEach(function (m, idx) {
        var r = results[idx];
        if (!r.ok) return;
        var pg = r.data.page;
        if (pg.dist_type === "unavailable" || pg.is_plot_excluded || pg.is_genomic || !pg.chart) return;
        var canvas = document.getElementById("traj-canvas-" + idx);
        if (!canvas) return;
        if (pg.dist_type === "continuous") drawContinuousMini(canvas, pg.chart, pg.label);
        else if (pg.dist_type === "categorical") drawCategoricalMini(canvas, pg.chart, pg.label);
      });
      var csvBtn = document.getElementById("traj-dl-csv");
      if (csvBtn) csvBtn.addEventListener("click", function () { downloadTableCsv(refType, members, ok, categories, fid); });
      var imgBtn = document.getElementById("traj-dl-img");
      if (imgBtn) imgBtn.addEventListener("click", function () { downloadCompositeImage(members, fid, noteText); });
    }, 0);
  }

  var CONTINUOUS_ROWS = ["Minimum", "Maximum", "Range", "Median", "IQR",
    "Decile 1", "Decile 2", "Decile 3", "Decile 4", "Decile 5", "Decile 6", "Decile 7", "Decile 8", "Decile 9",
    "Mean", "Std Dev.", "Variance", "Displayed N"];

  function freqLookup(freqRows) {
    var map = {};
    (freqRows || []).forEach(function (r) { map[r[0]] = r[1]; });
    return map;
  }

  var SUMMARY_ROWS = ["Minimum", "Maximum", "Range", "Median", "IQR"];
  var SPREAD_ROWS = ["Mean", "Std Dev.", "Variance"];
  // Decile 1-9 are everything else in CONTINUOUS_ROWS - matches the main
  // Distribution tab's own box-summary/box-spread/box-deciles grouping.
  function rowClassFor(statName) {
    if (SUMMARY_ROWS.indexOf(statName) !== -1) return "traj-row-summary";
    if (SPREAD_ROWS.indexOf(statName) !== -1) return "traj-row-spread";
    if (/^Decile /.test(statName)) return "traj-row-deciles";
    return "";
  }

  function buildStatsTable(refType, members, ok, categories) {
    var header = '<tr><th>' + (refType === "categorical" ? "Category" : "Statistic") + "</th>" +
      members.map(function (m) { return "<th>" + esc(m.year) + "</th>"; }).join("") + "</tr>";

    var rowsHtml;
    if (refType === "continuous") {
      var lookups = members.map(function (m, i) {
        var r = ok.filter(function (x) { return x.varname === m.varname; })[0];
        return r && r.data.page.dist_type === "continuous" ? freqLookup(r.data.page.freq_rows) : null;
      });
      rowsHtml = CONTINUOUS_ROWS.map(function (statName) {
        var cells = lookups.map(function (lk) {
          var v = lk ? lk[statName] : undefined;
          return v !== undefined ? "<td>" + esc(round4Str(v)) + "</td>" : '<td class="traj-missing">\u2014</td>';
        }).join("");
        return '<tr class="' + rowClassFor(statName) + '"><td>' + esc(statName) + "</td>" + cells + "</tr>";
      }).join("");
    } else if (refType === "categorical" && categories) {
      var byVar = members.map(function (m) {
        var r = ok.filter(function (x) { return x.varname === m.varname; })[0];
        if (!r || r.data.page.dist_type !== "categorical") return null;
        var map = {};
        r.data.page.chart.bars.forEach(function (b) { map[b.value] = b; });
        return map;
      });
      rowsHtml = categories.map(function (catVal, i) {
        var label = null;
        byVar.forEach(function (m) { if (m && m[catVal] && !label) label = m[catVal].label; });
        var cells = byVar.map(function (m) {
          var b = m && m[catVal];
          return b ? "<td>" + esc(b.count) + " (" + esc(b.pct) + "%)</td>" : '<td class="traj-missing">\u2014</td>';
        }).join("");
        var rowClass = i % 2 === 0 ? "traj-row-cat-a" : "traj-row-cat-b";
        return '<tr class="' + rowClass + '"><td>' + esc(catVal) + (label ? " \u2014 " + esc(label) : "") + "</td>" + cells + "</tr>";
      }).join("");
      rowsHtml += '<tr class="traj-row-cat-n"><td>Displayed N</td>' + byVar.map(function (m, i) {
        var r = ok.filter(function (x) { return x.varname === members[i].varname; })[0];
        var lk = r && r.data.page.dist_type === "categorical" ? freqLookup(r.data.page.freq_rows) : null;
        var n = lk && (lk["Displayed N"] || lk["Series Size"]);
        return n !== undefined ? "<td>" + esc(n) + "</td>" : '<td class="traj-missing">\u2014</td>';
      }).join("") + "</tr>";
    } else {
      rowsHtml = '<tr><td colspan="' + (members.length + 1) + '" class="traj-missing">No statistics available for this group.</td></tr>';
    }

    var tableClass = refType === "categorical" ? "traj-stats traj-stats-categorical" : "traj-stats";
    return '<p class="traj-stats-title">Merged statistics \u00b7 every value</p>' +
      '<div class="traj-stats-wrap"><table class="' + tableClass + '">' + header + rowsHtml + "</table></div>";
  }

  function round4Str(v) {
    var n = parseFloat(v);
    return isNaN(n) ? v : (Math.round(n * 10) / 10);
  }

  function downloadTableCsv(refType, members, ok, categories, fid) {
    var header = [refType === "categorical" ? "Category" : "Statistic"].concat(members.map(function (m) { return m.year + " (" + m.varname + ")"; }));
    var rows = [header];
    if (refType === "continuous") {
      var lookups = members.map(function (m) {
        var r = ok.filter(function (x) { return x.varname === m.varname; })[0];
        return r && r.data.page.dist_type === "continuous" ? freqLookup(r.data.page.freq_rows) : null;
      });
      CONTINUOUS_ROWS.forEach(function (statName) {
        rows.push([statName].concat(lookups.map(function (lk) { return lk && lk[statName] !== undefined ? lk[statName] : ""; })));
      });
    } else if (refType === "categorical" && categories) {
      var byVar = members.map(function (m) {
        var r = ok.filter(function (x) { return x.varname === m.varname; })[0];
        if (!r || r.data.page.dist_type !== "categorical") return null;
        var map = {}; r.data.page.chart.bars.forEach(function (b) { map[b.value] = b; }); return map;
      });
      categories.forEach(function (catVal) {
        rows.push([catVal].concat(byVar.map(function (m) { return m && m[catVal] ? m[catVal].count : ""; })));
      });
    }
    var csv = rows.map(function (r) { return r.map(csvEscape).join(","); }).join("\n");
    downloadBlob(csv, "text/csv;charset=utf-8", "field_id_" + fid + "_trajectory.csv");
  }

  function init() {
    var app = document.getElementById("traj-app");
    var params = getParams();
    if (!params.via) {
      app.innerHTML = '<div class="traj-error-page">No variable specified.</div>';
      return;
    }
    app.innerHTML = '<div class="traj-loading-page">Loading trajectory\u2026</div>';
    fetchJson(params.via).then(function (viaData) {
      var group = viaData.page && viaData.page.truly_longitudinal;
      if (!group || !group.members || !group.members.length) {
        app.innerHTML = '<div class="traj-error-page">This variable has no Truly Longitudinal group.</div>';
        return;
      }
      var members = group.members;
      var fetches = members.map(function (m) {
        return fetchJson(m.varname).then(
          function (data) { return { ok: true, varname: m.varname, data: data }; },
          function () { return { ok: false, varname: m.varname }; }
        );
      });
      Promise.all(fetches).then(function (results) {
        render(viaData, members, results);
      });
    }).catch(function (err) {
      app.innerHTML = '<div class="traj-error-page">Couldn\u2019t load this variable (' + esc(err.message) + ").</div>";
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
