document.addEventListener("DOMContentLoaded", () => {

  const SITE_BASEURL = "/OWL";
  const DICT_URL     = `${SITE_BASEURL}/docs/search_methods/data_dictionary/NSHD_Data_Dictionary_Public.json`;
  const SIDECAR_BASE = `${SITE_BASEURL}/assets/variable_metadata/`;
  const PAGE_SIZE    = 20;

  let allFields      = [];
  let filteredFields = [];
  let currentPage    = 1;
  const openPanels   = new Set();
  const loadedPanels = new Set();
  const chartRegistry = {};
  let sortState = { col: 'fieldId', dir: 'asc' };

  // ── Helpers ──────────────────────────────────────────────────────────────

  function yearToSort(y) {
    const m = String(y || '').match(/(\d{4})/);
    return m ? parseInt(m[1]) : 0;
  }

  function yearToAge(y) {
    const s  = String(y || '');
    const m1 = s.match(/^(\d{4})-(\d{2})$/);
    if (m1) {
      const y1 = parseInt(m1[1]);
      const y2 = parseInt(m1[1].slice(0, 2) + m1[2]);
      return `${y1 - 1946}–${y2 - 1946}`;
    }
    const m2 = s.match(/^(\d{4})[-–](\d{4})$/);
    if (m2) return `${parseInt(m2[1]) - 1946}–${parseInt(m2[2]) - 1946}`;
    const yr = yearToSort(y);
    return yr ? String(yr - 1946) : '';
  }

  function stripId(s) {
    return (s || '').replace(/\s*\[.*?\]/g, '').trim();
  }

  function cleanLabel(s) {
    return (s || '')
      .replace(/\s*[-–]?\s*(?:at|by)\s+(?:age\s+)?[\d–\-]+(?:\s*[-–]\s*\d+)?\s*(?:years?|yars?)?\s*(?:[-–]\s*(?:first|second|third)\s+measure)?\s*\.?\s*$/gi, '')
      .trim();
  }

  function fmt(n) {
    if (n === null || n === undefined) return '—';
    return parseFloat(n.toFixed(2)).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  // ── Categorical colour palette ────────────────────────────────────────────
  // Fixed order, never cycled per-render — same colour always means the same
  // category across the chart, legend, and detail table rows.
  const CAT_PALETTE = [
    '#1baf7a', '#2a78d6', '#eda100', '#eb6834',
    '#e34948', '#9085e9', '#d55181', '#008300'
  ];

  function buildCategoryColorMap(sweepData) {
    const seen = [];
    sweepData.forEach(s => {
      (s.catCounts || []).forEach(c => {
        if (!seen.includes(c.label)) seen.push(c.label);
      });
    });
    const map = {};
    seen.forEach((label, i) => {
      map[label] = CAT_PALETTE[i % CAT_PALETTE.length];
    });
    return map;
  }

  // ── DOM refs ──────────────────────────────────────────────────────────────

  const loadingScreen    = document.getElementById('loadingScreen');
  const mainUI           = document.getElementById('mainUI');
  const searchBox        = document.getElementById('globalSearch');
  const sweepFilter      = document.getElementById('sweepFilter');
  const topicFilter      = document.getElementById('topicFilter');
  const resultsCount     = document.getElementById('resultsCount');
  const tbody            = document.getElementById('mainTbody');
  const paginationTop    = document.getElementById('paginationTop');
  const paginationBottom = document.getElementById('paginationBottom');

  // ── Load + group ──────────────────────────────────────────────────────────

  fetch(DICT_URL)
    .then(r => r.json())
    .then(data => {
      const groups = {};
      data.forEach(row => {
        const fid = row['Showcase Field ID'];
        if (!fid) return;
        if (!groups[fid]) {
          groups[fid] = {
            fieldId:    parseInt(fid),
            topic:      stripId(row['Topic'] || ''),
            sweeps:     [],
            varnames:   [],
            rawLabels:  []   // collected so we can pick the cleanest one below
          };
        }
        groups[fid].sweeps.push({
          varname: row['NSHD Variable Name'] || '',
          year:    row['Year of collection']  || ''
        });
        groups[fid].varnames.push(row['NSHD Variable Name'] || '');
        groups[fid].rawLabels.push(row['Variable Label'] || '');
      });

      allFields = Object.values(groups)
        .filter(g => g.sweeps.length > 1)
        .map(g => {
          g.sweeps.sort((a, b) => yearToSort(a.year) - yearToSort(b.year));

          // Clean every sweep's label and use the shortest result — this is the
          // one most likely to have had the "- at age N years" suffix fully
          // stripped, since sweep-specific wording variations (typos, "first
          // measure" suffixes, etc.) tend to produce longer leftover text.
          const cleaned = g.rawLabels.map(cleanLabel).filter(Boolean);
          g.label = cleaned.length
            ? cleaned.reduce((shortest, cur) =>
                cur.length < shortest.length ? cur : shortest)
            : '';
          delete g.rawLabels;

          return g;
        });

      // ── Compute and display banner metrics ───────────────────────────────
      const maxSweeps = Math.max(...allFields.map(f => f.sweeps.length));
      const allYears  = allFields.flatMap(f => f.sweeps.map(s => s.year)).filter(Boolean);
      const firstYear = allYears.reduce((a, b) => yearToSort(a) < yearToSort(b) ? a : b, allYears[0]);
      const lastYear  = allYears.reduce((a, b) => yearToSort(a) > yearToSort(b) ? a : b, allYears[0]);

      document.getElementById('metricCount').textContent  = allFields.length.toLocaleString();
      document.getElementById('metricSweeps').textContent = `Up to ${maxSweeps} sweeps`;
      document.getElementById('metricRange').textContent  = `${firstYear} – ${lastYear}`;

      // ── Populate topic dropdown ──────────────────────────────────────────
      const topics = [...new Set(allFields.map(f => f.topic).filter(Boolean))].sort();
      topics.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        topicFilter.appendChild(opt);
      });

      loadingScreen.style.display = 'none';
      mainUI.style.display        = 'block';
      applyFilters();

      // ── Deep-link from variable metadata page ─────────────────────────────
      // URL pattern: ?fid=1042&open=true
      // Sent by "View ▶" and "View all in Longitudinal Search" buttons on
      // each variable's Linked & Longitudinal tab. Scrolls to the matching
      // Field ID row and opens its detail panel automatically.
      const params = new URLSearchParams(window.location.search);
      const fidParam  = params.get('fid');
      const openParam = params.get('open');
      if (fidParam && openParam === 'true') {
        const target = allFields.find(f => String(f.fieldId) === String(fidParam));
        if (target) {
          // Paginate to the page containing this Field ID
          const idx = filteredFields.indexOf(target);
          if (idx >= 0) {
            currentPage = Math.floor(idx / PAGE_SIZE) + 1;
            renderTable();
          }
          // Wait one tick for the DOM to render, then open the panel
          setTimeout(() => {
            const btn = tbody.querySelector(`.view-btn[data-fid="${target.fieldId}"]`);
            if (btn) {
              togglePanel(target.fieldId, target, btn);
              // Scroll the row into view
              const row = btn.closest('tr');
              if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, 100);
        }
      }
    })
    .catch(err => {
      loadingScreen.innerHTML =
        '<p style="color:#A32D2D;padding:20px;">Failed to load data dictionary. Check the console for details.</p>';
      console.error(err);
    });

  // ── Filters ───────────────────────────────────────────────────────────────

  function applyFilters() {
    const q         = (searchBox.value || '').toLowerCase().trim();
    const minSweeps = parseInt(sweepFilter.value) || 2;
    const topic     = topicFilter.value;

    filteredFields = allFields.filter(f => {
      if (f.sweeps.length < minSweeps) return false;
      if (topic && f.topic !== topic) return false;
      if (q) {
        const inLabel   = f.label.toLowerCase().includes(q);
        const inFieldId = String(f.fieldId).includes(q);
        const inVars    = f.varnames.some(v => v.toLowerCase().includes(q));
        if (!inLabel && !inFieldId && !inVars) return false;
      }
      return true;
    });

    applySort();
  }

  searchBox.addEventListener('input', applyFilters);
  sweepFilter.addEventListener('change', applyFilters);
  topicFilter.addEventListener('change', applyFilters);

  // ── Sorting ───────────────────────────────────────────────────────────────

  function applySort() {
    const { col, dir } = sortState;
    filteredFields.sort((a, b) => {
      let av, bv;
      if (col === 'fieldId') { av = a.fieldId;  bv = b.fieldId; }
      if (col === 'label')   { av = a.label.toLowerCase();  bv = b.label.toLowerCase(); }
      if (col === 'topic')   { av = a.topic.toLowerCase();  bv = b.topic.toLowerCase(); }
      if (col === 'sweeps')  { av = a.sweeps.length; bv = b.sweeps.length; }
      if (av < bv) return dir === 'asc' ? -1 :  1;
      if (av > bv) return dir === 'asc' ?  1 : -1;
      return 0;
    });
    currentPage = 1;
    renderTable();
    updateSortIcons();
  }

  function updateSortIcons() {
    document.querySelectorAll('#mainTable thead th[data-sort]').forEach(th => {
      const icon = th.querySelector('.sort-icon');
      if (!icon) return;
      if (th.dataset.sort === sortState.col) {
        icon.textContent  = sortState.dir === 'asc' ? ' ▲' : ' ▼';
        icon.style.opacity = '1';
      } else {
        icon.textContent  = ' ⇅';
        icon.style.opacity = '0.4';
      }
    });
  }

  document.querySelectorAll('#mainTable thead th[data-sort]').forEach(th => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (sortState.col === col) {
        sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
      } else {
        sortState.col = col;
        sortState.dir = 'asc';
      }
      applySort();
    });
  });

  // ── Render table ──────────────────────────────────────────────────────────

  function renderTable() {
    const total      = filteredFields.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const start      = (currentPage - 1) * PAGE_SIZE;
    const pageRows   = filteredFields.slice(start, start + PAGE_SIZE);

    // ── Load basket ONCE per render into a Set (O(1) lookups) ─────────────
    // Avoids calling isInBasket() (which re-reads localStorage) for every
    // variable on every row — key fix for pagination performance with large
    // baskets (100+ items).
    const basketSet = new Set(loadBasket().map(item => item.varName));
    const inBasketFast = varName => basketSet.has(varName);

    resultsCount.textContent = `${total.toLocaleString()} longitudinal fields`;
    tbody.innerHTML = '';

    pageRows.forEach(f => {
      const firstYear  = f.sweeps[0]?.year || '';
      const lastYear   = f.sweeps[f.sweeps.length - 1]?.year || '';
      const yearRange  = firstYear === lastYear ? firstYear : `${firstYear} → ${lastYear}`;
      const allNames   = f.varnames.filter(Boolean).map(n =>
        `<a href="https://rmjdish.github.io/OWL/assets/variable_metadata/${n}" target="_blank" rel="noopener"
            style="color:#534AB7;text-decoration:underline;text-underline-offset:2px;">${n}</a>`
      ).join(' &middot; ');
      const panelId    = `panel-${f.fieldId}`;

      // Determine basket state for this Field ID's variables — recomputed every render
      const validNames    = f.varnames.filter(Boolean);
      const inBasketCount = validNames.filter(n => inBasketFast(n)).length;
      const allInBasket    = validNames.length > 0 && inBasketCount === validNames.length;
      const someInBasket  = inBasketCount > 0 && inBasketCount < validNames.length;

      let checkboxClass   = '';
      let checkboxChecked = '';
      let checkboxTitle   = 'No sweeps in basket yet';
      if (allInBasket) {
        checkboxClass   = 'check-full';
        checkboxChecked = 'checked';
        checkboxTitle   = 'All sweeps already in basket';
      } else if (someInBasket) {
        checkboxClass   = 'check-partial';
        checkboxTitle   = `${inBasketCount} of ${validNames.length} sweeps already in basket (added elsewhere)`;
      }

      const tr = document.createElement('tr');
      tr.dataset.fieldId = f.fieldId;
      tr.innerHTML = `
        <td class="col-check">
          <input type="checkbox" class="row-check ${checkboxClass}"
                 data-varnames="${f.varnames.join(',')}"
                 data-label="${f.label.replace(/"/g, '&quot;')}"
                 title="${checkboxTitle}"
                 ${checkboxChecked}
                 style="width:14px;height:14px;">
        </td>
        <td class="col-fid">
          <a href="https://datashare.ndph.ox.ac.uk/nshd46/field.cgi?id=${f.fieldId}"
             target="_blank" rel="noopener"
             style="color:#534AB7;text-decoration:underline;text-underline-offset:2px;">${f.fieldId}</a>
        </td>
        <td class="col-label">
          <div class="label-text">${f.label}</div>
          <div style="font-size:10.5px;color:var(--text-secondary);margin-top:3px;line-height:1.6;">${allNames}</div>
        </td>
        <td class="col-topic">${f.topic}</td>
        <td class="col-sweeps">
          <span style="font-size:11px;font-weight:500;padding:2px 8px;border-radius:6px;
                       background:#E1F5EE;color:#085041;">${f.sweeps.length} sweeps</span>
          <div style="font-size:10px;color:var(--text-muted);margin-top:3px;">${yearRange}</div>
        </td>
        <td class="col-view">
          <button class="view-btn" data-fid="${f.fieldId}"
                  style="font-size:11px;height:26px;padding:0 10px;width:100%;
                         display:flex;align-items:center;justify-content:center;gap:4px;">
            <i class="ti ti-chart-line" aria-hidden="true" style="font-size:11px;"></i> View
          </button>
        </td>`;
      tbody.appendChild(tr);

      // Panel row
      const panelRow = document.createElement('tr');
      panelRow.id            = panelId;
      panelRow.style.display = 'none';
      panelRow.innerHTML = `
        <td colspan="6" style="padding:0;background:#F8F6FF;border-bottom:2px solid #534AB7;">
          <div id="panel-content-${f.fieldId}" style="padding:16px 20px;">
            <div style="color:var(--text-muted);font-size:12px;display:flex;
                        align-items:center;gap:8px;">
              <span style="width:14px;height:14px;border:2px solid #534AB7;
                           border-top-color:transparent;border-radius:50%;display:inline-block;
                           animation:spin .8s linear infinite;flex-shrink:0;"></span>
              Loading sweep data…
            </div>
          </div>
        </td>`;
      tbody.appendChild(panelRow);
    });

    // Attach events
    tbody.querySelectorAll('.view-btn').forEach(btn => {
      btn.onclick = () => {
        const fid   = parseInt(btn.dataset.fid);
        const field = allFields.find(f => f.fieldId === fid);
        if (field) togglePanel(fid, field, btn);
      };
    });

    tbody.querySelectorAll('.row-check').forEach(cb => {
      cb.onchange = () => {
        const names = cb.dataset.varnames.split(',').filter(Boolean);
        const label = cb.dataset.label;
        const wasPartial = cb.classList.contains('check-partial');

        // From a partial state, clicking always completes the set (adds remaining sweeps).
        // From empty, clicking adds all. From full, unclicking removes all.
        if (wasPartial || cb.checked) {
          names.forEach(n => addToBasket(n, label));
          cb.checked = true;
        } else {
          names.forEach(n => removeFromBasket(n));
        }

        cb.classList.remove('check-partial');
        cb.classList.toggle('check-full', cb.checked);
        updateBasketCountUI();

        // Refresh the expanded panel's sweep checkboxes if open
        const fid = parseInt(cb.closest('tr').dataset.fieldId);
        if (openPanels.has(fid)) refreshPanelCheckboxes(fid);
      };
    });

    renderPagination(totalPages);
  }

  // ── Panel toggle ──────────────────────────────────────────────────────────

  function togglePanel(fid, field, btn) {
    const panelRow = document.getElementById(`panel-${fid}`);
    if (!panelRow) return;
    const isOpen = openPanels.has(fid);

    if (isOpen) {
      panelRow.style.display = 'none';
      openPanels.delete(fid);
      btn.innerHTML         = '<i class="ti ti-chart-line" aria-hidden="true" style="font-size:11px;"></i> View';
      btn.style.background  = '';
      btn.style.borderColor = '';
      btn.style.color       = '';
    } else {
      panelRow.style.display = '';
      openPanels.add(fid);
      btn.innerHTML         = '<i class="ti ti-x" aria-hidden="true" style="font-size:11px;"></i> Close';
      btn.style.background  = '#EEEDFE';
      btn.style.borderColor = '#534AB7';
      btn.style.color       = '#3C3489';
      if (!loadedPanels.has(fid)) {
        loadedPanels.add(fid);
        loadPanelData(fid, field);
      }
    }
  }

  // ── Sidecar fetch + panel render ──────────────────────────────────────────

  function loadPanelData(fid, field) {
    const contentDiv = document.getElementById(`panel-content-${fid}`);

    Promise.all(
      field.sweeps.map(s =>
        fetch(`${SIDECAR_BASE}${s.varname}.json`)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      )
    ).then(sidecars => {

      const sweepData = field.sweeps.map((s, i) => ({
        varname:   s.varname,
        year:      s.year,
        age:       yearToAge(s.year),
        mean:      sidecars[i]?.mean        ?? null,
        sd:        sidecars[i]?.sd          ?? null,
        min:       sidecars[i]?.minimum     ?? null,
        max:       sidecars[i]?.maximum     ?? null,
        n:         sidecars[i]?.series_size ?? null,
        distType:  sidecars[i]?.dist_type   ?? 'continuous',
        valLabels: sidecars[i]?.value_labels ?? [],
        catCounts: sidecars[i]?.category_counts ?? []
      }));

      const isContinuous  = sweepData.some(s => s.distType === 'continuous' && s.mean !== null);
      const sharedUnits   = sidecars.find(s => s?.units)?.units || '';
      const sharedDerived = sidecars.find(s => s?.derived != null)?.derived ?? '';
      const valLabels     = sweepData.find(s => s.valLabels?.length)?.valLabels || [];
      const units         = sharedUnits && sharedUnits !== 'Not applicable' ? sharedUnits : '';

      const metaItems = [
        units         ? `<div><div class="sh-lbl">Units</div>
          <div class="sh-val" style="color:#534AB7;">${units}</div></div>` : '',
        sharedDerived !== '' ? `<div><div class="sh-lbl">Derived</div>
          <div class="sh-val" style="color:${sharedDerived==='1'?'#854F0B':'#085041'}">
            ${sharedDerived==='1'?'Yes':'No'}</div></div>` : '',
        `<div><div class="sh-lbl">Type</div>
          <div class="sh-val" style="color:#085041;">
            ${isContinuous?'Continuous':'Categorical'}</div></div>`
      ].filter(Boolean).join('');

      const chartId  = `chart-${fid}`;
      const catColorMap = isContinuous ? {} : buildCategoryColorMap(sweepData);

      const tableRows = sweepData.map((s, i) => {
        const bg = i % 2 === 0 ? 'background:#F0EBF8;' : 'background:#E0D4F0;';
        const inBasket = s.varname && isInBasket(s.varname);
        const checkCell = `<td class="sweep-add-col" style="border-bottom:1px solid #C4ADE8;border-right:1px solid #C4ADE8;">
          <input type="checkbox" class="sweep-check"
                 data-varname="${s.varname}"
                 data-label="${field.label.replace(/"/g,'&quot;')}"
                 data-fid="${fid}"
                 ${inBasket ? 'checked' : ''}>
        </td>`;
        const B = 'border-bottom:1px solid #C4ADE8;border-right:1px solid #C4ADE8;padding:5px 6px;';
        if (isContinuous) {
          return `<tr style="${bg}">
            ${checkCell}
            <td style="${B}color:#534AB7;font-weight:500;">
              <a href="https://rmjdish.github.io/OWL/assets/variable_metadata/${s.varname}" target="_blank" rel="noopener"
                 style="color:#534AB7;text-decoration:underline;text-underline-offset:2px;">${s.varname}</a>
            </td>
            <td style="${B}">${s.year}</td><td style="${B}">${s.age}</td>
            <td style="${B}">${fmt(s.mean)}</td>
            <td style="${B}">${fmt(s.sd)}</td>
            <td style="${B}">${fmt(s.min)}</td>
            <td style="${B}">${fmt(s.max)}</td>
            <td style="border-bottom:1px solid #C4ADE8;padding:5px 6px;">${s.n !== null ? Math.round(s.n).toLocaleString() : '—'}</td>
          </tr>`;
        } else {
          const counts = s.catCounts || [];
          const segments = counts.map(c =>
            `<div style="width:${c.pct}%;background:${catColorMap[c.label] || '#888780'};height:100%;" title="${c.label}: ${c.pct}%"></div>`
          ).join('');
          const distBar = counts.length
            ? `<div style="display:flex;height:10px;border-radius:3px;overflow:hidden;background:var(--surface-1);border:0.5px solid var(--border);margin-bottom:3px;">${segments}</div>`
            : '';
          const pctLabels = counts.length
            ? `<div style="font-size:9.5px;color:var(--text-secondary);line-height:1.5;">
                 ${counts.map(c =>
                   `<span style="color:${catColorMap[c.label] || '#888780'};font-weight:500;">${c.pct}%</span>`
                 ).join(' &middot; ')}
               </div>`
            : `<span style="color:var(--text-muted);font-style:italic;font-size:11px;">No distribution data</span>`;

          return `<tr style="${bg}">
            ${checkCell}
            <td style="${B}color:#534AB7;font-weight:500;">
              <a href="https://rmjdish.github.io/OWL/assets/variable_metadata/${s.varname}" target="_blank" rel="noopener"
                 style="color:#534AB7;text-decoration:underline;text-underline-offset:2px;">${s.varname}</a>
            </td>
            <td style="${B}">${s.year}</td><td style="${B}">${s.age}</td>
            <td style="${B}">
              ${distBar}${pctLabels}
            </td>
            <td style="border-bottom:1px solid #C4ADE8;padding:5px 6px;">${s.n !== null ? Math.round(s.n).toLocaleString() : '—'}</td>
          </tr>`;
        }
      }).join('');

      // ───────────────────────────────────────────────────────────────────
      // SINGLE SOURCE OF TRUTH for detail-table column widths.
      // Edit ONLY this block to resize any column — nothing else in the
      // file or CSS needs to change. width = px, header text is what
      // renders in the <th>. Every column here corresponds to exactly
      // one <td> in the matching row template below — keep the count
      // and order in sync if you ever add/remove a column.
      // ───────────────────────────────────────────────────────────────────
      const DTABLE_COLUMNS = {
        continuous: [
          { width: 22,  header: 'Add' },
          { width: 80,  header: 'Variable' },
          { width: 34,  header: 'Year' },
          { width: 28,  header: 'Age' },
          { width: 64,  header: `Mean${units ? ' (' + units + ')' : ''}` },
          { width: 64,  header: 'Standard Deviation' },
          { width: 38,  header: 'Minimum' },
          { width: 38,  header: 'Maximum' },
          { width: 24,  header: 'N' },
        ],
        categorical: [
          { width: 22,  header: 'Add' },
          { width: 80,  header: 'Variable' },
          { width: 34,  header: 'Year' },
          { width: 28,  header: 'Age' },
          { width: 250, header: 'Distribution' },
          { width: 24,  header: 'N' },
        ],
      };

      const cols         = isContinuous ? DTABLE_COLUMNS.continuous : DTABLE_COLUMNS.categorical;
      const tableWidthPx = cols.reduce((sum, c) => sum + c.width, 0);

      const colgroup = `<colgroup>${
        cols.map(c => `<col style="width:${c.width}px;">`).join('')
      }</colgroup>`;

      const theadCols = cols.map(c =>
        `<th${c.colspan ? ` colspan="${c.colspan}"` : ''}>${c.header}</th>`
      ).join('');

      const valLabelHtml = valLabels.length ? `
        <div style="margin-top:12px;">
          <div style="font-size:10px;font-weight:500;text-transform:uppercase;
                      letter-spacing:.05em;color:var(--text-muted);margin-bottom:5px;">
            Value labels — identical across all sweeps
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:5px;">
            ${valLabels.slice(0, 30).map(vl =>
              `<span style="font-size:11px;padding:2px 8px;border-radius:6px;
                            background:#EEEDFE;color:#3C3489;">
                <strong>${vl.value}</strong> = ${vl.label}
              </span>`).join('')}
            ${valLabels.length > 30
              ? `<span style="font-size:11px;color:var(--text-muted);">
                   +${valLabels.length - 30} more
                 </span>` : ''}
          </div>
        </div>` : '';

      contentDiv.innerHTML = `
        <div style="display:flex;align-items:flex-start;justify-content:space-between;
                    margin-bottom:12px;flex-wrap:wrap;gap:8px;">
          <div>
            <span style="font-size:15px;font-weight:500;color:#085041;">${field.label}</span>
            <span style="font-size:11px;color:var(--text-muted);margin-left:8px;">
              <a href="https://datashare.ndph.ox.ac.uk/nshd46/field.cgi?id=${fid}" target="_blank" rel="noopener"
                 style="color:#534AB7;text-decoration:underline;text-underline-offset:2px;">Field ID ${fid}</a>
              &middot; ${field.sweeps.length} sweeps
            </span>
          </div>
          <button id="addAllBtn-${fid}" onclick="toggleAllInPanel(${fid})"
                  style="font-size:11px;height:28px;padding:0 12px;">
            Add all ${field.sweeps.length} sweeps to basket
          </button>
        </div>

        <div style="background:var(--surface-1);border:0.5px solid var(--border);
                    border-radius:8px;padding:10px 14px;margin-bottom:12px;">
          <div style="font-size:10px;font-weight:500;text-transform:uppercase;
                      letter-spacing:.05em;color:var(--text-muted);margin-bottom:6px;">
            Shared across all sweeps
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
            ${metaItems}
          </div>
        </div>

        ${isContinuous ? `
          <div style="position:relative;height:180px;margin-bottom:6px;">
            <canvas id="${chartId}"></canvas>
          </div>
          <p style="font-size:11px;color:var(--text-muted);margin-bottom:10px;
                    font-style:italic;">
            Line = mean &middot; Shaded band = min–max (5th–95th percentile)
          </p>` : (Object.keys(catColorMap).length ? `
          <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:8px;">
            ${Object.entries(catColorMap).map(([label, color]) =>
              `<span style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text-secondary);">
                 <span style="width:10px;height:10px;border-radius:2px;background:${color};flex-shrink:0;"></span>
                 ${label}
               </span>`
            ).join('')}
          </div>
          <div style="position:relative;height:200px;margin-bottom:6px;">
            <canvas id="${chartId}"></canvas>
          </div>
          <p style="font-size:11px;color:var(--text-muted);margin-bottom:10px;
                    font-style:italic;">
            Stacked bars show the response distribution at each sweep
          </p>` : '')}

        <div class="dtable-wrap">
          <table class="dtable" style="width:${tableWidthPx}px !important;max-width:100% !important;">
            ${colgroup}
            <thead><tr>${theadCols}</tr></thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
        ${valLabelHtml}`;

      // Wire per-sweep checkboxes
      contentDiv.querySelectorAll('.sweep-check').forEach(cb => {
        cb.onchange = () => {
          const vn    = cb.dataset.varname;
          const label = cb.dataset.label;
          if (!vn) return;
          if (cb.checked) addToBasket(vn, label);
          else            removeFromBasket(vn);
          updateBasketCountUI();
          updateMainAddButton(fid);
          syncRowCheckbox(fid);
        };
      });
      updateMainAddButton(fid);

      if (isContinuous) {
        const valid = sweepData.filter(s => s.mean !== null);
        if (chartRegistry[fid]) {
          try { chartRegistry[fid].destroy(); } catch (e) {}
        }
        chartRegistry[fid] = new Chart(document.getElementById(chartId), {
          type: 'line',
          data: {
            labels: valid.map(s => s.year),
            datasets: [
              {
                label: 'Mean', data: valid.map(s => parseFloat(s.mean.toFixed(2))),
                borderColor: '#1D9E75', backgroundColor: '#1D9E75',
                pointRadius: 4, pointHoverRadius: 6, borderWidth: 2, tension: 0.3, order: 1
              },
              {
                label: 'Max', data: valid.map(s => s.max !== null ? parseFloat(s.max.toFixed(2)) : null),
                borderColor: 'rgba(29,158,117,0.2)', backgroundColor: 'rgba(29,158,117,0.08)',
                pointRadius: 0, borderWidth: 1, borderDash: [4,3], fill: '+1', tension: 0.3, order: 2
              },
              {
                label: 'Min', data: valid.map(s => s.min !== null ? parseFloat(s.min.toFixed(2)) : null),
                borderColor: 'rgba(29,158,117,0.2)', pointRadius: 0,
                borderWidth: 1, borderDash: [4,3], fill: false, tension: 0.3, order: 2
              }
            ]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                filter: i => i.datasetIndex === 0,
                callbacks: { label: c => ` Mean ${c.raw}${units ? ' ' + units : ''}` }
              }
            },
            scales: {
              x: { ticks: { font:{size:10}, color:'#888', maxRotation:45 },
                   grid:  { color:'rgba(0,0,0,0.05)' } },
              y: { ticks: { font:{size:10}, color:'#888',
                            callback: v => v + (units ? ' '+units : '') },
                   grid:  { color:'rgba(0,0,0,0.05)' } }
            }
          }
        });
      } else if (Object.keys(catColorMap).length) {
        const catLabels = Object.keys(catColorMap);
        const validCat  = sweepData.filter(s => (s.catCounts || []).length);
        if (chartRegistry[fid]) {
          try { chartRegistry[fid].destroy(); } catch (e) {}
        }
        chartRegistry[fid] = new Chart(document.getElementById(chartId), {
          type: 'bar',
          data: {
            labels: validCat.map(s => s.year),
            datasets: catLabels.map(label => ({
              label,
              data: validCat.map(s => {
                const match = (s.catCounts || []).find(c => c.label === label);
                return match ? match.pct : 0;
              }),
              backgroundColor: catColorMap[label]
            }))
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: { label: c => ` ${c.dataset.label}: ${c.raw}%` }
              }
            },
            scales: {
              x: { stacked: true,
                   ticks: { font:{size:10}, color:'#888', maxRotation:45 },
                   grid:  { display:false } },
              y: { stacked: true, max: 100,
                   ticks: { font:{size:10}, color:'#888', callback: v => v + '%' },
                   grid:  { color:'rgba(0,0,0,0.05)' } }
            }
          }
        });
      }
    });
  }

  // ── Global helper for inline onclick ─────────────────────────────────────

  window.toggleAllInPanel = function(fid) {
    const field = allFields.find(f => f.fieldId === fid);
    if (!field) return;
    const validNames    = field.varnames.filter(Boolean);
    const inBasketCount = validNames.filter(n => isInBasket(n)).length;
    const allIn          = validNames.length > 0 && inBasketCount === validNames.length;

    if (allIn) {
      // Currently full — remove every sweep
      validNames.forEach(n => removeFromBasket(n));
      document.querySelectorAll(`#panel-content-${fid} .sweep-check`)
        .forEach(cb => { cb.checked = false; });
    } else {
      // Not full — add every sweep
      validNames.forEach(n => addToBasket(n, field.label));
      document.querySelectorAll(`#panel-content-${fid} .sweep-check`)
        .forEach(cb => { cb.checked = true; });
    }

    updateBasketCountUI();
    updateMainAddButton(fid);
    syncRowCheckbox(fid);
  };

  // ── Sync the main table row checkbox to reflect current basket state ──────
  function syncRowCheckbox(fid) {
    const field = allFields.find(f => f.fieldId === fid);
    if (!field) return;
    const row = tbody.querySelector(`tr[data-field-id="${fid}"]`);
    if (!row) return;
    const cb = row.querySelector('.row-check');
    if (!cb) return;

    const validNames    = field.varnames.filter(Boolean);
    const _bs           = new Set(loadBasket().map(i => i.varName));
    const inBasketCount = validNames.filter(n => _bs.has(n)).length;
    const allIn          = validNames.length > 0 && inBasketCount === validNames.length;
    const someIn         = inBasketCount > 0 && inBasketCount < validNames.length;

    cb.classList.remove('check-full', 'check-partial');
    cb.checked = false;
    if (allIn) {
      cb.classList.add('check-full');
      cb.checked = true;
      cb.title = 'All sweeps already in basket';
    } else if (someIn) {
      cb.classList.add('check-partial');
      cb.title = `${inBasketCount} of ${validNames.length} sweeps already in basket (added elsewhere)`;
    } else {
      cb.title = 'No sweeps in basket yet';
    }
  }

  // ── Update the "Add all" button inside an open panel to reflect state ─────
  function updateMainAddButton(fid) {
    const field = allFields.find(f => f.fieldId === fid);
    if (!field) return;
    const btn = document.getElementById(`addAllBtn-${fid}`);
    if (!btn) return;

    const validNames    = field.varnames.filter(Boolean);
    const _bs2          = new Set(loadBasket().map(i => i.varName));
    const inBasketCount = validNames.filter(n => _bs2.has(n)).length;
    const allIn          = validNames.length > 0 && inBasketCount === validNames.length;

    if (allIn) {
      btn.innerHTML          = `<i class="ti ti-x" aria-hidden="true" style="font-size:11px;margin-right:3px;"></i> Remove all ${validNames.length} sweeps from basket`;
      btn.style.background   = '#D32F2F';
      btn.style.color        = '#fff';
      btn.style.borderColor  = '#D32F2F';
    } else {
      btn.innerHTML          = `Add all ${validNames.length} sweeps to basket`;
      btn.style.background   = '';
      btn.style.color        = '';
      btn.style.borderColor  = '';
    }
  }

  // ── Refresh sweep checkboxes inside an already-open panel ─────────────────
  function refreshPanelCheckboxes(fid) {
    const field = allFields.find(f => f.fieldId === fid);
    if (!field) return;
    document.querySelectorAll(`#panel-content-${fid} .sweep-check`).forEach(cb => {
      const vn = cb.dataset.varname;
      cb.checked = vn ? isInBasket(vn) : false;
    });
    updateMainAddButton(fid);
  }

  // ── Pagination ────────────────────────────────────────────────────────────

  function renderPagination(totalPages) {
    const html = `
      <button ${currentPage===1?'disabled':''} data-dir="-1" style="font-size:12px;height:28px;padding:0 10px;">← Prev</button>
      <span style="font-size:12px;color:var(--text-muted);">Page ${currentPage} of ${totalPages}</span>
      <button ${currentPage===totalPages?'disabled':''} data-dir="1" style="font-size:12px;height:28px;padding:0 10px;">Next →</button>`;
    [paginationTop, paginationBottom].forEach(el => {
      el.innerHTML = html;
      el.querySelectorAll('button').forEach(btn => {
        btn.onclick = () => {
          currentPage += parseInt(btn.dataset.dir);
          renderTable();
          window.scrollTo(0, 0);
        };
      });
    });
  }

  // ── Download CSV ──────────────────────────────────────────────────────────

  document.getElementById('downloadCsvBtn')?.addEventListener('click', () => {
    const rows = filteredFields.map(f => [
      f.fieldId,
      `"${f.label.replace(/"/g,'""')}"`,
      `"${f.topic}"`,
      f.sweeps.length,
      f.sweeps[0]?.year || '',
      f.sweeps[f.sweeps.length-1]?.year || '',
      `"${f.varnames.join(', ')}"`
    ].join(','));
    const csv  = ['Field ID,Label,Topic,Sweep count,First year,Last year,Variable names',...rows].join('\n');
    const url  = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    const link = document.createElement('a');
    link.href = url; link.download = 'NSHD_Longitudinal_Variables.csv'; link.click();
    URL.revokeObjectURL(url);
  });

  // ── Reset filters ────────────────────────────────────────────────────────

  document.getElementById('resetFiltersBtn')?.addEventListener('click', () => {
    searchBox.value     = '';
    sweepFilter.value   = '2';
    topicFilter.value   = '';
    sortState           = { col: 'fieldId', dir: 'asc' };
    applyFilters();
  });

});