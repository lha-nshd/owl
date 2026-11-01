/* Converts the block-based document model into a real .docx, using the
   exact same structural conventions the guide (and build_docs.py) rely
   on: Heading 1 for sections, one of four options for subheadings,
   real Word list numbering (never literal "1." typed as text), real
   tables, and a topsheet metadata table matching the field labels
   build_docs.py's own matching logic expects. */

const TOPSHEET_FIELDS = [
  ['categories', 'Categories of variables'],
  ['summary', 'Summary of work undertaken'],
  ['date', 'Date of submitting documentation'],
  ['name', 'Name of person responsible for cleaning/derivation'],
  ['sourceFiles', 'Source data file(s)'],
  ['sourceFilesDate', 'Date source file(s) created'],
  ['sourceVars', 'Names of source variables'],
  ['syntaxProvided', 'Syntax provided'],
  ['syntaxLocation', 'Location of syntax file'],
  ['syntaxDate', 'Date syntax file created'],
  ['syntaxFormat', 'Format of syntax'],
  ['outputDataProvided', 'Output data file provided'],
  ['outputDate', 'Date output file created'],
  ['outputLocation', 'Location of output file'],
  ['outputFormat', 'Format of output file'],
  ['docProvided', 'Documentation provided'],
  ['papers', 'List any papers using these variables'],
  ['outputVars', 'Output variables'],
];

function buildTopsheetTable(topsheet) {
  const { Table, TableRow, TableCell, Paragraph, TextRun, WidthType, VerticalAlign } = docx;
  const labelWidth = 3200, valueWidth = 6000;
  const rows = TOPSHEET_FIELDS.map(([key, label]) => {
    const rawValue = topsheet[key] || '';
    // Multi-line fields (source vars, output vars) — one paragraph per line
    const lines = rawValue.split('\n').filter(l => l.trim());
    const valueParagraphs = lines.length
      ? lines.map(line => new Paragraph({ children: [new TextRun({ text: line })] }))
      : [new Paragraph({ children: [] })];
    return new TableRow({
      children: [
        new TableCell({
          width: { size: labelWidth, type: WidthType.DXA },
          verticalAlign: VerticalAlign.TOP,
          children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })],
        }),
        new TableCell({
          width: { size: valueWidth, type: WidthType.DXA },
          verticalAlign: VerticalAlign.TOP,
          children: valueParagraphs,
        }),
      ],
    });
  });
  return new Table({
    width: { size: labelWidth + valueWidth, type: WidthType.DXA },
    columnWidths: [labelWidth, valueWidth],
    rows,
  });
}

function buildTitleLines() {
  const { Paragraph, TextRun, UnderlineType, AlignmentType } = docx;
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'CLEANED/DERIVED VARIABLE METADATA TOP SHEET', bold: true, underline: { type: UnderlineType.SINGLE } })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'For Submission to the NSHD Scientific Support Team', bold: true, underline: { type: UnderlineType.SINGLE } })],
    }),
  ];
}

function runsFromInline(inlineRuns) {
  const { TextRun } = docx;
  if (!inlineRuns || !inlineRuns.length) return [new TextRun({ text: '' })];
  return inlineRuns.map(r => new TextRun({
    text: r.text || '',
    bold: !!r.bold,
    italics: !!r.italic,
    underline: r.underline ? {} : undefined,
  }));
}

function blockToDocxElements(block, listIdCounter) {
  const { Paragraph, TextRun, HeadingLevel, UnderlineType, Table, TableRow, TableCell,
          WidthType, ImageRun, VerticalAlign } = docx;

  switch (block.type) {
    case 'section':
      return [new Paragraph({ text: block.title || '', heading: HeadingLevel.HEADING_1 })];

    case 'subheading': {
      const text = block.text || '';
      if (block.style === 'heading2') {
        return [new Paragraph({ text, heading: HeadingLevel.HEADING_2 })];
      }
      if (block.style === 'bold_underline') {
        return [new Paragraph({ children: [new TextRun({ text, bold: true, underline: { type: UnderlineType.SINGLE } })] })];
      }
      if (block.style === 'underline') {
        return [new Paragraph({ children: [new TextRun({ text, underline: { type: UnderlineType.SINGLE } })] })];
      }
      // bold only
      return [new Paragraph({ children: [new TextRun({ text, bold: true })] })];
    }

    case 'paragraph':
      return [new Paragraph({ children: runsFromInline(block.runs) })];

    case 'bulleted_list':
      return (block.items || []).filter(t => t.trim()).map(text =>
        new Paragraph({ text, bullet: { level: 0 } })
      );

    case 'numbered_list': {
      const items = (block.items || []).filter(t => t.trim());
      // Genuine Word numbering (via `numbering:` reference), never a bare
      // bullet-with-numbers-typed-as-text — this is what lets a real
      // multi-item list render as numbers 1, 2, 3 rather than being
      // misread as a single mistaken numbered heading the way a lone
      // "1." would be.
      return items.map(text =>
        new Paragraph({ text, numbering: { reference: 'doc-numbered-list', level: 0 } })
      );
    }

    case 'table': {
      const rows = block.rows || [[]];
      const nCols = Math.max(1, ...rows.map(r => r.length));
      const colWidth = Math.floor(9026 / nCols);
      return [new Table({
        width: { size: 9026, type: WidthType.DXA },
        columnWidths: Array(nCols).fill(colWidth),
        rows: rows.map((row, ri) => new TableRow({
          children: Array.from({ length: nCols }, (_, ci) => new TableCell({
            width: { size: colWidth, type: WidthType.DXA },
            verticalAlign: VerticalAlign.TOP,
            children: [new Paragraph({
              children: [new TextRun({ text: row[ci] || '', bold: ri === 0 })],
            })],
          })),
        })),
      })];
    }

    case 'image': {
      if (!block.imageBytes) return [];
      const els = [new Paragraph({
        children: [new ImageRun({
          data: block.imageBytes,
          transformation: { width: block.width || 400, height: block.height || 300 },
          type: block.imageType || 'png',
        })],
      })];
      if (block.caption) {
        els.push(new Paragraph({ children: [new TextRun({ text: block.caption, italics: true })] }));
      }
      return els;
    }

    default:
      return [];
  }
}

async function generateDocx(topsheet, blocks) {
  const { Document, Packer, Paragraph, LevelFormat, AlignmentType } = docx;

  const body = [
    ...buildTitleLines(),
    new Paragraph({ children: [] }), // spacer before table
    buildTopsheetTable(topsheet),
    new Paragraph({ children: [] }), // spacer after table
  ];

  blocks.forEach(block => {
    body.push(...blockToDocxElements(block));
    body.push(new Paragraph({ children: [] })); // blank line after every block
  });

  const doc = new Document({
    styles: {
      paragraphStyles: [{
        // Heading 2 stays a genuine Word "Heading 2" style reference
        // (so build_docs.py's style-name check still recognises it
        // correctly) — this only customises how that style itself
        // renders, matching the bold+underlined look of the other
        // three subheading options for visual consistency.
        id: 'Heading2',
        name: 'Heading 2',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { bold: true, underline: {}, size: 26 },
        paragraph: { spacing: { before: 240, after: 120 } },
      }],
    },
    numbering: {
      config: [{
        reference: 'doc-numbered-list',
        levels: [{
          level: 0,
          format: LevelFormat.DECIMAL,
          text: '%1.',
          alignment: AlignmentType.START,
        }],
      }],
    },
    sections: [{ properties: {}, children: body }],
  });

  return await Packer.toBlob(doc);
}

if (typeof module !== 'undefined') {
  module.exports = { generateDocx, TOPSHEET_FIELDS };
}
