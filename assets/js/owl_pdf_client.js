/**
 * owl_pdf_client.js
 *
 * Builds the "Download PDF" report entirely in the browser, on click -
 * no server-side PDF generation or pre-built PDF files. Fetches
 * {varname}.json (written by the pipeline - see owl_db_pipeline.py's
 * run() and owl_extract_data_from_db.py's build_pdf_data()) and reads
 * its "pdf" key for everything except the plot image, which is pulled
 * directly from the page's own <img id="dist-plot-img"> (already a
 * data-URI PNG, so no need to re-fetch or regenerate it). The variable
 * page itself now draws its chart on a <canvas>, not an <img> - see
 * variable_page.js, which keeps a hidden #dist-plot-img in sync with
 * that canvas via toDataURL() specifically so this lookup keeps working
 * unchanged.
 *
 * Colours are the exact same hex values as owl_pdf_report.py's THEME/
 * STAT_BOX/TL_COLOR/LV_COLOR - kept in sync manually; if either file's
 * colours are ever updated, update both.
 *
 * Known differences from the Python/reportlab version (owl_pdf_report.py) -
 * see the design discussion this was built from: the cover's title/
 * subtitle sit BELOW the gradient banner rather than overlaid inside it -
 * pdfmake's absolutePosition is anchored to the page, not the current
 * flow position, so text placed "inside" the banner that way actually
 * overlapped whatever came before it once tested for real; a sequential
 * stack (banner, then text) is far more reliable than fighting that.
 * The banner is also a plain rectangle, since pdfmake has no native
 * rounded-corner image clipping like reportlab's canvas.clipPath. Default
 * fonts differ too (Roboto here vs Helvetica in reportlab), so exact text
 * wrapping/spacing will not be pixel-identical to the Python version.
 */

const THEME = {
  metadata: { band: "#D3EEEE", tableHeader: "#A6DDDD", text: "#112C2C", col1: "#E1F4F4", col2: "#F8FCFC", panelBg: "#F0F9F9", panelBorder: "#59C0C0" },
  linked:   { band: "#F3E3CE", tableHeader: "#E7C89D", text: "#31220C", odd: "#FCF8F3", even: "#F8EFE2", panelBg: "#FBF6EF", panelBorder: "#D19847" },
  docs:     { band: "#EED3DC", tableHeader: "#E0AEBE", text: "#2C111A", odd: "#FBF4F6", even: "#F5E5EA", panelBg: "#F9F0F3", panelBorder: "#C76B8A" },
  cats:     { band: "#CFE8D1", tableHeader: "#A5D4A9", text: "#142916", odd: "#F5FAF5", even: "#E7F3E8", panelBg: "#EEF7EF", panelBorder: "#64B46B" },
  vals:     { band: "#D3E0EE", tableHeader: "#A6C2DD", text: "#111F2C", odd: "#F4F7FB", even: "#E5EDF5", panelBg: "#F0F5F9", panelBorder: "#598CC0" },
  dist:     { band: "#E0D6EB", text: "#291B37", panelBg: "#F5F1F8", panelBorder: "#8C64B4" },
};
const STAT_BOX = {
  summary: { bg: "#E6F1FB", text: "#0C447C" },
  spread: { bg: "#FBEAF0", text: "#72243E" },
  deciles: { bg: "#EAF3DE", text: "#27500A" },
  displayedN: { bg: "#F0C382", text: "#5C3D14" },
};
const TL_COLOR = { header: "#534AB7", evenTint: "#F6F6FB", border: "#DDD4F5" };
const LV_COLOR = { header: "#1D7A5F", evenTint: "#F4F8F7", border: "#B8E4D8" };
const MISSING_ROW_COLOR = "#FBE3E3";
const MISSING_BORDER_COLOR = "#E8B8B8";

// ── Small helpers ──────────────────────────────────────────────────────

function sectionHeader(text, key) {
  const t = THEME[key];
  return {
    table: { widths: ["*"], body: [[{ text, bold: true, color: t.text, margin: [8, 6, 8, 6] }]] },
    layout: { fillColor: () => t.band, hLineWidth: () => 0, vLineWidth: () => 0 },
    margin: [0, 0, 0, 10],
  };
}

// Builds a table with alternating row tints (Linked/Documents/Categories/
// Value Labels style), or column tints (Metadata style), or a solid single
// fill (stat boxes / Displayed N) - mirrors _styled_table()'s modes in
// owl_pdf_report.py.
function styledTable(rows, widths, opts) {
  opts = opts || {};
  const body = rows.map((row, r) =>
    row.map((cell, c) => (typeof cell === "object" ? cell : { text: String(cell), margin: [4, 3, 4, 3] }))
  );
  if (opts.header) {
    body[0] = body[0].map((cell) => Object.assign({}, cell, { bold: true, color: opts.headerTextColor || "#000", fillColor: opts.headerFill }));
  }
  const highlightRows = opts.highlightRows || [];
  return {
    table: { widths, body, headerRows: opts.header ? 1 : 0 },
    layout: {
      hLineWidth: () => 0.5, vLineWidth: () => 0,
      hLineColor: () => "#DDDDDD",
      fillColor: (rowIndex) => {
        if (highlightRows.includes(rowIndex)) return MISSING_ROW_COLOR;
        if (opts.fillBox) return opts.fillBox;
        if (opts.rowTint) return rowIndex % 2 === (opts.header ? 1 : 0) ? opts.rowTint.odd : opts.rowTint.even;
        return null;
      },
    },
  };
}

// White-text-on-dark-header style, for Truly Longitudinal (purple) /
// Linked variables (green) - a different look from every other table.
function solidHeaderTable(rows, widths, colorSet) {
  const body = rows.map((row, r) => row.map((cell) => ({ text: String(cell), margin: [4, 3, 4, 3], color: r === 0 ? "white" : undefined, bold: r === 0 })));
  return {
    table: { widths, body, headerRows: 1 },
    layout: {
      hLineWidth: () => 0.5, vLineWidth: () => 0, hLineColor: () => "#DDDDDD",
      fillColor: (rowIndex) => (rowIndex === 0 ? colorSet.header : (rowIndex % 2 === 0 ? colorSet.evenTint : null)),
    },
  };
}

function panelWrap(contentArray, key, forceUnbreakable) {
  const t = THEME[key];
  const tableNode = {
    table: { widths: ["*"], body: [[{ stack: contentArray, margin: [6, 6, 6, 6] }]] },
    layout: {
      fillColor: () => t.panelBg,
      hLineWidth: () => 1.25, vLineWidth: () => 1.25,
      hLineColor: () => t.panelBorder, vLineColor: () => t.panelBorder,
    },
  };
  if (forceUnbreakable === false) {
    return Object.assign({}, tableNode, { margin: [0, 0, 0, 14] });
  }
  return {
    stack: [tableNode],
    unbreakable: true,
    margin: [0, 0, 0, 14],
  };
}

// Rounds a full-precision stat value to 2dp for display - mirrors
// owl_pdf_report.py's _pdf_round_value(), same reasoning: the underlying
// data can be e.g. 10.407401306001397, which is fine on the wide HTML
// page but needs rounding to fit the PDF's narrower table columns.
function roundStatValue(val) {
  const s = String(val);
  if (s.includes(" - ")) {
    const parts = s.split(" - ");
    const nums = parts.map(Number);
    if (nums.every((n) => !isNaN(n))) return nums.map((n) => n.toFixed(2)).join(" - ");
    return s;
  }
  const f = Number(s);
  if (!isNaN(f)) {
    if (Number.isInteger(f) && !s.includes(".")) return s;
    return f.toFixed(2);
  }
  return s;
}

// ── Section builders - mirror owl_pdf_report.py's _pdf_*_section() methods ──

function buildMetadataSection(pdfData) {
  const rows = [["Field", "Value"]].concat(pdfData.meta_rows);
  const body = rows.map((row, r) => {
    if (r === 0) return row.map((c) => ({ text: c, bold: true, fillColor: THEME.metadata.tableHeader, margin: [4, 3, 4, 3] }));
    return [
      { text: row[0], bold: true, color: "#3a0066", fillColor: THEME.metadata.col1, margin: [4, 3, 4, 3] },
      { text: row[1], fillColor: THEME.metadata.col2, margin: [4, 3, 4, 3] },
    ];
  });
  return [
    sectionHeader("Metadata", "metadata"),
    { table: { widths: [130, "*"], body }, layout: { hLineWidth: () => 0.5, vLineWidth: () => 0, hLineColor: () => "#DDDDDD" } },
  ];
}

function buildLinkedSection(pdfData) {
  const flow = [sectionHeader("Linked & Longitudinal", "linked")];
  flow.push({ text: [{ text: "Truly Longitudinal", bold: true, color: "#534AB7" }, " (same Field ID, guaranteed comparable)"], margin: [0, 0, 0, 4] });
  if (pdfData.truly_longitudinal && pdfData.truly_longitudinal.length) {
    const rows = [["Variable", "Year", "Label"]].concat(pdfData.truly_longitudinal.map((m) => [m[0], m[1] || "Not applicable", m[2]]));
    flow.push(solidHeaderTable(rows, [110, 70, "*"], TL_COLOR));
  } else {
    flow.push({ text: "No same-Field-ID longitudinal variables recorded.", italics: true, color: "#777777", margin: [0, 0, 0, 8] });
  }
  flow.push({ text: [{ text: "Linked variables", bold: true, color: "#1A6B45" }, " (any connection; coding may differ)"], margin: [0, 10, 0, 4] });
  if (pdfData.linked_rows && pdfData.linked_rows.length) {
    const rows = [["Variable", "Description", "Year"]].concat(pdfData.linked_rows.map((r) => [r[0], r[1], r[2] || "Not applicable"]));
    flow.push(solidHeaderTable(rows, [110, "*", 70], LV_COLOR));
  } else {
    flow.push({ text: "No additional linked variables recorded.", italics: true, color: "#777777" });
  }
  return flow;
}

function buildDocsSection(pdfData) {
  const rows = [["Type", "Document"]].concat(
    pdfData.doc_rows.map((r) => [r[0], { text: r[2], link: r[1], color: "#8A2E42", decoration: "underline" }])
  );
  return [sectionHeader("Documents", "docs"), styledTable(rows, [110, "*"], { header: true, headerFill: THEME.docs.tableHeader, rowTint: { odd: THEME.docs.odd, even: THEME.docs.even } })];
}

function buildCatsSection(pdfData) {
  if (!pdfData.cat_rows || !pdfData.cat_rows.length) {
    return [sectionHeader("Categories", "cats"), { text: "No category memberships recorded.", italics: true, color: "#777777" }];
  }
  const rows = [["Category"]].concat(pdfData.cat_rows.map((r) => [r[0]]));
  return [sectionHeader("Categories", "cats"), styledTable(rows, ["*"], { header: true, headerFill: THEME.cats.tableHeader, rowTint: { odd: THEME.cats.odd, even: THEME.cats.even } })];
}

function buildValsSection(pdfData) {
  if (!pdfData.val_rows || !pdfData.val_rows.length) {
    return [sectionHeader("Value Labels", "vals"), { text: "No value labels recorded.", italics: true, color: "#777777" }];
  }
  const rows = [["Value", "Label"]];
  const highlightRows = [];
  let hasMissing = false;
  pdfData.val_rows.forEach((row, i) => {
    rows.push([String(row[0]), row[1]]);
    if (row[2]) { highlightRows.push(i + 1); hasMissing = true; }
  });
  const flow = [sectionHeader("Value Labels", "vals"), styledTable(rows, [90, "*"], { header: true, headerFill: THEME.vals.tableHeader, rowTint: { odd: THEME.vals.odd, even: THEME.vals.even }, highlightRows })];
  if (hasMissing) {
    flow.push({
      columns: [
        { width: 12, table: { widths: [9], body: [[{ text: "", fillColor: MISSING_ROW_COLOR }]] }, layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => MISSING_BORDER_COLOR, vLineColor: () => MISSING_BORDER_COLOR } },
        { width: "*", text: "Values shown in this colour are missing-value codes - they are excluded from the plots and statistics shown in the Distribution section.", italics: true, fontSize: 8.5, color: "#777777" },
      ],
      columnGap: 4,
      margin: [0, 10, 0, 0],
    });
  }
  return flow;
}

function buildDistSection(pdfData, plotDataUri) {
  const headerAndImage = [sectionHeader("Distribution", "dist")];
  if (plotDataUri) {
    headerAndImage.push({ image: plotDataUri, width: 470, margin: [0, 0, 0, 10] });
  } else {
    headerAndImage.push({ text: "No distribution data available for this variable.", italics: true, color: "#777777" });
  }

  const stats = [];
  const freqRows = pdfData.freq_rows || [];
  if (freqRows.length) {
    let displayedN = null;
    if (pdfData.dist_type === "categorical") {
      const rows = [["Value", "Count", "Pct"]];
      freqRows.forEach((r) => (r[0] === "Displayed N" ? (displayedN = r[1]) : rows.push(r)));
      if (rows.length > 1) stats.push(styledTable(rows, [180, 155, 155], { header: true, headerFill: STAT_BOX.summary.bg, fillBox: STAT_BOX.summary.bg }));
    } else {
      const sizeRow = new Set(["series size", "series_size", "displayed n"]);
      const summaryItems = new Set(["minimum", "maximum", "range", "median", "iqr"]);
      const spreadItems = new Set(["mean", "std dev.", "variance"]);
      const summaryRows = [["Item", "Value"]], spreadRows = [["Item", "Value"]], decileRows = [["Decile", "Value"]];
      freqRows.forEach(([item, val]) => {
        const key = item.toLowerCase();
        if (sizeRow.has(key)) displayedN = val;
        else if (summaryItems.has(key)) summaryRows.push([item, roundStatValue(val)]);
        else if (spreadItems.has(key)) spreadRows.push([item, roundStatValue(val)]);
        else decileRows.push([item.replace("Decile ", ""), roundStatValue(val)]);
      });
      stats.push({
        columns: [
          {
            width: 220,
            stack: [
              styledTable(summaryRows, [110, 90], { header: true, headerFill: STAT_BOX.summary.bg, fillBox: STAT_BOX.summary.bg }),
              { text: "", margin: [0, 6, 0, 0] },
              styledTable(spreadRows, [110, 90], { header: true, headerFill: STAT_BOX.spread.bg, fillBox: STAT_BOX.spread.bg }),
            ],
          },
          styledTable(decileRows, [90, 100], { header: true, headerFill: STAT_BOX.deciles.bg, fillBox: STAT_BOX.deciles.bg }),
        ],
        columnGap: 14,
        margin: [0, 0, 0, 8],
      });
    }
    if (displayedN !== null) {
      stats.push(styledTable([["Displayed N", String(displayedN)]], [180, 315], { fillBox: STAT_BOX.displayedN.bg }));
    }
    if (pdfData.freq_note) {
      stats.push({ text: pdfData.freq_note, italics: true, fontSize: 8.5, color: "#777777", margin: [0, 8, 0, 0] });
    }
  }
  return { headerAndImage, stats };
}

// ── Cover + contents + full document assembly ───────────────────────────

function buildCover(pdfData, pageUrl, bannerDataUri) {
  const flow = [];
  if (pageUrl) {
    flow.push({ text: "\u00AB View this variable's live page", link: pageUrl, color: "#1D7A5F", fontSize: 10.5, margin: [0, 0, 0, 30] });
  } else {
    flow.push({ text: "", margin: [0, 0, 0, 55] });
  }
  flow.push({ text: "NSHD OWL Variable Metadata Page", bold: true, fontSize: 16, color: "#6a0dad", alignment: "center", margin: [0, 0, 0, 20] });
  if (bannerDataUri) {
    flow.push({ image: bannerDataUri, width: 495, height: 152, margin: [0, 0, 0, 20] });
  } else {
    flow.push({ text: pdfData.varname, bold: true, fontSize: 34, alignment: "center", color: "#2b004d", margin: [0, 0, 0, 4] });
    flow.push({ text: pdfData.label, bold: true, fontSize: 14, alignment: "center", color: "#6a0dad", margin: [0, 0, 0, 8] });
    flow.push({ text: "Variable metadata, linked longitudinal variables, category memberships, value labels, and frequency distribution.",
      alignment: "center", fontSize: 11.5, color: "#555555" });
  }
  return flow;
}

function buildDocDefinition(pdfData, plotDataUri, pageUrl, bannerDataUri) {
  const sections = [
    { name: "Metadata", key: "metadata", build: () => buildMetadataSection(pdfData) },
    { name: "Linked & Longitudinal", key: "linked", build: () => buildLinkedSection(pdfData) },
    { name: "Documents", key: "docs", build: () => buildDocsSection(pdfData) },
    { name: "Categories", key: "cats", build: () => buildCatsSection(pdfData) },
    { name: "Value Labels", key: "vals", build: () => buildValsSection(pdfData) },
    { name: "Distribution", key: "dist", build: () => buildDistSection(pdfData, plotDataUri) },
  ];

  const content = [];
  content.push(...buildCover(pdfData, pageUrl, bannerDataUri));
  content.push({ text: "", pageBreak: "after" });

  content.push({ text: "Contents", fontSize: 20, margin: [0, 0, 0, 14] });
  sections.forEach((s) => {
    content.push({ toc: { id: s.key, textStyle: { fontSize: 12, color: THEME[s.key].text, decoration: "underline" }, textMargin: [0, 5, 0, 5] } });
  });
  content.push({ text: "", pageBreak: "after" });

  sections.forEach((s) => {
    const tocMarker = { text: s.name, tocItem: s.key, id: s.name, fontSize: 0.1, color: "white", margin: [0, 0, 0, 0] };
    content.push(tocMarker);
    if (s.key === "dist") {
      const { headerAndImage, stats } = buildDistSection(pdfData, plotDataUri);
      content.push(panelWrap(headerAndImage, "dist", true));
      if (stats.length) {
        content.push(panelWrap(stats, "dist", true));
      }
    } else {
      content.push(panelWrap(s.build(), s.key, true));
    }
  });

  return {
    content,
    defaultStyle: { fontSize: 9.5 },
    pageMargins: [40, 50, 40, 50],
  };
}

/**
 * Entry point wired to the "Download PDF" button's onclick. `pageUrl` is
 * this variable's own live HTML page URL (shown as a link on the cover);
 * pass null/undefined to omit it.
 */
let _pdfMakeLoadPromise = null;
function _ensurePdfMakeLoaded() {
  if (typeof pdfMake !== "undefined") return Promise.resolve();
  if (_pdfMakeLoadPromise) return _pdfMakeLoadPromise;
  _pdfMakeLoadPromise = new Promise((resolve, reject) => {
    const s1 = document.createElement("script");
    s1.src = "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/pdfmake.min.js";
    s1.onload = () => {
      const s2 = document.createElement("script");
      s2.src = "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/vfs_fonts.js";
      s2.onload = () => resolve();
      s2.onerror = () => reject(new Error("Failed to load pdfmake fonts"));
      document.head.appendChild(s2);
    };
    s1.onerror = () => reject(new Error("Failed to load pdfmake"));
    document.head.appendChild(s1);
  });
  return _pdfMakeLoadPromise;
}

async function downloadVariablePdf(varname, pageUrl) {
  await _ensurePdfMakeLoaded();

  // A relative path (e.g. "/OWL/assets/variable_metadata/ht89u") resolves
  // correctly as an <a href> in the live HTML page, since the browser
  // resolves it against whatever page is currently open - but a PDF has
  // no "current page" of its own, so a link embedded in one needs to be
  // fully-qualified (including the domain) to work when clicked outside
  // a browser tab. Resolved via the browser's own knowledge of the
  // current origin, rather than a hardcoded domain string, so this stays
  // correct even if the site is ever moved.
  const absolutePageUrl = pageUrl ? new URL(pageUrl, window.location.href).href : null;

  // CHANGED (repo-size fix): {varname}.pdfdata.json no longer exists as
  // its own file - owl_db_pipeline.py now writes ONE {varname}.json per
  // variable, with this same data nested under its "pdf" key (alongside
  // "page", the new data the shared variable.html/variable_page.js
  // template renders, and the pre-existing sidecar fields used by the
  // longitudinal comparison tool). Everything below this line is
  // unchanged - build_pdf_data()'s return shape in
  // owl_extract_data_from_db.py was not altered, only where it's found.
  const resp = await fetch(`${varname}.json`);
  if (!resp.ok) {
    alert("Could not load data for this variable's PDF - please try again.");
    return;
  }
  const pdfData = (await resp.json()).pdf;

  const imgEl = document.getElementById("dist-plot-img");
  const plotDataUri = imgEl && imgEl.src && imgEl.src.startsWith("data:image") ? imgEl.src : null;

  // Hero banner image - the gradient plus the variable name/label drawn
  // directly onto the same canvas, so the text sits reliably inside the
  // banner. Built fresh per variable (not cached) since the text differs -
  // canvas drawing is cheap enough that this isn't worth caching.
  const bannerDataUri = buildHeroBannerImage(pdfData.varname, pdfData.label);

  const docDefinition = buildDocDefinition(pdfData, plotDataUri, absolutePageUrl, bannerDataUri);
  pdfMake.createPdf(docDefinition).download(`${varname}.pdf`);
}

function buildHeroBannerImage(varname, label) {
  const canvas = document.createElement("canvas");
  const W = 1500, H = 460;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#E8F5E9");
  grad.addColorStop(0.33, "#F3E5F5");
  grad.addColorStop(0.66, "#FFF3E0");
  grad.addColorStop(1, "#E0F7FA");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let titleSize = 78;
  ctx.font = `bold ${titleSize}px Arial, sans-serif`;
  while (ctx.measureText(varname).width > W - 80 && titleSize > 30) {
    titleSize -= 4;
    ctx.font = `bold ${titleSize}px Arial, sans-serif`;
  }
  ctx.fillStyle = "#2b004d";
  ctx.fillText(varname, W / 2, H / 2 - 80);

  let subSize = 32;
  ctx.font = `bold ${subSize}px Arial, sans-serif`;
  while (ctx.measureText(label).width > W - 120 && subSize > 16) {
    subSize -= 2;
    ctx.font = `bold ${subSize}px Arial, sans-serif`;
  }
  ctx.fillStyle = "#6a0dad";
  ctx.fillText(label, W / 2, H / 2);

  // Description - wrapped across up to 2 lines, matching the Python
  // cover's third line of text
  const desc = "Variable metadata, linked longitudinal variables, category memberships, value labels, and frequency distribution.";
  ctx.font = "26px Arial, sans-serif";
  ctx.fillStyle = "#555555";
  const words = desc.split(" ");
  const maxLineWidth = W - 160;
  let line1 = "", line2 = "", curLine = "";
  const lines = [];
  words.forEach((word) => {
    const test = curLine ? curLine + " " + word : word;
    if (ctx.measureText(test).width > maxLineWidth && curLine) {
      lines.push(curLine);
      curLine = word;
    } else {
      curLine = test;
    }
  });
  if (curLine) lines.push(curLine);
  lines.slice(0, 2).forEach((ln, i) => {
    ctx.fillText(ln, W / 2, H / 2 + 75 + i * 34);
  });

  return canvas.toDataURL("image/png");
}

if (typeof module !== "undefined") {
  module.exports = { buildDocDefinition, buildMetadataSection, buildLinkedSection, buildDocsSection, buildCatsSection, buildValsSection, buildDistSection, roundStatValue };
}
