// Saving a bill as a PDF, Excel or Word file: MDA's Export / Print choices (2026-11-11). Loaded
// only when someone exports, so the libraries don't slow the app down. All three are built from
// the same sheet contents as the printout (print.tsx `sheetModel`).
//   - PDF: a picture of the printed sheet, on the chosen paper; longer bills run onto more pages.
//   - Excel (.xlsx) and Word (.doc): the same bill as editable tables.

import type { PaperSize } from 'exceljs';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { PAGE_MARGIN_MM, preferences } from '../../prefs.ts';
import { DECLARATION, Sheet, pxSize, sheetFit, type SheetModel } from './print.tsx';

/** "Purchase Invoice PB-0001" → a safe file name. */
const fileName = (m: SheetModel, ext: string) =>
  `${m.title} ${m.docNo}`.replace(/[\\/:*?"<>|]+/g, '-').trim() + `.${ext}`;

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ── PDF ─────────────────────────────────────────────────────────────────────────

export async function savePdf(m: SheetModel) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf'),
  ]);
  // Draw the sheet off screen at the paper's shape, then photograph it.
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-20000px;top:0;background:#fff;';
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<Sheet m={m} {...pxSize()} />));
    await document.fonts?.ready;
    const canvas = await html2canvas(host.firstElementChild as HTMLElement, {
      scale: 2,
      backgroundColor: '#ffffff',
      // The app's screen zoom (--ui-scale) throws off text measuring; its private copy of the
      // page is drawn at full size instead.
      onclone: (doc) => {
        doc.documentElement.style.setProperty('zoom', '1', 'important');
      },
    });
    const f = sheetFit();
    const [pw, ph] = f.paper;
    const [cw, ch] = f.content;
    const pdf = new jsPDF({
      unit: 'mm',
      format: [pw, ph],
      orientation: preferences().paperOrientation,
    });
    // The picture is cw mm wide; slice it into page-high pieces when it's longer than a page.
    const pxPerMm = canvas.width / cw;
    const pagePx = Math.floor(ch * pxPerMm);
    for (let y = 0, page = 0; y < canvas.height; y += pagePx, page++) {
      const h = Math.min(pagePx, canvas.height - y);
      if (h < 4) break;
      const part = document.createElement('canvas');
      part.width = canvas.width;
      part.height = h;
      part.getContext('2d')!.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
      if (page > 0) pdf.addPage([pw, ph], preferences().paperOrientation);
      pdf.addImage(
        part.toDataURL('image/jpeg', 0.95),
        'JPEG',
        PAGE_MARGIN_MM,
        PAGE_MARGIN_MM,
        cw,
        h / pxPerMm,
      );
    }
    download(pdf.output('blob'), fileName(m, 'pdf'));
  } finally {
    root.unmount();
    host.remove();
  }
}

// ── Excel ───────────────────────────────────────────────────────────────────────

export async function saveExcel(m: SheetModel) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(m.title.slice(0, 31), {
    pageSetup: {
      // Excel's paper numbers: A4 9, A5 11, Letter 1, Legal 5.
      paperSize: ({ A4: 9, A5: 11, Letter: 1, Legal: 5 } as const)[
        preferences().paperSize
      ] as unknown as PaperSize,
      orientation: preferences().paperOrientation,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });
  // Sl · Description · HSN · Quantity · Rate (Incl.) · Rate · per · [Disc. %] · Amount
  const heads = [
    'Sl No.',
    'Description of Goods',
    'HSN/SAC',
    'Quantity',
    'Rate (Incl. of Tax)',
    'Rate',
    'per',
    ...(m.hasDisc ? ['Disc. %'] : []),
    'Amount',
  ];
  const n = heads.length;
  ws.columns = heads.map((h, i) => ({
    width: i === 0 ? 7 : i === 1 ? 38 : h === 'per' ? 7 : 14,
  }));
  const thin = { style: 'thin' as const };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const font = { name: 'Arial', size: 9 };
  const bold = { ...font, bold: true };
  const add = (
    cells: (string | number)[],
    opts: { bold?: boolean; border?: boolean; right?: number[] } = {},
  ) => {
    const r = ws.addRow(cells);
    r.eachCell({ includeEmpty: true }, (c, col) => {
      if (col > n) return;
      c.font = opts.bold ? bold : font;
      c.alignment = {
        vertical: 'top',
        wrapText: true,
        horizontal: opts.right?.includes(col) ? 'right' : 'left',
      };
      if (opts.border) c.border = box;
    });
    return r;
  };
  const merged = (text: string, opts: { bold?: boolean; size?: number; center?: boolean } = {}) => {
    const r = ws.addRow([text]);
    ws.mergeCells(r.number, 1, r.number, n);
    const c = r.getCell(1);
    c.font = { ...font, bold: !!opts.bold, size: opts.size ?? 9 };
    c.alignment = { horizontal: opts.center ? 'center' : 'left', wrapText: true };
    return r;
  };
  const block = (b: SheetModel['seller']) => {
    if (b.caption) merged(b.caption);
    merged(b.name, { bold: true });
    b.lines.forEach((l) => merged(l));
    b.info.forEach(([k, v]) => merged(`${k} : ${v}`));
  };

  merged(m.title, { bold: true, size: 12, center: true });
  if (m.original) merged('(ORIGINAL FOR RECIPIENT)', { center: true });
  ws.addRow([]);
  block(m.seller);
  ws.addRow([]);
  block(m.buyer);
  ws.addRow([]);
  m.boxes.flat().forEach(([k, v]) => k && merged(`${k} : ${v}`));
  if (m.delivery.length) merged(`Terms of Delivery : ${m.delivery.join(', ')}`);
  ws.addRow([]);

  const nums = Array.from({ length: n - 3 }, (_, i) => i + 4);
  add(heads, { bold: true, border: true });
  for (const l of m.items) {
    add(
      [
        l.no,
        [l.name, ...l.desc].join('\n'),
        l.hsn,
        l.qty,
        l.rateIncl,
        l.rate,
        l.per,
        ...(m.hasDisc ? [l.disc] : []),
        l.amount,
      ],
      { border: true, right: nums.filter((x) => x !== 7) },
    );
  }
  for (const s of m.side) {
    const cells: (string | number)[] = Array(n).fill('');
    cells[1] = s.label;
    cells[5] = s.rate ? `${s.rate} %` : '';
    cells[n - 1] = s.amount;
    add(cells, { border: true, right: [2, 6, n] });
  }
  const total: (string | number)[] = Array(n).fill('');
  total[1] = 'Total';
  total[3] = m.totalQty;
  total[n - 1] = `₹ ${m.net}`;
  add(total, { bold: true, border: true, right: [2, 4, n] });
  ws.addRow([]);
  merged('Amount Chargeable (in words)');
  merged(m.words, { bold: true });
  ws.addRow([]);

  // HSN/SAC summary
  const hsnHeads = m.inter
    ? ['HSN/SAC', 'Taxable Value', 'IGST Rate', 'IGST Amount', 'Total Tax Amount']
    : [
        'HSN/SAC',
        'Taxable Value',
        'CGST Rate',
        'CGST Amount',
        'SGST/UTGST Rate',
        'SGST/UTGST Amount',
        'Total Tax Amount',
      ];
  const hsnRight = hsnHeads.map((_, i) => i + 1).filter((i) => i > 1);
  add(hsnHeads, { bold: true, border: true });
  for (const r of m.hsn)
    add(
      m.inter
        ? [r.code, r.taxable, r.rate, r.igst, r.tax]
        : [r.code, r.taxable, r.rate, r.cgst, r.rate, r.sgst, r.tax],
      {
        border: true,
        right: hsnRight,
      },
    );
  const t = m.hsnTotal;
  add(
    m.inter
      ? ['Total', t.taxable, '', t.igst, t.tax]
      : ['Total', t.taxable, '', t.cgst, '', t.sgst, t.tax],
    {
      bold: true,
      border: true,
      right: hsnRight,
    },
  );
  ws.addRow([]);
  merged(`Tax Amount (in words) : ${m.taxWords}`);
  if (m.remarks) merged(`Remarks: ${m.remarks}`);
  if (m.pan) merged(`Company's PAN : ${m.pan}`);
  if (m.bank.length) {
    merged("Company's Bank Details");
    m.bank.forEach(([k, v]) => merged(`${k} : ${v}`));
  }
  ws.addRow([]);
  merged('Declaration', { bold: true });
  merged(DECLARATION);
  ws.addRow([]);
  merged(`for ${m.compName}`, { bold: true });
  merged('Authorised Signatory');
  merged('This is a Computer Generated Invoice', { center: true });

  const buf = await wb.xlsx.writeBuffer();
  download(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    fileName(m, 'xlsx'),
  );
}

// ── Word ────────────────────────────────────────────────────────────────────────

const esc = (s: string | number) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A Word document (HTML tables, which Word opens as a normal document) on the chosen paper. */
export function saveWord(m: SheetModel) {
  const [pw, ph] = sheetFit().paper;
  const td = (x: string | number, style = '') => `<td style="${style}">${x}</td>`;
  const R = 'text-align:right;';
  const B = 'font-weight:bold;';
  const block = (b: SheetModel['seller']) =>
    [
      b.caption && `<div style="font-size:8pt">${esc(b.caption)}</div>`,
      `<div style="${B}">${esc(b.name)}</div>`,
      ...b.lines.map((l) => `<div>${esc(l)}</div>`),
      ...b.info.map(([k, v]) => `<div>${esc(k)} : ${esc(v)}</div>`),
    ]
      .filter(Boolean)
      .join('');
  const heads = [
    'Sl No.',
    'Description of Goods',
    'HSN/SAC',
    'Quantity',
    'Rate (Incl. of Tax)',
    'Rate',
    'per',
    ...(m.hasDisc ? ['Disc. %'] : []),
    'Amount',
  ];
  const n = heads.length;
  const items = m.items
    .map(
      (l) =>
        `<tr>${td(l.no)}${td(
          `<b>${esc(l.name)}</b>${l.desc.map((d) => `<br><i style="font-size:8pt">${esc(d)}</i>`).join('')}`,
        )}${td(esc(l.hsn))}${td(`<b>${esc(l.qty)}</b>`, R)}${td(esc(l.rateIncl), R)}${td(esc(l.rate), R)}${td(esc(l.per))}${
          m.hasDisc ? td(esc(l.disc), R) : ''
        }${td(`<b>${esc(l.amount)}</b>`, R)}</tr>`,
    )
    .join('');
  const side = m.side
    .map((s) => {
      const cells = Array(n).fill(td(''));
      cells[1] = td(`<b><i>${esc(s.label)}</i></b>`, R);
      cells[5] = td(s.rate ? `<i>${esc(s.rate)} %</i>` : '', R);
      cells[n - 1] = td(`<b>${esc(s.amount)}</b>`, R);
      return `<tr>${cells.join('')}</tr>`;
    })
    .join('');
  const total = Array(n).fill(td(''));
  total[1] = td('Total', R);
  total[3] = td(`<b>${esc(m.totalQty)}</b>`, R);
  total[n - 1] = td(`<b>₹ ${esc(m.net)}</b>`, `${R}white-space:nowrap;`);

  const hsnHeads = m.inter
    ? ['HSN/SAC', 'Taxable Value', 'IGST Rate', 'IGST Amount', 'Total Tax Amount']
    : [
        'HSN/SAC',
        'Taxable Value',
        'CGST Rate',
        'CGST Amount',
        'SGST/ UTGST Rate',
        'SGST/ UTGST Amount',
        'Total Tax Amount',
      ];
  const hsnRows = m.hsn
    .map((r) =>
      (m.inter
        ? [r.code, r.taxable, r.rate, r.igst, r.tax]
        : [r.code, r.taxable, r.rate, r.cgst, r.rate, r.sgst, r.tax]
      )
        .map((x, i) => td(esc(x), i ? R : ''))
        .join(''),
    )
    .map((x) => `<tr>${x}</tr>`)
    .join('');
  const t = m.hsnTotal;
  const hsnTotal = (
    m.inter
      ? ['Total', t.taxable, '', t.igst, t.tax]
      : ['Total', t.taxable, '', t.cgst, '', t.sgst, t.tax]
  )
    .map((x) => td(`<b>${esc(x)}</b>`, R))
    .join('');

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${esc(m.title)} ${esc(m.docNo)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
@page Sheet { size: ${pw}mm ${ph}mm; margin: ${PAGE_MARGIN_MM}mm; }
div.Sheet { page: Sheet; }
body, td { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; }
table { border-collapse: collapse; width: 100%; }
td { border: 1px solid #000; padding: 2px 4px; vertical-align: top; }
thead td { font-weight: bold; text-align: center; }
</style></head>
<body><div class="Sheet">
<p style="text-align:center;font-size:11pt;${B}margin:0">${esc(m.title)}</p>
${m.original ? '<p style="text-align:right;font-size:8pt;font-style:italic;margin:0">(ORIGINAL FOR RECIPIENT)</p>' : ''}
<table>
<tr>${td(block(m.seller), 'width:50%')}<td rowspan="2" style="width:50%;padding:0">
<table>${m.boxes
    .map(
      (pair) =>
        `<tr>${pair.map(([k, v]) => td(`<div style="font-size:8pt">${esc(k)}</div><b>${esc(v)}</b>`, 'width:50%')).join('')}</tr>`,
    )
    .join('')}
<tr><td colspan="2"><div style="font-size:8pt">Terms of Delivery</div>${m.delivery.map((d) => `<div>${esc(d)}</div>`).join('')}</td></tr></table>
</td></tr>
<tr>${td(block(m.buyer))}</tr>
</table>
<table><thead><tr>${heads.map((h) => td(esc(h))).join('')}</tr></thead>
<tbody>${items}${side}<tr>${total.join('')}</tr></tbody></table>
<p style="margin:2px 0 0;font-size:8pt">Amount Chargeable (in words) <span style="float:right"><i>E. &amp; O.E</i></span></p>
<p style="margin:0 0 4px;font-size:10pt;${B}">${esc(m.words)}</p>
<table style="font-size:8pt"><thead><tr>${hsnHeads.map((h) => td(esc(h))).join('')}</tr></thead>
<tbody>${hsnRows}<tr>${hsnTotal}</tr></tbody></table>
<p style="margin:4px 0 0">Tax Amount (in words) : <b>${esc(m.taxWords)}</b></p>
${m.remarks ? `<p style="margin:4px 0 0"><i>Remarks:</i><br>${esc(m.remarks)}</p>` : ''}
${m.pan ? `<p style="margin:4px 0 0">Company's PAN : <b>${esc(m.pan)}</b></p>` : ''}
${m.bank.length ? `<p style="margin:4px 0 0"><i>Company's Bank Details</i><br>${m.bank.map(([k, v]) => `${esc(k)} : <b>${esc(v)}</b>`).join('<br>')}</p>` : ''}
<table style="margin-top:6px"><tr>${td(`<u>Declaration</u><br>${esc(DECLARATION)}`, 'width:50%;border:0')}${td(
    `<b>for ${esc(m.compName)}</b><br><br><br>Authorised Signatory`,
    'width:50%;text-align:right',
  )}</tr></table>
<p style="text-align:center;font-size:8pt">This is a Computer Generated Invoice</p>
</div></body></html>`;
  download(new Blob(['﻿', html], { type: 'application/msword' }), fileName(m, 'doc'));
}
