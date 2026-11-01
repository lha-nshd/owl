// ============================================================
// NSHD Variable Detail Page — fetches ONE variable's JSON and
// renders it. Replaces per-variable static HTML generation:
// this single page + tiny JSON fetch scales to any number of
// variables without a per-page build step.
// ============================================================

// ============================================================
// CONFIG — CONFIRM THESE AGAINST YOUR ACTUAL FILE LAYOUT
// ============================================================

// Folder holding one JSON file per variable, named "{variable_name}.json"
const VARIABLE_JSON_FOLDER = "/OWL/assets/variable_metadata/";

// Fields shown in the top summary strip (order matters)
const SUMMARY_FIELDS = [
  { key: "Showcase Field ID",  label: "Field ID" },
  { key: "Form",                label: "Form" },
  { key: "Year of collection",  label: "Year" },
  { key: "Question Number",     label: "Question number" },
  { key: "Units",                label: "Units" }
];

// Fields shown in the metadata table below the summary
const DETAIL_FIELDS = [
  { key: "Topic",                          label: "Topic" },
  { key: "Subtopic 1",                     label: "Subtopic 1" },
  { key: "Subtopic 2",                     label: "Subtopic 2" },
  { key: "Subtopic 3",                     label: "Subtopic 3" },
  { key: "Subtopic 4",                     label: "Subtopic 4" },
  { key: "NSHD Library File",              label: "NSHD library file" },
  { key: "UKLLC Dataset Name(s)",          label: "UKLLC dataset name(s)" },
  { key: "Is variable derived?",           label: "Is variable derived?" },
  { key: "Is variable sensitive?",         label: "Is variable sensitive?" },
  { key: "Reason variable is sensitive",   label: "Reason variable is sensitive" }
];

// ============================================================
// Helpers
// ============================================================

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getVarNameFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("var");
}

// Parses a "Value labels" string like:
// "{-1.0} No such actiheart data   {-9.0} Unknown"
// into [{code:"-1.0", label:"No such actiheart data"}, ...]
function parseValueLabels(raw) {
  if (!raw) return [];
  const pairs = [];
  const re = /\{([^}]+)\}\s*([^{]+)/g;
  let match;
  while ((match = re.exec(raw)) !== null) {
    const code = match[1].trim();
    const label = match[2].trim();
    if (label) pairs.push({ code, label });
  }
  return pairs;
}

// ============================================================
// Render
// ============================================================

function renderNotFound(varName) {
  document.getElementById("loadingState").style.display = "none";
  const notFound = document.getElementById("notFoundState");
  notFound.style.display = "block";
  document.getElementById("notFoundVarName").textContent = varName || "(none provided)";
}

function renderVariable(data) {
  document.getElementById("loadingState").style.display = "none";
  document.getElementById("variableContent").style.display = "block";

  const varName = data["NSHD Variable Name"] || "";
  const label = data["Variable Label"] || "";

  document.title = varName ? `${varName} — NSHD Data Dictionary` : "Variable — NSHD Data Dictionary";
  document.getElementById("varName").textContent = varName;
  document.getElementById("varLabel").textContent = label;

  // Summary strip
  const summaryEl = document.getElementById("summaryStrip");
  summaryEl.innerHTML = SUMMARY_FIELDS
    .filter(f => data[f.key] !== undefined && data[f.key] !== "" && data[f.key] !== null)
    .map(f => `
      <div class="summary-item">
        <p class="summary-label">${escapeHtml(f.label)}</p>
        <p class="summary-value">${escapeHtml(data[f.key])}</p>
      </div>
    `).join("");

  // Detail table
  const detailEl = document.getElementById("detailTable");
  detailEl.innerHTML = DETAIL_FIELDS
    .filter(f => data[f.key] !== undefined && data[f.key] !== "" && data[f.key] !== null)
    .map(f => `
      <tr>
        <td class="detail-key">${escapeHtml(f.label)}</td>
        <td class="detail-value">${escapeHtml(data[f.key])}</td>
      </tr>
    `).join("");

  // Value labels
  const valueLabelsSection = document.getElementById("valueLabelsSection");
  const valueLabels = parseValueLabels(data["Value labels"]);
  if (valueLabels.length > 0) {
    valueLabelsSection.style.display = "block";
    document.getElementById("valueLabelsTable").innerHTML = valueLabels
      .map(v => `<tr><td class="vl-code">${escapeHtml(v.code)}</td><td class="vl-label">${escapeHtml(v.label)}</td></tr>`)
      .join("");
  } else {
    valueLabelsSection.style.display = "none";
  }

  // Notes
  const notesSection = document.getElementById("notesSection");
  const notes = data["Notes"];
  if (notes && notes.trim() !== "") {
    notesSection.style.display = "block";
    document.getElementById("notesText").textContent = notes;
  } else {
    notesSection.style.display = "none";
  }
}

// ============================================================
// Load
// ============================================================

const varName = getVarNameFromUrl();

if (!varName) {
  renderNotFound(null);
} else {
  fetch(VARIABLE_JSON_FOLDER + encodeURIComponent(varName) + ".json")
    .then(r => {
      if (!r.ok) throw new Error("Not found");
      return r.json();
    })
    .then(data => renderVariable(data))
    .catch(() => renderNotFound(varName));
}