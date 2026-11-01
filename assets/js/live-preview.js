/* Renders the same block data model used by docx-generator.js into
   HTML matching the real site's styling — reuses the same CSS classes
   established in html_render.py (Page Proof's HTML preview), so a
   document built here looks the same as one checked through Page Proof
   or eventually published for real. */

function escHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const TOPSHEET_PUBLIC_FIELDS = [
  ['categories', 'Categories of variables'],
  ['summary', 'Summary of work undertaken'],
  ['sourceVars', 'Names of source variables'],
  ['outputVars', 'Output variables'],
  ['papers', 'Papers using these variables'],
];

function renderHeroBanner(topsheet) {
  const title = escHtml(topsheet.title) || '<span style="opacity:0.5;font-style:italic;">Untitled document — fill in the Document title field above</span>';
  const bylineParts = [topsheet.name, topsheet.date].filter(p => (p || '').trim()).map(escHtml);
  const byline = bylineParts.length ? `<p class="doc-byline">${bylineParts.join(' &middot; ')}</p>` : '';
  return `
    <div class="hero-banner">
      <h1>${title}</h1>
      ${byline}
    </div>
  `;
}

const LIST_TYPE_FIELDS = new Set(['sourceVars', 'outputVars']);

function renderDetailsTable(topsheet) {
  const rows = TOPSHEET_PUBLIC_FIELDS
    .filter(([key]) => (topsheet[key] || '').trim())
    .map(([key, label]) => {
      if (LIST_TYPE_FIELDS.has(key)) {
        const value = topsheet[key].split('\n').filter(l => l.trim()).join(', ');
        return `<tr><td>${escHtml(label)}</td><td>${escHtml(value)}</td></tr>`;
      }
      // Prose fields (Summary, Papers, Categories) keep real line breaks
      // rather than being run together with commas — a paragraph split
      // across lines, or several papers each on their own line, reads
      // as broken text once comma-joined.
      return `<tr><td>${escHtml(label)}</td><td style="white-space:pre-line;">${escHtml(topsheet[key])}</td></tr>`;
    })
    .join('');
  if (!rows) return '';
  return `<table class="doc-details-table">${rows}</table>`;
}

function renderInline(runs) {
  if (!runs || !runs.length) return '';
  return runs.map(r => {
    let t = escHtml(r.text || '');
    if (r.bold) t = `<strong>${t}</strong>`;
    if (r.italic) t = `<em>${t}</em>`;
    if (r.underline) t = `<u>${t}</u>`;
    return t;
  }).join('');
}

function renderBlock(block) {
  switch (block.type) {
    case 'section':
      return `<h2>${escHtml(block.title)}</h2>`;

    case 'subheading': {
      const text = escHtml(block.text);
      if (block.style === 'heading2') return `<h3>${text}</h3>`;
      if (block.style === 'bold_underline') return `<p class="doc-subheading"><strong><u>${text}</u></strong></p>`;
      if (block.style === 'underline') return `<p class="doc-subheading"><u>${text}</u></p>`;
      return `<p class="doc-subheading"><strong>${text}</strong></p>`;
    }

    case 'paragraph':
      return `<p>${renderInline(block.runs)}</p>`;

    case 'bulleted_list': {
      const items = (block.items || []).filter(t => t.trim()).map(t => `<li>${escHtml(t)}</li>`).join('');
      return items ? `<ul>${items}</ul>` : '';
    }

    case 'numbered_list': {
      const items = (block.items || []).filter(t => t.trim()).map(t => `<li>${escHtml(t)}</li>`).join('');
      return items ? `<ol>${items}</ol>` : '';
    }

    case 'table': {
      const rows = block.rows || [];
      if (!rows.length) return '';
      const trs = rows.map((row, ri) => {
        const cells = row.map(c => ri === 0 ? `<th>${escHtml(c)}</th>` : `<td>${escHtml(c)}</td>`).join('');
        return `<tr>${cells}</tr>`;
      }).join('');
      return `<table>${trs}</table>`;
    }

    case 'image': {
      if (!block.dataUrl) return '';
      const cap = block.caption ? `<p style="font-size:0.9em;color:#555;font-style:italic;">${escHtml(block.caption)}</p>` : '';
      return `<img src="${block.dataUrl}" style="max-width:100%;height:auto;">${cap}`;
    }

    default:
      return '';
  }
}

// Same 6-colour rotation build_pages.py itself cycles sections
// through — the actual colour a given section ends up with, once
// published, depends on how many sections come before it across the
// document, so this preview's assignment is illustrative (showing
// sections ARE visually distinct from each other), not a guarantee of
// which exact colour a given section will get live.
// Same colour rotation build_pages.py itself cycles sections
// through, MINUS gs-card-explore — that colour is used by the outer
// "Live preview" section on the page itself, so a simulated section
// inside the preview using the same colour would visually blend into
// its own container rather than reading as a distinct section.
const SECTION_COLORS = ['gs-card-search', 'gs-card-sidebar',
                         'gs-card-basket', 'gs-card-blue', 'gs-card-lavender'];

function groupBlocksBySection(blocks) {
  const groups = [];
  let current = null;
  blocks.forEach(block => {
    if (block.type === 'section') {
      current = { title: block.title, blocks: [] };
      groups.push(current);
    } else if (current) {
      current.blocks.push(block);
    } else {
      // Content before the first section block — no colour, matching
      // Page Proof's own warning that this content won't belong to
      // any section once published.
      if (!groups.length || groups[0].title !== null) groups.unshift({ title: null, blocks: [] });
      groups[0].blocks.push(block);
    }
  });
  return groups;
}

function renderVariablesBox(topsheet) {
  const vars = (topsheet.outputVars || '').split('\n').map(v => v.trim()).filter(Boolean);
  if (!vars.length) return '';
  const rows = vars.map(v => `<tr>
    <td>${escHtml(v)}</td>
    <td><em class="doc-var-label-placeholder">(label for this variable)</em></td>
    <td>topsheet field</td>
    <td><input type="checkbox" class="doc-var-checkbox" disabled title="Illustrative only \u2014 not a real basket in this preview"></td>
  </tr>`).join('');
  return `
    <div class="doc-variables-box">
      <h2 id="live-preview-variables">Variables in this document</h2>
      <p class="doc-variables-count">${vars.length} high-confidence match${vars.length !== 1 ? 'es' : ''}</p>
      <table class="doc-details-table doc-variables-table">
        <thead><tr><th>Variable</th><th>Label</th><th>How it was found</th><th>Add</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="doc-variables-note"><i>Only variables listed in the Output variables field are shown here, since those are the only ones this preview can identify with certainty. Labels shown are placeholders \u2014 the real page fills these in from the live NSHD data dictionary, which this offline preview has no access to. The real published page also checks bold headings, sweep-year patterns, and plain-text mentions to find further variables at medium and low confidence.</i></p>
    </div>
  `;
}

const PUBLIC_FIELD_CHECK_LABELS = [
  ['categories', 'Categories of variables'],
  ['summary', 'Summary of work undertaken'],
  ['sourceVars', 'Names of source variables'],
  ['outputVars', 'Output variables'],
  ['papers', 'Papers using these variables'],
];

// The eleven internal-record-keeping fields (source files, syntax, output
// file details) — never published, so this isn't checked field-by-field
// the way the public ones are; just a single completion summary line.
const PRIVATE_FIELD_KEYS = [
  'sourceFiles', 'sourceFilesDate', 'syntaxProvided', 'syntaxLocation',
  'syntaxDate', 'syntaxFormat', 'outputDataProvided', 'outputDate',
  'outputLocation', 'outputFormat', 'docProvided',
];

function runFormattingChecks(topsheet, blocks) {
  const findings = [];

  // Matches report.py's check_public_fields exactly.
  PUBLIC_FIELD_CHECK_LABELS.forEach(([key, label]) => {
    if ((topsheet[key] || '').trim()) {
      findings.push({ level: 'good', text: `\u201c${label}\u201d is filled in.` });
    } else {
      findings.push({ level: 'warning', text: `\u201c${label}\u201d is empty or missing. This will show as blank on the live page.` });
    }
  });

  // Not checked field-by-field like the public ones, since these are
  // never published — just a single completion count, since NSHD still
  // needs them for internal record-keeping.
  const privateFilledCount = PRIVATE_FIELD_KEYS.filter(key => (topsheet[key] || '').trim()).length;
  if (privateFilledCount === PRIVATE_FIELD_KEYS.length) {
    findings.push({ level: 'good', text: `All ${PRIVATE_FIELD_KEYS.length} private fields are filled in.` });
  } else {
    findings.push({
      level: 'warning',
      text: `${privateFilledCount} of ${PRIVATE_FIELD_KEYS.length} private fields are filled in \u2014 ${PRIVATE_FIELD_KEYS.length - privateFilledCount} still needed for NSHD\u2019s internal record-keeping before submission.`,
    });
  }

  // Matches report.py's check_section_count exactly, adapted to blocks:
  // a Section block is a named section; any content block before the
  // first Section is preamble content, same distinction Page Proof
  // itself draws between a real section and unplaced content.
  const sectionTitles = [];
  let sawFirstSection = false;
  let hasPreamble = false;
  blocks.forEach(b => {
    if (b.type === 'section') {
      sawFirstSection = true;
      if ((b.title || '').trim()) sectionTitles.push(b.title.trim());
    } else if (!sawFirstSection) {
      hasPreamble = true;
    }
  });
  if (!sectionTitles.length) {
    findings.push({
      level: 'warning',
      text: 'No sections were found. If the document has intended sections, add a Section (Heading 1) block for each one.',
    });
  } else {
    findings.push({
      level: 'good',
      text: `${sectionTitles.length} section${sectionTitles.length !== 1 ? 's' : ''} found: ${sectionTitles.map(t => `\u201c${t}\u201d`).join(', ')}.`,
    });
  }
  if (hasPreamble) {
    findings.push({
      level: 'warning',
      text: 'Some content appears before your first Section block and won\u2019t be grouped under any section title once published. If this was meant to be part of a section, move it after that section\u2019s heading, or add a Section block before it.',
    });
  }

  return findings;
}

function renderFormattingChecksBox(topsheet, blocks) {
  const findings = runFormattingChecks(topsheet, blocks);
  const warnings = findings.filter(f => f.level === 'warning');
  const good = findings.filter(f => f.level === 'good');
  const rows = warnings.concat(good).map(f =>
    `<li class="db-check-${f.level}"><i class="ti ${f.level === 'warning' ? 'ti-alert-triangle' : 'ti-circle-check'}" aria-hidden="true"></i> ${escHtml(f.text)}</li>`
  ).join('');
  return `
    <div class="db-checks-box">
      <h2 id="live-preview-checks">Formatting checks</h2>
      <p class="db-checks-intro">The same checks <a href="${(typeof window !== 'undefined' && window.SITE_BASEURL) || ''}/docs/documentation/#page-proof">Page Proof</a> runs on a downloaded document, shown live as you build \u2014 not a guarantee nothing else needs a look, just a head start.</p>
      <ul class="db-checks-list">${rows}</ul>
    </div>
  `;
}

function renderLivePreview(topsheet, blocks) {
  const detailsHtml = renderDetailsTable(topsheet);
  const groups = groupBlocksBySection(blocks);

  let colorIndex = 0;
  const sectionsHtml = groups.map(group => {
    const bodyHtml = group.blocks.map(renderBlock).join('\n');
    if (group.title === null) {
      // Preamble content — rendered plainly, no section colour, to
      // visually reinforce that it sits outside any section.
      return `<div class="doc-content-body">${bodyHtml}</div>`;
    }
    const color = SECTION_COLORS[colorIndex % SECTION_COLORS.length];
    colorIndex++;
    return `<div class="home-section ${color}">
      <h2>${escHtml(group.title)}</h2>
      <div class="doc-content-body">${bodyHtml}</div>
    </div>`;
  }).join('\n');

  return `
    ${renderFormattingChecksBox(topsheet, blocks)}
    ${renderHeroBanner(topsheet)}
    <div class="doc-details-box">
      <h2 id="live-preview-details">Document details</h2>
      ${detailsHtml || '<p style="color:#999;font-style:italic;">No public fields filled in yet.</p>'}
    </div>
    ${sectionsHtml || '<p style="color:#999;font-style:italic;">Add a block below to start writing.</p>'}
    ${renderVariablesBox(topsheet)}
  `;
}

if (typeof module !== 'undefined') {
  module.exports = { renderLivePreview };
}