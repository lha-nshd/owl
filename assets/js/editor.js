/* The block editor itself: state management, rendering the block list
   UI, wiring up add/remove/reorder/edit controls, keeping the live
   preview in sync, and triggering the docx download. */

const state = {
  topsheet: {
    title: '', categories: '', summary: '', date: '', name: '', sourceFiles: '',
    sourceFilesDate: '', sourceVars: '', syntaxProvided: '', syntaxLocation: '',
    syntaxDate: '', syntaxFormat: '', outputDataProvided: '', outputDate: '',
    outputLocation: '', outputFormat: '', docProvided: '', papers: '', outputVars: '',
  },
  blocks: [],
  privateFieldsOpen: true,
  publicFieldsOpen: true,
};

let blockIdCounter = 0;
function newBlockId() { return 'blk-' + (++blockIdCounter); }

function duplicateSection(id) {
  const groups = groupBlocksForOrdering(state.blocks);
  const groupIdx = groups.findIndex(g => g.sectionBlock && g.sectionBlock.id === id);
  if (groupIdx === -1) return;
  const group = groups[groupIdx];

  function cloneBlock(block) {
    const clone = JSON.parse(JSON.stringify(block, (key, value) => {
      // imageBytes is a Uint8Array — JSON.stringify would mangle it into
      // a plain {0:.., 1:..} object, so it's excluded here and restored
      // by reference afterwards instead (the two copies can safely share
      // the same underlying image data, since neither ever mutates it).
      if (key === 'imageBytes') return undefined;
      return value;
    }));
    clone.id = newBlockId();
    if (block.type === 'image') clone.imageBytes = block.imageBytes;
    return clone;
  }

  const sectionClone = cloneBlock(group.sectionBlock);
  const childClones = group.children.map(cloneBlock);

  const insertAfterId = group.children.length
    ? group.children[group.children.length - 1].id
    : group.sectionBlock.id;
  const insertAt = state.blocks.findIndex(b => b.id === insertAfterId) + 1;
  state.blocks.splice(insertAt, 0, sectionClone, ...childClones);
  renderAll();
}

function addBlock(type, insertAtIndex) {
  const base = { id: newBlockId(), type };
  const defaults = {
    section: { title: '' },
    subheading: { style: 'heading2', text: '' },
    paragraph: { runs: [{ text: '' }] },
    bulleted_list: { items: [''] },
    numbered_list: { items: ['', ''] }, // starts with 2, nudging away from the single-item trap
    table: { rows: [['', ''], ['', '']] },
    image: { dataUrl: null, imageBytes: null, caption: '', width: 400, height: 300, imageType: 'png' },
  };
  const newBlock = Object.assign(base, defaults[type]);
  if (typeof insertAtIndex === 'number' && insertAtIndex >= 0 && insertAtIndex <= state.blocks.length) {
    state.blocks.splice(insertAtIndex, 0, newBlock);
  } else {
    state.blocks.push(newBlock);
  }
  renderAll();
}

function removeBlock(id) {
  const block = findBlock(id);
  if (!block) return;
  let message = 'Remove this block? This can\'t be undone.';
  if (block.type === 'section') {
    const childCount = block._childCount || 0;
    message = childCount > 0
      ? `Remove "${block.title || '(untitled section)'}" and everything in it (${childCount} item${childCount === 1 ? '' : 's'})? This can't be undone.`
      : `Remove "${block.title || '(untitled section)'}"? This can't be undone.`;
  }
  if (!confirm(message)) return;

  if (block.type === 'section') {
    // Remove the section's whole range (header + every block that
    // belongs to it) — not just the header, which would otherwise
    // silently orphan its children into whatever section precedes it.
    const groups = groupBlocksForOrdering(state.blocks);
    const idsToRemove = new Set([id]);
    const group = groups.find(g => g.sectionBlock && g.sectionBlock.id === id);
    if (group) group.children.forEach(c => idsToRemove.add(c.id));
    state.blocks = state.blocks.filter(b => !idsToRemove.has(b.id));
  } else {
    state.blocks = state.blocks.filter(b => b.id !== id);
  }
  renderAll();
}

/* Splits the flat block list into groups: an (optional) preamble group
   for anything before the first section, then one group per section
   (the section header itself, plus every block that belongs to it up
   to the next section or the end of the list). Used so moving a block
   up/down can respect section boundaries, rather than treating the
   whole document as one undifferentiated list. */
function groupBlocksForOrdering(blocks) {
  const groups = [];
  let current = null;
  blocks.forEach(block => {
    if (block.type === 'section') {
      current = { sectionBlock: block, children: [] };
      groups.push(current);
    } else if (current) {
      current.children.push(block);
    } else {
      if (!groups.length || groups[0].sectionBlock) groups.unshift({ sectionBlock: null, children: [] });
      groups[0].children.push(block);
    }
  });
  return groups;
}

function indexAfterGroup(group) {
  const lastBlock = group.children.length ? group.children[group.children.length - 1] : group.sectionBlock;
  if (!lastBlock) return 0;
  const idx = state.blocks.findIndex(b => b.id === lastBlock.id);
  return idx === -1 ? state.blocks.length : idx + 1;
}

function indexBeforeGroup(group) {
  const firstBlock = group.sectionBlock || (group.children.length ? group.children[0] : null);
  if (!firstBlock) return 0;
  const idx = state.blocks.findIndex(b => b.id === firstBlock.id);
  return idx === -1 ? 0 : idx;
}

function flattenGroups(groups) {
  const flat = [];
  groups.forEach(g => {
    if (g.sectionBlock) flat.push(g.sectionBlock);
    flat.push(...g.children);
  });
  return flat;
}

function moveBlock(id, direction) {
  const groups = groupBlocksForOrdering(state.blocks);
  const block = findBlock(id);
  if (!block) return;

  if (block.type === 'section') {
    // Move the whole section (its header plus every child) relative
    // to the adjacent section — sections never interleave with each
    // other's content.
    const groupIdx = groups.findIndex(g => g.sectionBlock && g.sectionBlock.id === id);
    const swapWith = groupIdx + direction;
    if (swapWith < 0 || swapWith >= groups.length || !groups[swapWith].sectionBlock) return;
    [groups[groupIdx], groups[swapWith]] = [groups[swapWith], groups[groupIdx]];
  } else {
    // Move only within this block's own group of children — never
    // into a different section's children, and never past its own
    // section header.
    const group = groups.find(g => g.children.some(c => c.id === id));
    if (!group) return;
    const idx = group.children.findIndex(c => c.id === id);
    const swapWith = idx + direction;
    if (swapWith < 0 || swapWith >= group.children.length) return;
    [group.children[idx], group.children[swapWith]] = [group.children[swapWith], group.children[idx]];
  }

  state.blocks = flattenGroups(groups);
  renderAll();
}

function findBlock(id) { return state.blocks.find(b => b.id === id); }

/* ---------- Topsheet form ---------- */

const TOPSHEET_FORM_FIELDS = [
  ['title', 'Document title (shown at the top of the page)', 'text', true, 'e.g. Atopy Documentation Example'],
  ['categories', 'Categories of variables', 'text', true, 'e.g. Health'],
  ['summary', 'Summary of work undertaken', 'textarea', true, 'Briefly describe what work was undertaken and why...'],
  ['sourceVars', 'Names of source variables (one per line)', 'textarea', true, 'eczema53\nasthma53\nhayfever53'],
  ['outputVars', 'Output variables (one per line)', 'textarea', true, 'atopy_life_69\natopy_cum_score_69'],
  ['papers', 'Papers using these variables', 'textarea', true, 'Author A, et al. Title of paper. Journal. Year.'],
  ['name', 'Name of person responsible for cleaning/derivation', 'text', true, 'e.g. Dr J. Fielding'],
  ['date', 'Date of submitting documentation', 'text', true, 'e.g. 14/03/2023'],
  ['sourceFiles', 'Source data file(s)', 'text', false, 'e.g. Z:\\NSHD\\raw\\atopy_raw_2023.sav'],
  ['sourceFilesDate', 'Date source file(s) created', 'date', false, 'e.g. 02/02/2023'],
  ['syntaxProvided', 'Syntax provided (Yes/No)', 'select', false, 'Yes or No'],
  ['syntaxLocation', 'Location of syntax file', 'text', false, 'e.g. Z:\\NSHD\\syntax\\atopy_derivation.sps'],
  ['syntaxDate', 'Date syntax file created', 'date', false, 'e.g. 02/02/2023'],
  ['syntaxFormat', 'Format of syntax', 'text', false, 'e.g. SPSS'],
  ['outputDataProvided', 'Output data file provided (Yes/No)', 'select', false, 'Yes or No'],
  ['outputDate', 'Date output file created', 'date', false, 'e.g. 14/03/2023'],
  ['outputLocation', 'Location of output file', 'text', false, 'e.g. Z:\\NSHD\\output\\atopy_final.sav'],
  ['outputFormat', 'Format of output file', 'text', false, 'e.g. SPSS'],
  ['docProvided', 'Documentation provided (Yes/No)', 'select', false, 'Yes or No'],
];

function ddmmyyyyToIso(str) {
  const m = (str || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return '';
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function isoToDdmmyyyy(str) {
  const m = (str || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const [, y, mo, d] = m;
  return `${d}/${mo}/${y}`;
}

function renderTopsheetForm() {
  const publicFields = TOPSHEET_FORM_FIELDS.filter(f => f[3]);
  const privateFields = TOPSHEET_FORM_FIELDS.filter(f => !f[3]);

  function fieldHtml([key, label, type, isPublic, placeholder]) {
    const rawValue = state.topsheet[key] || '';
    const value = escHtml(rawValue);
    const ph = escHtml(placeholder || '');
    let input;
    if (type === 'textarea') {
      input = `<textarea data-field="${key}" rows="3" class="db-input" placeholder="${ph}">${value}</textarea>`;
    } else if (type === 'select') {
      const opts = ['', 'Yes', 'No'].map(opt =>
        `<option value="${opt}"${rawValue === opt ? ' selected' : ''}>${opt || '-- Select --'}</option>`
      ).join('');
      input = `<select data-field="${key}" class="db-input">${opts}</select>`;
    } else if (type === 'date') {
      const isoValue = ddmmyyyyToIso(rawValue);
      input = `<input type="date" data-field="${key}" data-date-field="true" value="${isoValue}" class="db-input">`;
    } else {
      input = `<input type="text" data-field="${key}" value="${value}" class="db-input" placeholder="${ph}">`;
    }
    return `<label class="db-field-label">${escHtml(label)}${input}</label>`;
  }

  const privateFilledCount = privateFields.filter(([key]) => (state.topsheet[key] || '').trim()).length;
  const publicFilledCount = publicFields.filter(([key]) => (state.topsheet[key] || '').trim()).length;

  return `
    <details class="db-topsheet-public" id="db-public-details"${state.publicFieldsOpen ? ' open' : ''}>
      <summary>Public fields (shown on the page) \u2014 ${publicFilledCount} complete, ${publicFields.length - publicFilledCount} incomplete.</summary>
      <div class="db-topsheet-section">
        ${publicFields.map(fieldHtml).join('')}
      </div>
    </details>
    <details class="db-topsheet-private" id="db-private-details"${state.privateFieldsOpen ? ' open' : ''}>
      <summary>Private fields \u2014 ${privateFilledCount} complete, ${privateFields.length - privateFilledCount} incomplete. Kept internal, never published, but still needed by NSHD for record-keeping.</summary>
      <div class="db-topsheet-section">
        ${privateFields.map(fieldHtml).join('')}
      </div>
    </details>
  `;
}

/* ---------- Block list rendering ---------- */

/* Same 5-colour rotation live-preview.js uses (also excluding
   gs-card-explore, reserved for the outer page section) — strong for
   the Section block itself, a much lighter version of the same hue
   for the blocks that belong to it, so a whole section reads as one
   family of colour without collapsing into one flat undifferentiated
   block. */
const EDITOR_SECTION_COLORS = [
  { strong: 'hsl(180 45% 45%)', light: 'hsl(180 45% 88%)' },
  { strong: 'hsl(340 45% 50%)', light: 'hsl(340 45% 89%)' },
  { strong: 'hsl(125 35% 45%)', light: 'hsl(125 35% 87%)' },
  { strong: 'hsl(210 45% 45%)', light: 'hsl(210 45% 88%)' },
  { strong: 'hsl(270 35% 50%)', light: 'hsl(270 35% 89%)' },
];

function computeBlockDisplayInfo(blocks) {
  // Returns a Map from block.id -> { color, hidden, isSection }
  const info = new Map();
  let colorIndex = -1;
  let currentColor = null;
  let currentCollapsed = false;
  blocks.forEach(block => {
    if (block.type === 'section') {
      colorIndex++;
      currentColor = EDITOR_SECTION_COLORS[colorIndex % EDITOR_SECTION_COLORS.length];
      currentCollapsed = !!block.collapsed;
      info.set(block.id, { color: currentColor, hidden: false, isSection: true });
    } else {
      info.set(block.id, { color: currentColor, hidden: currentCollapsed, isSection: false });
    }
  });
  return info;
}

function renderContentInsertRow(index) {
  return `
    <div class="db-insert-row" data-insert-index="${index}">
      <span class="db-insert-label">Add to this section:</span>
      <button type="button" class="db-insert-btn" data-insert-type="subheading">+ Subheading</button>
      <button type="button" class="db-insert-btn" data-insert-type="paragraph">+ Paragraph</button>
      <button type="button" class="db-insert-btn" data-insert-type="bulleted_list">+ Bulleted list</button>
      <button type="button" class="db-insert-btn" data-insert-type="numbered_list">+ Numbered list</button>
      <button type="button" class="db-insert-btn" data-insert-type="table">+ Table</button>
      <button type="button" class="db-insert-btn" data-insert-type="image">+ Image</button>
    </div>
  `;
}

function renderSectionInsertRow(index, label) {
  return `
    <div class="db-insert-row db-insert-row-section" data-insert-index="${index}">
      <button type="button" class="db-insert-btn db-insert-btn-section" data-insert-type="section">+ New section ${label}</button>
    </div>
  `;
}

function renderBlockEditor(block, canMoveUp, canMoveDown, displayInfo) {
  const isSection = block.type === 'section';
  const collapseToggle = isSection
    ? `<button type="button" class="db-btn-icon" data-action="toggle-collapse" data-id="${block.id}" title="${block.collapsed ? 'Expand section' : 'Collapse section'}">${block.collapsed ? '▶' : '▼'}</button>`
    : '';
  const duplicateBtn = isSection
    ? `<button type="button" class="db-btn-icon" data-action="duplicate" data-id="${block.id}" title="Duplicate this section">⧉</button>`
    : '';
  const controls = `
    <div class="db-block-controls">
      ${collapseToggle}
      <button type="button" class="db-btn-icon" data-action="up" data-id="${block.id}" ${canMoveUp ? '' : 'disabled'} title="${isSection ? 'Move section up' : 'Move up (within this section)'}">↑</button>
      <button type="button" class="db-btn-icon" data-action="down" data-id="${block.id}" ${canMoveDown ? '' : 'disabled'} title="${isSection ? 'Move section down' : 'Move down (within this section)'}">↓</button>
      ${duplicateBtn}
      <button type="button" class="db-btn-icon db-btn-danger" data-action="remove" data-id="${block.id}" title="Remove">✕</button>
    </div>
  `;

  let body = '';
  switch (block.type) {
    case 'section':
      if (block.collapsed) {
        body = `<p class="db-collapsed-summary">"${escHtml(block.title) || '(untitled section)'}" — ${block._childCount || 0} item${block._childCount === 1 ? '' : 's'} hidden. Click ▶ to expand.</p>`;
      } else {
        body = `<label class="db-block-label">Section title (Heading 1)
        <input type="text" class="db-input" data-id="${block.id}" data-prop="title" value="${escHtml(block.title)}" placeholder="e.g. Background and Rationale">
      </label>`;
      }
      break;

    case 'subheading':
      body = `
        <label class="db-block-label">Subheading style
          <select class="db-input" data-id="${block.id}" data-prop="style">
            <option value="heading2" ${block.style === 'heading2' ? 'selected' : ''}>Heading 2</option>
            <option value="bold_underline" ${block.style === 'bold_underline' ? 'selected' : ''}>Bold + Underline</option>
            <option value="underline" ${block.style === 'underline' ? 'selected' : ''}>Underline only</option>
            <option value="bold" ${block.style === 'bold' ? 'selected' : ''}>Bold only</option>
          </select>
        </label>
        <label class="db-block-label">Subheading text
          <input type="text" class="db-input" data-id="${block.id}" data-prop="text" value="${escHtml(block.text)}">
        </label>
      `;
      break;

    case 'paragraph': {
      const runs = block.runs && block.runs.length ? block.runs : [{ text: '' }];
      const runRows = runs.map((run, i) => `
        <div class="db-run-row" data-run-index="${i}">
          <textarea class="db-input db-run-text" rows="1" data-id="${block.id}" data-run-index="${i}" placeholder="${i === 0 ? 'Start typing…' : 'Next segment…'}">${escHtml(run.text)}</textarea>
          <label class="db-run-toggle"><input type="checkbox" data-id="${block.id}" data-run-index="${i}" data-run-prop="bold" ${run.bold ? 'checked' : ''}><strong>B</strong></label>
          <label class="db-run-toggle"><input type="checkbox" data-id="${block.id}" data-run-index="${i}" data-run-prop="italic" ${run.italic ? 'checked' : ''}><em>I</em></label>
          <label class="db-run-toggle"><input type="checkbox" data-id="${block.id}" data-run-index="${i}" data-run-prop="underline" ${run.underline ? 'checked' : ''}><u>U</u></label>
          <button type="button" class="db-btn-icon db-btn-danger" data-action="remove-run" data-id="${block.id}" data-run-index="${i}" ${runs.length <= 1 ? 'disabled' : ''}>✕</button>
        </div>
      `).join('');
      body = `<label class="db-block-label">Paragraph text</label>
      <p class="db-hint">Built from one or more segments, in order. Tick B / I / U on a segment to format just that part — split a new segment off wherever the formatting needs to change. Left empty, this becomes a blank line — a quick way to add extra space wherever it's needed.</p>
      ${runRows}
      <button type="button" class="db-btn-add-item" data-action="add-run" data-id="${block.id}">+ Add segment</button>`;
      break;
    }

    case 'bulleted_list':
    case 'numbered_list': {
      const label = block.type === 'bulleted_list' ? 'Bulleted list items' : 'Numbered list items';
      const minNote = block.type === 'numbered_list'
        ? '<p class="db-hint">Needs at least 2 items — a single numbered item reads as a heading, not a list, once published.</p>'
        : '';
      const items = (block.items || []).map((item, i) => `
        <div class="db-list-item-row">
          <input type="text" class="db-input" data-id="${block.id}" data-prop="item" data-item-index="${i}" value="${escHtml(item)}">
          <button type="button" class="db-btn-icon db-btn-danger" data-action="remove-item" data-id="${block.id}" data-item-index="${i}" ${block.items.length <= (block.type === 'numbered_list' ? 2 : 1) ? 'disabled' : ''}>✕</button>
        </div>
      `).join('');
      body = `<label class="db-block-label">${label}</label>${minNote}${items}
        <button type="button" class="db-btn-add-item" data-action="add-item" data-id="${block.id}">+ Add item</button>`;
      break;
    }

    case 'table': {
      const colCount = block.rows[0] ? block.rows[0].length : 0;
      const colHeaderCells = Array.from({ length: colCount }, (_, ci) =>
        `<td class="db-table-col-remove"><button type="button" class="db-btn-icon db-btn-danger" data-action="remove-col" data-id="${block.id}" data-col="${ci}" ${colCount <= 1 ? 'disabled' : ''} title="Remove this column">✕</button></td>`
      ).join('');
      const rows = block.rows.map((row, ri) => `
        <tr>
          ${row.map((cell, ci) => `<td><input type="text" class="db-input db-table-cell" data-id="${block.id}" data-prop="cell" data-row="${ri}" data-col="${ci}" value="${escHtml(cell)}"></td>`).join('')}
          <td><button type="button" class="db-btn-icon db-btn-danger" data-action="remove-row" data-id="${block.id}" data-row="${ri}" ${block.rows.length <= 1 ? 'disabled' : ''}>✕</button></td>
        </tr>
      `).join('');
      body = `<label class="db-block-label">Table (first row is treated as the header)</label>
        <div class="db-table-scroll"><table class="db-table-editor">
          <thead><tr>${colHeaderCells}<td></td></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        <div class="db-table-buttons">
          <button type="button" class="db-btn-add-item" data-action="add-row" data-id="${block.id}">+ Add row</button>
          <button type="button" class="db-btn-add-item" data-action="add-col" data-id="${block.id}">+ Add column</button>
        </div>`;
      break;
    }

    case 'image': {
      const preview = block.dataUrl ? `<img src="${block.dataUrl}" class="db-image-preview">` : '<p class="db-hint">No image chosen yet.</p>';
      body = `<label class="db-block-label">Image
        <input type="file" accept="image/png,image/jpeg" data-id="${block.id}" data-prop="imageFile" class="db-input">
      </label>
      ${preview}
      <label class="db-block-label">Caption (optional)
        <input type="text" class="db-input" data-id="${block.id}" data-prop="caption" value="${escHtml(block.caption || '')}">
      </label>`;
      break;
    }
  }

  const typeLabel = { section: 'Section (Heading 1)', subheading: 'Subheading', paragraph: 'Paragraph',
    bulleted_list: 'Bulleted list', numbered_list: 'Numbered list', table: 'Table', image: 'Image' }[block.type];

  let styleAttr = '';
  let headerStyleAttr = '';
  if (displayInfo && displayInfo.color) {
    if (isSection) {
      styleAttr = ` style="border-left: 5px solid ${displayInfo.color.strong};"`;
      headerStyleAttr = ` style="background: ${displayInfo.color.strong}; color: white;"`;
    } else {
      styleAttr = ` style="border-left: 5px solid ${displayInfo.color.strong}; background: ${displayInfo.color.light};"`;
    }
  }

  return `<div class="db-block${isSection ? ' db-block-section' : ''}" data-block-id="${block.id}" draggable="true"${styleAttr}>
    <div class="db-block-header"${headerStyleAttr}><span class="db-drag-handle" title="Drag to reorder">\u22ee\u22ee</span><span class="db-block-type">${typeLabel}</span>${controls}</div>
    <div class="db-block-body">${body}</div>
  </div>`;
}

/* ---------- Rendering ---------- */

function computeMoveFlags(blocks) {
  const groups = groupBlocksForOrdering(blocks);
  const flags = new Map();
  groups.forEach((group, groupIdx) => {
    if (group.sectionBlock) {
      const prevIsSection = groupIdx > 0 && !!groups[groupIdx - 1].sectionBlock;
      const nextIsSection = groupIdx < groups.length - 1 && !!groups[groupIdx + 1].sectionBlock;
      flags.set(group.sectionBlock.id, { up: prevIsSection, down: nextIsSection });
    }
    group.children.forEach((child, childIdx) => {
      flags.set(child.id, { up: childIdx > 0, down: childIdx < group.children.length - 1 });
    });
  });
  return flags;
}

const AUTOSAVE_KEY = 'owl-doc-builder-autosave';

function autoSaveToBrowser() {
  const hasContent = state.blocks.length > 0 || Object.values(state.topsheet).some(v => (v || '').trim());
  if (!hasContent) {
    clearAutoSave();
    return;
  }
  // Same shape as saveProgress()'s file, minus imageBytes (not JSON-safe,
  // and dataUrl already carries the same image data as a base64 string).
  const payload = {
    _type: 'owl-doc-builder-progress',
    _version: 1,
    _savedAt: new Date().toISOString(),
    topsheet: state.topsheet,
    blocks: state.blocks.map(b => {
      if (b.type === 'image') {
        const { imageBytes, ...rest } = b;
        return rest;
      }
      return b;
    }),
  };
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(payload));
  } catch (e) {
    // Quota exceeded or storage disabled — auto-save is a convenience,
    // not the primary save path, so fail silently rather than interrupt
    // the person's work. Save progress (the explicit file) still works
    // regardless.
    console.warn('Auto-save to this browser failed:', e);
  }
}

function clearAutoSave() {
  try { localStorage.removeItem(AUTOSAVE_KEY); } catch (e) { /* ignore */ }
}

function showAutoSaveNotice(when) {
  const el = document.getElementById('db-autosave-notice');
  if (!el) return;
  el.querySelector('.db-autosave-notice-text').textContent =
    `Restored your unsaved work from ${when}. Not what you wanted? Use Clear form below to start fresh instead.`;
  el.style.display = 'flex';
}

function hasAnyPrivateFieldFilled(topsheet) {
  return TOPSHEET_FORM_FIELDS.filter(f => !f[3]).some(([key]) => (topsheet[key] || '').trim());
}

function offerAutoSaveRestore() {
  let saved;
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return false;
    saved = JSON.parse(raw);
  } catch (e) {
    clearAutoSave();
    return false;
  }
  if (!saved || saved._type !== 'owl-doc-builder-progress') { clearAutoSave(); return false; }
  const hasSavedContent = (saved.blocks && saved.blocks.length > 0)
    || Object.values(saved.topsheet || {}).some(v => (v || '').trim());
  if (!hasSavedContent) { clearAutoSave(); return false; }

  // Restored automatically, no confirmation gate — this is the normal
  // "pick back up where I left off" case, not a destructive action.
  // A dismissible notice explains what happened rather than silently
  // swapping content with no explanation; Clear form is the one-click
  // way to discard it and start fresh if that's what's actually wanted.
  state.topsheet = Object.assign({}, saved.topsheet);
  state.blocks = (saved.blocks || []).map(b => {
    if (b.type === 'image' && b.dataUrl) {
      return Object.assign({}, b, { imageBytes: dataUrlToBytes(b.dataUrl) });
    }
    return b;
  });
  if (hasAnyPrivateFieldFilled(state.topsheet)) state.privateFieldsOpen = true;
  const when = saved._savedAt ? new Date(saved._savedAt).toLocaleString() : 'your last visit';
  showAutoSaveNotice(when);
  renderAll();
  return true;
}

let previewWindow = null;

function isPreviewWindowOpen() {
  return previewWindow && !previewWindow.closed;
}

function openPreviewWindow() {
  if (isPreviewWindowOpen()) {
    previewWindow.focus();
    return;
  }
  previewWindow = window.open('', 'owlLivePreview', 'width=760,height=920,resizable=yes,scrollbars=yes');
  if (!previewWindow) {
    alert('This browser blocked the preview window from opening. Allow pop-ups for this site and try again.');
    return;
  }
  const baseurl = (typeof window !== 'undefined' && window.SITE_BASEURL) || '';
  previewWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Live preview \u2014 Create Documentation Online</title>
    <link rel="stylesheet" href="${baseurl}/assets/css/topics.css">
    <link rel="stylesheet" href="${baseurl}/assets/css/getting-started.css">
    <style>
      body { margin: 0; padding: 20px 28px; font-family: Calibri, Arial, sans-serif; }
      .doc-details-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px; }
      .doc-details-table td { padding: 6px 10px; border-bottom: 1px solid #eee; vertical-align: top; }
      .doc-details-table td:first-child { font-weight: 600; width: 30%; white-space: nowrap; }
      .doc-content-body h2 { color: #1a4d7a; margin-top: 20px; margin-bottom: 14px; font-size: 16px; }
      .doc-content-body h3 { color: #333; font-size: 14px; font-weight: bold; text-decoration: underline; margin-bottom: 14px; }
      .doc-subheading { margin-bottom: 14px; }
      .doc-content-body p { margin-bottom: 14px; }
      .doc-content-body p:empty { min-height: 1em; }
      .doc-content-body ul, .doc-content-body ol { margin-bottom: 14px; }
      .doc-content-body table { border-collapse: collapse; width: 100%; table-layout: fixed; margin: 10px 0 14px; font-size: 13px; }
      .doc-content-body td, .doc-content-body th { word-wrap: break-word; overflow-wrap: break-word; border: 1px solid #ccc; padding: 6px 10px; }
      .doc-content-body img { margin-bottom: 14px; }
      .doc-details-box, .doc-content-body { font-size: 14px; }
      .doc-details-box { margin-top: 20px; margin-bottom: 20px; padding: 14px 18px; border: 1px solid #ddd; border-left: 4px solid #6a0dad; border-radius: 8px; background: #faf7ff; }
      .doc-details-box h2 { margin-top: 0; }
      .doc-byline { color: #666; font-size: 13px; margin: 2px 0 0; }
      .doc-variables-box { margin-bottom: 20px; padding: 14px 18px; border: 1px solid #ddd; border-left: 4px solid hsl(125 35% 45%); border-radius: 8px; background: hsl(125 35% 97%); }
      .doc-variables-box h2 { margin-top: 0; color: hsl(125 35% 22%); }
      .doc-variables-count { font-weight: 700; font-size: 13px; color: #333; margin: -6px 0 10px; }
      .doc-variables-table th:nth-child(4), .doc-variables-table td:nth-child(4) { text-align: center; width: 60px; }
      .doc-var-checkbox { width: 16px; height: 16px; }
      .doc-var-label-placeholder { color: #999; }
      .db-checks-box { margin-bottom: 20px; padding: 14px 18px; border: 1px solid #ddd; border-left: 4px solid hsl(35 70% 50%); border-radius: 8px; background: #fff; }
      .db-checks-box h2 { margin-top: 0; color: #333; }
      .db-checks-intro { font-size: 12px; color: #666; margin: -4px 0 12px; }
      .db-checks-list { list-style: none; margin: 0; padding: 0; }
      .db-checks-list li { display: flex; align-items: flex-start; gap: 8px; padding: 6px 0; font-size: 13px; border-bottom: 1px solid #f0f0f0; }
      .db-checks-list li:last-child { border-bottom: none; }
      .db-check-warning { color: hsl(35 80% 30%); }
      .db-check-good { color: hsl(125 35% 25%); }
    </style>
    </head><body><div class="page-topics"><div id="db-live-preview"></div></div></body></html>`);
  previewWindow.document.close();
  updatePreviewWindow();
}

function updatePreviewWindow() {
  if (!isPreviewWindowOpen()) return;
  const target = previewWindow.document.getElementById('db-live-preview');
  if (target) target.innerHTML = renderLivePreview(state.topsheet, state.blocks);
}

function renderAll(skipAutoSave) {
  document.getElementById('db-topsheet-form').innerHTML = renderTopsheetForm();

  const displayInfo = computeBlockDisplayInfo(state.blocks);
  const moveFlags = computeMoveFlags(state.blocks);
  // Attach a child count to each collapsed section block, for its summary line
  let lastSectionId = null;
  state.blocks.forEach(b => {
    if (b.type === 'section') {
      lastSectionId = b.id;
      b._childCount = 0;
    } else if (lastSectionId) {
      const sectionBlock = state.blocks.find(sb => sb.id === lastSectionId);
      if (sectionBlock) sectionBlock._childCount = (sectionBlock._childCount || 0) + 1;
    }
  });

  const visibleBlocks = state.blocks.filter(b => !displayInfo.get(b.id).hidden);
  const visibleIds = new Set(visibleBlocks.map(b => b.id));
  const groups = groupBlocksForOrdering(state.blocks);

  let listHtml = '';
  if (groups.length) {
    listHtml += renderSectionInsertRow(indexBeforeGroup(groups[0]), 'here');
  }
  groups.forEach((group, gi) => {
    const groupBlocks = [group.sectionBlock, ...group.children].filter(b => b && visibleIds.has(b.id));
    listHtml += groupBlocks
      .map(b => {
        const flags = moveFlags.get(b.id) || { up: false, down: false };
        return renderBlockEditor(b, flags.up, flags.down, displayInfo.get(b.id));
      })
      .join('');
    // Skip the trailing insert controls after the very last group — the
    // existing "Content" toolbar below the whole list already covers
    // adding to the end of the document, so this avoids showing the
    // same options twice in a row.
    if (gi < groups.length - 1) {
      const isCollapsed = group.sectionBlock && group.sectionBlock.collapsed;
      if (!isCollapsed) listHtml += renderContentInsertRow(indexAfterGroup(group));
      listHtml += renderSectionInsertRow(indexAfterGroup(group), 'here');
    }
  });
  document.getElementById('db-block-list').innerHTML = listHtml
    || '<p class="db-hint">No blocks yet — add your first section below.</p>';

  document.getElementById('db-live-preview').innerHTML = renderLivePreview(state.topsheet, state.blocks);
  updatePreviewWindow();
  attachHandlers();
  if (!skipAutoSave) autoSaveToBrowser();
}

function reorderBlockByDrag(draggedId, targetId) {
  if (draggedId === targetId) return;
  const groups = groupBlocksForOrdering(state.blocks);
  const draggedBlock = findBlock(draggedId);
  const targetBlock = findBlock(targetId);
  if (!draggedBlock || !targetBlock) return;

  if (draggedBlock.type === 'section') {
    // Sections can only be reordered among other sections.
    if (targetBlock.type !== 'section') return;
    const fromIdx = groups.findIndex(g => g.sectionBlock && g.sectionBlock.id === draggedId);
    const toIdx = groups.findIndex(g => g.sectionBlock && g.sectionBlock.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = groups.splice(fromIdx, 1);
    groups.splice(toIdx, 0, moved);
  } else {
    // Non-section blocks can only be reordered within their own
    // section's children — never into a different section's list,
    // matching exactly what the up/down arrows already enforce.
    if (targetBlock.type === 'section') return;
    const fromGroup = groups.find(g => g.children.some(c => c.id === draggedId));
    const toGroup = groups.find(g => g.children.some(c => c.id === targetId));
    if (!fromGroup || !toGroup || fromGroup !== toGroup) return;
    const fromIdx = fromGroup.children.findIndex(c => c.id === draggedId);
    const toIdx = fromGroup.children.findIndex(c => c.id === targetId);
    const [moved] = fromGroup.children.splice(fromIdx, 1);
    fromGroup.children.splice(toIdx, 0, moved);
  }

  state.blocks = flattenGroups(groups);
  renderAll();
}

function attachHandlers() {
  // Topsheet fields
  document.querySelectorAll('#db-topsheet-form [data-field]').forEach(el => {
    el.addEventListener('input', () => {
      state.topsheet[el.dataset.field] = el.dataset.dateField ? isoToDdmmyyyy(el.value) : el.value;
      syncPreviewOnly();
      updatePrivateFieldsSummary();
      updatePublicFieldsSummary();
    });
    if (el.dataset.dateField && typeof el.showPicker === 'function') {
      el.addEventListener('click', () => {
        try { el.showPicker(); } catch (e) { /* already open, or blocked - fine either way */ }
      });
    }
  });
  const privateDetails = document.getElementById('db-private-details');
  if (privateDetails) {
    privateDetails.addEventListener('toggle', () => { state.privateFieldsOpen = privateDetails.open; });
  }
  const publicDetails = document.getElementById('db-public-details');
  if (publicDetails) {
    publicDetails.addEventListener('toggle', () => { state.publicFieldsOpen = publicDetails.open; });
  }

  // Drag-to-reorder. draggable="true" sits on the whole block (required
  // for the block itself to be the thing that moves), but a mousedown
  // on any interactive element inside it temporarily disables dragging
  // so selecting text in an input, or using its own controls, is never
  // mistaken for an attempt to drag the block.
  document.querySelectorAll('.db-block').forEach(blockEl => {
    blockEl.querySelectorAll('input, textarea, select, button').forEach(interactive => {
      interactive.addEventListener('mousedown', () => { blockEl.draggable = false; });
      interactive.addEventListener('mouseup', () => { blockEl.draggable = true; });
    });

    blockEl.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', blockEl.dataset.blockId);
      e.dataTransfer.effectAllowed = 'move';
      blockEl.classList.add('db-dragging');
    });
    blockEl.addEventListener('dragend', () => {
      blockEl.classList.remove('db-dragging');
      document.querySelectorAll('.db-drop-target').forEach(el => el.classList.remove('db-drop-target', 'db-drop-invalid'));
    });
    blockEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      const draggedId = e.dataTransfer.getData('text/plain') || document.querySelector('.db-dragging')?.dataset.blockId;
      const draggedBlock = findBlock(draggedId);
      const targetBlock = findBlock(blockEl.dataset.blockId);
      const validDrop = draggedBlock && targetBlock && draggedId !== blockEl.dataset.blockId
        && (draggedBlock.type === 'section') === (targetBlock.type === 'section');
      blockEl.classList.add('db-drop-target');
      blockEl.classList.toggle('db-drop-invalid', !validDrop);
    });
    blockEl.addEventListener('dragleave', () => {
      blockEl.classList.remove('db-drop-target', 'db-drop-invalid');
    });
    blockEl.addEventListener('drop', (e) => {
      e.preventDefault();
      const draggedId = e.dataTransfer.getData('text/plain');
      reorderBlockByDrag(draggedId, blockEl.dataset.blockId);
    });
  });

  // Block-level controls
  document.querySelectorAll('[data-action="up"]').forEach(el => el.addEventListener('click', () => moveBlock(el.dataset.id, -1)));
  document.querySelectorAll('[data-action="down"]').forEach(el => el.addEventListener('click', () => moveBlock(el.dataset.id, 1)));
  document.querySelectorAll('[data-action="remove"]').forEach(el => el.addEventListener('click', () => removeBlock(el.dataset.id)));
  document.querySelectorAll('[data-action="toggle-collapse"]').forEach(el => el.addEventListener('click', () => {
    const block = findBlock(el.dataset.id);
    if (block) { block.collapsed = !block.collapsed; renderAll(); }
  }));
  document.querySelectorAll('[data-action="duplicate"]').forEach(el => el.addEventListener('click', () => duplicateSection(el.dataset.id)));

  // Simple field edits (title, subheading style/text, paragraph text, caption)
  document.querySelectorAll('[data-prop="title"], [data-prop="text"], [data-prop="style"], [data-prop="caption"]').forEach(el => {
    el.addEventListener('input', () => {
      const block = findBlock(el.dataset.id);
      if (block) { block[el.dataset.prop] = el.value; syncPreviewOnly(); }
    });
  });

  document.querySelectorAll('[data-prop="paragraphText"]').forEach(el => {
    // legacy — no longer rendered, kept only so old saved state (if any) doesn't error
  });
  document.querySelectorAll('.db-run-text').forEach(el => {
    el.addEventListener('input', () => {
      const block = findBlock(el.dataset.id);
      if (block) { block.runs[parseInt(el.dataset.runIndex, 10)].text = el.value; syncPreviewOnly(); }
    });
  });
  document.querySelectorAll('[data-run-prop]').forEach(el => {
    el.addEventListener('change', () => {
      const block = findBlock(el.dataset.id);
      if (block) { block.runs[parseInt(el.dataset.runIndex, 10)][el.dataset.runProp] = el.checked; syncPreviewOnly(); }
    });
  });
  document.querySelectorAll('[data-action="add-run"]').forEach(el => el.addEventListener('click', () => {
    const block = findBlock(el.dataset.id);
    if (block) { block.runs.push({ text: '' }); renderAll(); }
  }));
  document.querySelectorAll('[data-action="remove-run"]').forEach(el => el.addEventListener('click', () => {
    const block = findBlock(el.dataset.id);
    if (block) { block.runs.splice(parseInt(el.dataset.runIndex, 10), 1); renderAll(); }
  }));

  // List items
  document.querySelectorAll('[data-prop="item"]').forEach(el => {
    el.addEventListener('input', () => {
      const block = findBlock(el.dataset.id);
      if (block) { block.items[parseInt(el.dataset.itemIndex, 10)] = el.value; syncPreviewOnly(); }
    });
    el.addEventListener('paste', (e) => {
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      const lines = text.split(/\r\n|\r|\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length <= 1) return; // single line - let the browser handle it normally
      e.preventDefault();
      const block = findBlock(el.dataset.id);
      if (!block) return;
      const idx = parseInt(el.dataset.itemIndex, 10);
      block.items.splice(idx, 1, ...lines);
      renderAll();
    });
  });
  document.querySelectorAll('[data-action="add-item"]').forEach(el => el.addEventListener('click', () => {
    const block = findBlock(el.dataset.id);
    if (block) { block.items.push(''); renderAll(); }
  }));
  document.querySelectorAll('[data-action="remove-item"]').forEach(el => el.addEventListener('click', () => {
    const block = findBlock(el.dataset.id);
    if (block) { block.items.splice(parseInt(el.dataset.itemIndex, 10), 1); renderAll(); }
  }));

  // Table cells
  document.querySelectorAll('[data-prop="cell"]').forEach(el => {
    el.addEventListener('input', () => {
      const block = findBlock(el.dataset.id);
      if (block) { block.rows[parseInt(el.dataset.row, 10)][parseInt(el.dataset.col, 10)] = el.value; syncPreviewOnly(); }
    });
  });
  document.querySelectorAll('[data-action="add-row"]').forEach(el => el.addEventListener('click', () => {
    const block = findBlock(el.dataset.id);
    if (block) { block.rows.push(block.rows[0].map(() => '')); renderAll(); }
  }));
  document.querySelectorAll('[data-action="add-col"]').forEach(el => el.addEventListener('click', () => {
    const block = findBlock(el.dataset.id);
    if (block) { block.rows.forEach(r => r.push('')); renderAll(); }
  }));
  document.querySelectorAll('[data-action="remove-row"]').forEach(el => el.addEventListener('click', () => {
    const block = findBlock(el.dataset.id);
    if (block) { block.rows.splice(parseInt(el.dataset.row, 10), 1); renderAll(); }
  }));
  document.querySelectorAll('[data-action="remove-col"]').forEach(el => el.addEventListener('click', () => {
    const block = findBlock(el.dataset.id);
    if (block) {
      const col = parseInt(el.dataset.col, 10);
      block.rows.forEach(r => r.splice(col, 1));
      renderAll();
    }
  }));

  // Image upload
  document.querySelectorAll('[data-prop="imageFile"]').forEach(el => {
    el.addEventListener('change', async () => {
      const file = el.files[0];
      if (!file) return;
      const block = findBlock(el.dataset.id);
      if (!block) return;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const dataUrl = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
      const img = new Image();
      img.onload = () => {
        block.imageBytes = bytes;
        block.dataUrl = dataUrl;
        block.imageType = file.type.includes('png') ? 'png' : 'jpg';
        // Cap displayed/exported size at a sensible max width, preserving aspect ratio
        const maxW = 500;
        block.width = Math.min(img.width, maxW);
        block.height = Math.round(img.height * (block.width / img.width));
        renderAll();
      };
      img.src = dataUrl;
    });
  });
}

function updatePrivateFieldsSummary() {
  const privateFields = TOPSHEET_FORM_FIELDS.filter(f => !f[3]);
  const filledCount = privateFields.filter(([key]) => (state.topsheet[key] || '').trim()).length;
  const summaryEl = document.querySelector('#db-private-details summary');
  if (summaryEl) {
    summaryEl.textContent = `Private fields \u2014 ${filledCount} complete, ${privateFields.length - filledCount} incomplete. Kept internal, never published, but still needed by NSHD for record-keeping.`;
  }
}

function updatePublicFieldsSummary() {
  const publicFields = TOPSHEET_FORM_FIELDS.filter(f => f[3]);
  const filledCount = publicFields.filter(([key]) => (state.topsheet[key] || '').trim()).length;
  const summaryEl = document.querySelector('#db-public-details summary');
  if (summaryEl) {
    summaryEl.textContent = `Public fields (shown on the page) \u2014 ${filledCount} complete, ${publicFields.length - filledCount} incomplete.`;
  }
}

function syncPreviewOnly() {
  document.getElementById('db-live-preview').innerHTML = renderLivePreview(state.topsheet, state.blocks);
  updatePreviewWindow();
  autoSaveToBrowser();
}

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function saveProgress() {
  // imageBytes (a Uint8Array) isn't meaningfully JSON-serialisable —
  // dataUrl already carries the same image as a base64 string, so
  // imageBytes is dropped here and reconstructed from dataUrl on load
  // instead, rather than saving the same image data twice.
  const payload = {
    _type: 'owl-doc-builder-progress',
    _version: 1,
    topsheet: state.topsheet,
    blocks: state.blocks.map(b => {
      if (b.type === 'image') {
        const { imageBytes, ...rest } = b;
        return rest;
      }
      return b;
    }),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const filename = (state.topsheet.title || 'documentation-progress').replace(/[^A-Za-z0-9 _-]/g, '').trim() || 'documentation-progress';
  a.download = filename + '.owlprogress.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function resumeProgress(file) {
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch (e) {
    alert('That file doesn\'t look like a valid saved-progress file (couldn\'t be read as JSON).');
    return;
  }
  if (payload._type !== 'owl-doc-builder-progress') {
    alert('That file doesn\'t look like a saved-progress file from this tool. If you meant to continue editing a downloaded Word document, that can only be done in Word — it can\'t be re-uploaded here.');
    return;
  }
  if (state.blocks.length > 0 || Object.values(state.topsheet).some(v => (v || '').trim())) {
    if (!confirm('This replaces everything currently in the form with the saved progress. Continue?')) return;
  }
  state.topsheet = Object.assign({}, payload.topsheet);
  state.blocks = (payload.blocks || []).map(b => {
    if (b.type === 'image' && b.dataUrl) {
      return Object.assign({}, b, { imageBytes: dataUrlToBytes(b.dataUrl) });
    }
    return b;
  });
  if (hasAnyPrivateFieldFilled(state.topsheet)) state.privateFieldsOpen = true;
  renderAll();
}

async function handleDownload() {
  const btn = document.getElementById('db-download-btn');
  btn.disabled = true;
  btn.textContent = 'Building document…';
  try {
    const blob = await generateDocx(state.topsheet, state.blocks);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const filename = (state.topsheet.title || state.topsheet.categories || 'Documentation').replace(/[^A-Za-z0-9 _-]/g, '').trim() || 'Documentation';
    a.download = filename + '.docx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    // The document is now finished and handed off — clear the
    // browser's auto-saved draft so it doesn't linger and get
    // confusingly offered back on a future visit.
    clearAutoSave();
  } catch (e) {
    alert('Something went wrong building the document: ' + e.message);
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Download as Word document';
  }
}

function loadAtopyExample() {
  const hasContent = state.blocks.length > 0 || Object.values(state.topsheet).some(v => (v || '').trim());
  const message = 'This replaces everything currently in the form with the Atopy example \u2014 including example values in the private fields below (source file, syntax details, and so on). Remember to replace those with your own before submitting. Continue?';
  if (hasContent && !confirm(message)) {
    return;
  }
  const example = getAtopyExample();
  state.topsheet = Object.assign({}, example.topsheet);
  state.blocks = example.blocks;
  state.privateFieldsOpen = true;
  renderAll();
}

function clearForm() {
  if (!confirm('This clears the form back to blank, placeholder-only fields. Continue?')) {
    return;
  }
  Object.keys(state.topsheet).forEach(k => { state.topsheet[k] = ''; });
  state.blocks = [];
  state.privateFieldsOpen = true;
  clearAutoSave();
  renderAll();
}

document.addEventListener('DOMContentLoaded', () => {
  const restored = offerAutoSaveRestore();
  if (!restored) renderAll();
  document.getElementById('db-download-btn').addEventListener('click', handleDownload);
  document.querySelectorAll('[data-add-block]').forEach(btn => {
    btn.addEventListener('click', () => addBlock(btn.dataset.addBlock));
  });
  document.getElementById('db-block-list').addEventListener('click', (e) => {
    const btn = e.target.closest('.db-insert-btn');
    if (!btn) return;
    const row = btn.closest('.db-insert-row');
    const index = parseInt(row.dataset.insertIndex, 10);
    addBlock(btn.dataset.insertType, index);
  });
  const loadBtn = document.getElementById('db-load-example-btn');
  if (loadBtn) loadBtn.addEventListener('click', loadAtopyExample);
  const clearBtn = document.getElementById('db-clear-form-btn');
  if (clearBtn) clearBtn.addEventListener('click', clearForm);
  const saveBtn = document.getElementById('db-save-progress-btn');
  if (saveBtn) saveBtn.addEventListener('click', saveProgress);
  const resumeInput = document.getElementById('db-resume-progress-input');
  if (resumeInput) resumeInput.addEventListener('change', () => {
    if (resumeInput.files[0]) resumeProgress(resumeInput.files[0]);
    resumeInput.value = '';
  });
  const dismissBtn = document.getElementById('db-autosave-notice-dismiss');
  if (dismissBtn) dismissBtn.addEventListener('click', () => {
    document.getElementById('db-autosave-notice').style.display = 'none';
  });

  const mainPreviewBtn = document.getElementById('db-open-preview-window-btn');
  if (mainPreviewBtn) mainPreviewBtn.addEventListener('click', () => { openPreviewWindow(); updatePreviewButtonState(); });

  const sidebarTrigger = document.getElementById('db-sidebar-preview-trigger');
  const sidebarMenu = document.getElementById('db-sidebar-preview-menu');
  if (sidebarTrigger && sidebarMenu) {
    sidebarTrigger.addEventListener('click', (e) => {
      e.preventDefault();
      sidebarMenu.classList.toggle('db-menu-open');
    });
    sidebarMenu.querySelectorAll('[data-preview-action]').forEach(opt => {
      opt.addEventListener('click', () => {
        sidebarMenu.classList.remove('db-menu-open');
        if (opt.dataset.previewAction === 'scroll') {
          document.getElementById('db-preview-section').scrollIntoView({ behavior: 'smooth' });
          history.replaceState(null, '', '#db-preview-section');
        } else if (opt.dataset.previewAction === 'popup') {
          openPreviewWindow();
          updatePreviewButtonState();
        }
      });
    });
    document.addEventListener('click', (e) => {
      if (!sidebarTrigger.contains(e.target) && !sidebarMenu.contains(e.target)) {
        sidebarMenu.classList.remove('db-menu-open');
      }
    });
  }
  setInterval(updatePreviewButtonState, 1000);
});

function updatePreviewButtonState() {
  const open = isPreviewWindowOpen();
  const mainBtn = document.getElementById('db-open-preview-window-btn');
  if (mainBtn) mainBtn.textContent = open ? 'Preview window open — click to focus it' : 'Open live preview in a new window';
}