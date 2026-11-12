// Sales and Purchase Invoice printing. MDA never built it (its Sale Print button only says it
// "arrives with the report module"); added at the user's request (2026-10-25). The flow is the
// Receipt/Payment one: ask for the bill number, refuse a cancelled bill, show the sheet, then
// MDA's "Export / Print" choice (2026-11-11): Printer, PDF, Excel or Word. The sheet follows the
// user's sample bill (2026-11-09) on the paper chosen in Company Settings › Print Layout, scaled
// to fit it (A5 included).

import {
  GST_STATES,
  amountInWords,
  purcTotals,
  saleTotals,
  stateCodeOfName,
  type PurcLine,
} from '@qi/core';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { api, unwrap, type OkBody } from '../../api.ts';
import { Dialog, MessageDialog } from '../../components/Dialog.tsx';
import { faIN, fqIN } from '../../format.ts';
import { PAGE_MARGIN_MM, paperMm } from '../../prefs.ts';
import { dmy } from './shared.tsx';

type SaleInvoice = NonNullable<
  OkBody<Awaited<ReturnType<typeof api.api.sales.print.$get>>>['invoice']
>;
type PurchaseInvoice = NonNullable<
  OkBody<Awaited<ReturnType<typeof api.api.purchases.print.$get>>>['invoice']
>;
type ReturnNote = NonNullable<
  OkBody<Awaited<ReturnType<typeof api.api.returns.print.$get>>>['note']
>;
/** A return prints on the invoice sheet with its own title, boxes and remarks; the company is
 *  the issuer, the party the recipient. */
type NoteParts = { title: string; boxes: [string, string][][]; remarks: string };
type Printed =
  | { kind: 'sale'; inv: SaleInvoice; note?: NoteParts }
  | { kind: 'purchase'; inv: PurchaseInvoice; note?: NoteParts };
/** Sale, Purchase, or a return: PRT prints as a Debit Note, SRT as a Credit Note. */
type Kind = 'sale' | 'purchase' | 'PRT' | 'SRT';

const WORD: Record<Kind, string> = {
  sale: 'Sale',
  purchase: 'Purchase',
  PRT: 'Debit Note',
  SRT: 'Credit Note',
};

/** A return laid onto the sheet: a Purchase Return as a purchase-shaped document, a Sales Return
 *  as a sale-shaped one, its bill discount share carried as an amount. */
function fromReturn(kind: 'PRT' | 'SRT', n: ReturnNote): Printed {
  const d = n.doc;
  const title = WORD[kind];
  const note: NoteParts = {
    title,
    boxes: [
      [
        [`${title} No.`, d.returnNo],
        ['Dated', dmy(d.returnDate)],
      ],
      [
        ['Original Invoice No.', d.againstBillNo],
        ['Dated', d.againstBillDate ? dmy(d.againstBillDate) : ''],
      ],
    ],
    remarks: d.narration,
  };
  const common = {
    billNo: d.returnNo,
    billDate: d.returnDate,
    state: d.state,
    isInterState: d.isInterState,
    status: d.status,
    lines: d.lines,
  };
  if (kind === 'PRT')
    return {
      kind: 'purchase',
      note,
      inv: {
        company: n.company,
        party: n.party,
        bill: {
          ...common,
          suppCode: d.partyCode,
          suppName: d.partyName,
          narration: d.narration,
          freight: 0,
        },
      } as unknown as PurchaseInvoice,
    };
  const cu = n.customer;
  return {
    kind: 'sale',
    note,
    inv: {
      company: n.company,
      party: n.party,
      bill: {
        ...common,
        saleType: '',
        custCode: d.partyCode,
        custName: d.partyName,
        address: cu?.address ?? '',
        area: cu?.area ?? '',
        city: cu?.city ?? '',
        mobile: cu?.mobile ?? '',
        gstNo: cu?.gstNo ?? '',
        billDiscPct: 0,
        billDiscAmt: d.billDisc,
      },
    } as unknown as SaleInvoice,
  };
}

const BTN =
  'flex h-11 cursor-pointer items-center border-[1.5px] border-foreground px-[18px] text-sm font-semibold';
const MAIN =
  'flex h-11 cursor-pointer items-center bg-primary px-[18px] text-sm font-semibold text-primary-foreground';

/** MDA's Export / Print choices (godown_master_page.dart `_ExportDialog`). */
const OUTPUTS = [
  ['printer', 'Printer', 'Send to system printer'],
  ['pdf', 'Export PDF', 'Save as PDF file'],
  ['whatsapp', 'WhatsApp', 'Share via WhatsApp'],
  ['excel', 'Excel', 'Save as Excel file (.xlsx)'],
  ['word', 'Word', 'Save as Word file (.doc)'],
] as const;
type Output = (typeof OUTPUTS)[number][0];

/** Asks for the bill number (filled with the bill on screen, or the one just saved), previews
 *  it, then prints or saves it. */
export function PrintInvoice({
  kind,
  open,
  defaultNo,
  onDone,
}: {
  kind: Kind;
  open: boolean;
  defaultNo: string;
  onDone: () => void;
}) {
  const word = WORD[kind];
  const isNote = kind === 'PRT' || kind === 'SRT';
  const [no, setNo] = useState(defaultNo);
  const [asking, setAsking] = useState(false);
  const [info, setInfo] = useState<{ title: [string, string]; text: string } | null>(null);
  const [preview, setPreview] = useState<Printed | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState<Printed | null>(null);
  // WhatsApp: the PDF waiting for one more tap to share, or saved for attaching by hand.
  const [shareFile, setShareFile] = useState<File | null>(null);
  const [savedForWhatsApp, setSavedForWhatsApp] = useState<File | null>(null);

  useEffect(() => {
    if (open) {
      setNo(defaultNo);
      setAsking(true);
    }
  }, [open, defaultNo]);

  // Print once the sheet is on the page and the preview has closed; then tidy up. While it
  // prints, only the sheet shows (styles.css `printing-sheet`).
  useEffect(() => {
    if (!printing) return;
    document.body.classList.add('printing-sheet');
    const after = () => setPrinting(null);
    window.addEventListener('afterprint', after, { once: true });
    const t = setTimeout(() => window.print(), 50);
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', after);
      document.body.classList.remove('printing-sheet');
    };
  }, [printing]);

  const finish = () => {
    setAsking(false);
    setInfo(null);
    setPreview(null);
    setChoosing(false);
    onDone();
  };

  async function look() {
    const n = no.trim();
    setAsking(false);
    if (!n) return finish();
    const found: Printed | null =
      kind === 'PRT' || kind === 'SRT'
        ? await unwrap(api.api.returns.print.$get({ query: { kind, no: n } })).then((r) =>
            r.note ? fromReturn(kind, r.note) : null,
          )
        : kind === 'sale'
          ? await unwrap(api.api.sales.print.$get({ query: { no: n } })).then((r) =>
              r.invoice ? { kind: 'sale' as const, inv: r.invoice } : null,
            )
          : await unwrap(api.api.purchases.print.$get({ query: { no: n } })).then((r) =>
              r.invoice ? { kind: 'purchase' as const, inv: r.invoice } : null,
            );
    if (!found) {
      setInfo({
        title: ['Not', 'Found'],
        text: `No ${word.toLowerCase()}${isNote ? '' : ' bill'} found with number "${n}".`,
      });
    } else if (found.inv.bill.status === 'Cancelled') {
      setInfo({
        title: ['Cancelled', isNote ? 'Return' : 'Bill'],
        text: `${word}${isNote ? '' : ' bill'} "${n}" has been cancelled and cannot be printed.`,
      });
    } else {
      setPreview(found);
    }
  }

  /** Opens the share sheet with the PDF. Where a browser can't share files, the PDF is saved
   *  and WhatsApp is offered to attach it by hand. */
  async function share(file: File) {
    setShareFile(null);
    if (!canShareFile(file)) {
      (await import('./invoice-export.tsx')).download(file, file.name);
      setChoosing(false);
      setSavedForWhatsApp(file);
      return;
    }
    try {
      await navigator.share({ files: [file], title: file.name });
      finish();
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'AbortError') return finish(); // the share sheet was closed
      // Making the PDF took long enough that the browser wants a fresh tap to share.
      setChoosing(false);
      setShareFile(file);
    }
  }

  async function output(o: Output) {
    const v = preview;
    if (!v) return;
    if (o === 'printer') {
      finish();
      setPrinting(v);
      return;
    }
    // WhatsApp, as sharing a photo: the bill as a PDF goes to the phone's (or computer's)
    // share sheet; pick WhatsApp, then the contact, and send (2026-11-12).
    if (o === 'whatsapp') {
      setBusy(true);
      try {
        const file = await (await import('./invoice-export.tsx')).makePdf(sheetModel(v));
        setBusy(false);
        await share(file);
      } catch (err) {
        setBusy(false);
        setChoosing(false);
        setInfo({
          title: ['Export', 'Failed'],
          text: `The file could not be made: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
      return;
    }
    setBusy(true);
    try {
      const m = sheetModel(v);
      const x = await import('./invoice-export.tsx');
      if (o === 'pdf') await x.savePdf(m);
      else if (o === 'excel') await x.saveExcel(m);
      else x.saveWord(m);
      finish();
    } catch (err) {
      setChoosing(false);
      setInfo({
        title: ['Export', 'Failed'],
        text: `The file could not be made: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    setBusy(false);
  }

  const size = pxSize();
  const fit = sheetFit();
  return (
    <>
      <Dialog open={asking} onClose={finish} title={[word, 'Print']} className="w-[440px]">
        <form
          className="flex flex-col gap-3 px-[26px] pb-[22px] pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            void look();
          }}
        >
          <label htmlFor="invoice-print-no" className="text-sm text-muted-foreground">
            Enter the {word.toLowerCase()}
            {isNote ? '' : ' bill'} number to print.
          </label>
          <input
            id="invoice-print-no"
            autoFocus
            value={no}
            onChange={(e) => setNo(e.target.value.toUpperCase())}
            placeholder={`e.g. ${{ sale: 'SB-0001', purchase: 'PB-0001', PRT: 'PRT-001', SRT: 'SRT-001' }[kind]}`}
            className="h-11 field-box px-3 font-mono text-base outline-none focus-visible:outline-none"
          />
          <div className="flex justify-end gap-2.5 pt-1">
            <button type="button" onClick={finish} className={BTN}>
              Cancel
            </button>
            <button type="submit" className={MAIN}>
              Preview
            </button>
          </div>
        </form>
      </Dialog>

      <MessageDialog
        open={!!info}
        kind="error"
        title={info?.title ?? ['', '']}
        text={info?.text ?? ''}
        onClose={finish}
      />

      <Dialog
        // Stays open under the Export / Print choice: closing it would end the whole flow.
        open={!!preview}
        onClose={finish}
        title={[preview ? titleOf(preview) : '', '']}
        className="w-[960px]"
      >
        <div className="max-h-[70vh] overflow-auto bg-neutral-200 p-4">
          {preview && (
            <div className="mx-auto w-fit bg-white p-[30px] shadow">
              <Sheet m={sheetModel(preview)} {...size} />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2.5 border-t border-border px-[26px] py-3">
          <button type="button" onClick={finish} className={BTN}>
            Close
          </button>
          <button type="button" className={MAIN} onClick={() => setChoosing(true)}>
            Print
          </button>
        </div>
      </Dialog>

      <Dialog
        open={!!preview && choosing}
        onClose={() => setChoosing(false)}
        title={['Export /', 'Print']}
        className="w-[440px]"
      >
        <div className="flex flex-col gap-2 px-[26px] pb-[22px] pt-3">
          {OUTPUTS.map(([key, name, hint]) => (
            <button
              key={key}
              type="button"
              disabled={busy}
              onClick={() => void output(key)}
              className="flex cursor-pointer flex-col items-start border-[1.5px] border-border px-4 py-2.5 text-left hover:border-foreground hover:bg-accent disabled:cursor-wait disabled:opacity-60"
            >
              <span className="text-[15px] font-semibold">{name}</span>
              <span className="text-xs text-muted-foreground">{hint}</span>
            </button>
          ))}
          <div className="flex items-center justify-end gap-2.5 pt-1">
            {busy && <span className="flex-1 text-sm text-muted-foreground">Making the file…</span>}
            <button type="button" onClick={() => setChoosing(false)} className={BTN}>
              Back
            </button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={!!shareFile}
        onClose={() => {
          setShareFile(null);
          finish();
        }}
        title={['Share', 'Bill']}
        className="w-[440px]"
      >
        <div className="flex flex-col gap-3 px-[26px] pb-[22px] pt-3">
          <p className="m-0 text-sm text-muted-foreground">
            The bill is ready as <b className="text-foreground">{shareFile?.name}</b>. Tap Share,
            then choose WhatsApp and the contact.
          </p>
          <div className="flex justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => {
                setShareFile(null);
                finish();
              }}
              className={BTN}
            >
              Close
            </button>
            <button
              type="button"
              autoFocus
              onClick={() => shareFile && void share(shareFile)}
              className={MAIN}
            >
              Share
            </button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={!!savedForWhatsApp}
        onClose={() => {
          setSavedForWhatsApp(null);
          finish();
        }}
        title={['Share via', 'WhatsApp']}
        className="w-[460px]"
      >
        <div className="flex flex-col gap-3 px-[26px] pb-[22px] pt-3">
          <p className="m-0 text-sm text-muted-foreground">
            This browser can&apos;t send files to other apps, so the bill was saved as{' '}
            <b className="text-foreground">{savedForWhatsApp?.name}</b>. Open WhatsApp, choose the
            contact and attach the PDF (📎).
          </p>
          <div className="flex justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => {
                setSavedForWhatsApp(null);
                finish();
              }}
              className={BTN}
            >
              Close
            </button>
            <button
              type="button"
              autoFocus
              onClick={() => {
                openWhatsApp();
                setSavedForWhatsApp(null);
                finish();
              }}
              className={MAIN}
            >
              Open WhatsApp
            </button>
          </div>
        </div>
      </Dialog>

      {printing &&
        createPortal(
          <div className="print-sheet hidden print:block">
            <div style={{ zoom: fit.zoom }}>
              <Sheet
                m={sheetModel(printing)}
                width={`${fit.widthMm}mm`}
                minHeight={`${fit.minHeightMm}mm`}
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/** Can this browser hand files to other apps (the share sheet)? Phones can; Chrome and Edge on
 *  Windows and Safari on a Mac can too. */
const canShareFile = (file: File) =>
  typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

/** A phone or tablet (iPads report themselves as a Mac, so they're told apart by touch). */
const onMobile = () =>
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
  (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

/** Opens WhatsApp: the WhatsApp app on a phone or tablet, WhatsApp Web in a new tab on a
 *  computer. Runs straight from the click, since browsers only open apps and tabs from one. */
function openWhatsApp() {
  if (onMobile()) window.location.href = 'whatsapp://';
  else window.open('https://web.whatsapp.com/', '_blank', 'noopener');
}

/** A sale prints under its sale type's name ("Tax Invoice", "Counter Sale"…). */
const titleOf = (p: Printed) =>
  p.note
    ? p.note.title
    : p.kind === 'sale'
      ? p.inv.bill.saleType.trim() || 'Tax Invoice'
      : 'Purchase Invoice';

const clean = (parts: (string | null | undefined)[]) =>
  parts.filter((x) => x && x.trim()).map((x) => x!.trim());

type StateName = { name: string; code: string };

/** A state's name and GST code, from a name and/or a code. */
const stateOf = (name?: string | null, code?: string | null): StateName | null => {
  const c = (code ?? '').trim() || stateCodeOfName(name);
  const n = (name ?? '').trim() || GST_STATES[c] || '';
  return n && n !== 'Not Applicable' ? { name: n, code: c } : null;
};

/** "INR Two Thousand Five Hundred Ninety Six Only", as the sample bill words it. */
const inWords = (v: number) => amountInWords(v).replace(/^Rupees /, 'INR ');

/** A percentage without trailing zeros: 9, 2.5, 18. */
const pct = (v: number) => String(Math.round(v * 100) / 100);

const stateText = (s: StateName | null) =>
  s ? `${s.name}${s.code ? `, Code : ${s.code}` : ''}` : '';

// ── The sheet's contents ─────────────────────────────────────────────────────────
// Worked out once, as text, so the printed sheet, the PDF, the Excel and the Word files all
// show the same thing.

type Block = { caption: string; name: string; lines: string[]; info: [string, string][] };
type ItemLine = {
  no: number;
  name: string;
  desc: string[];
  hsn: string;
  qty: string;
  rateIncl: string;
  rate: string;
  per: string;
  disc: string;
  amount: string;
};
type HsnLine = {
  code: string;
  taxable: string;
  rate: string;
  cgst: string;
  sgst: string;
  igst: string;
  tax: string;
};

export type SheetModel = {
  title: string;
  docNo: string;
  original: boolean;
  seller: Block;
  buyer: Block;
  boxes: [string, string][][];
  delivery: string[];
  hasDisc: boolean;
  items: ItemLine[];
  /** Tax, discount, freight and round-off lines under the items. */
  side: { label: string; rate: string; amount: string }[];
  totalQty: string;
  net: string;
  words: string;
  inter: boolean;
  hsn: HsnLine[];
  hsnTotal: Omit<HsnLine, 'code' | 'rate'>;
  taxWords: string;
  remarks: string;
  pan: string;
  bank: [string, string][];
  compName: string;
};

/** The bill as the user's sample lays it out (a "Tax Invoice", 2026-11-09): seller and party,
 *  bill details, the goods with the tax under them, the amount in words, the HSN/SAC tax
 *  summary, PAN and bank. A purchase prints the same way: the supplier on top, the company as
 *  the buyer. */
function sheetModel(p: Printed): SheetModel {
  const { company: c, party, bill } = p.inv;
  const sale = p.kind === 'sale';
  const lines = bill.lines as PurcLine[];
  const inter = bill.isInterState;
  const compName = (c?.compName ?? '').trim() || 'Company';

  // ── Totals, worked out as the bill screens do ──
  const st = sale ? saleTotals(lines, p.inv.bill.billDiscPct, p.inv.bill.billDiscAmt) : null;
  const pt = sale ? null : purcTotals(lines, p.inv.bill.freight);
  const t = (st ?? pt)!;
  const taxTotal = t.cgst + t.sgst + t.igst;

  // ── The company ──
  const compState = stateOf(c?.state, c?.stateCode);
  const company = {
    name: compName,
    lines: clean([c?.add1, c?.add2, clean([c?.city, c?.pinCode]).join(' - ')]),
    info: [
      ['GSTIN/UIN', (c?.gstin ?? '').trim()],
      ['State Name', stateText(compState)],
      ['Contact', clean([c?.phone, c?.mobile]).join(', ')],
      ['E-Mail', (c?.email ?? '').trim()],
    ] as [string, string][],
  };

  // ── The party ──
  const partyState = sale
    ? stateOf(p.inv.bill.state)
    : stateOf(p.inv.bill.state || party?.state, party?.stateCode);
  const other = {
    name: sale ? p.inv.bill.custName : (party?.accName ?? ''),
    lines: sale
      ? clean([p.inv.bill.address, p.inv.bill.area, p.inv.bill.city])
      : clean([party?.add1, party?.add2, clean([party?.city, party?.pinCode]).join(' - ')]),
    info: [
      ['GSTIN/UIN', (sale ? p.inv.bill.gstNo : (party?.gstin ?? '')).trim()],
      ['State Name', stateText(partyState)],
      ['Contact', sale ? p.inv.bill.mobile : clean([party?.mobile, party?.phone]).join(', ')],
    ] as [string, string][],
  };
  // The seller on top, the buyer under it, as on the sample. A return is the company's own
  // document: the company on top, the party it goes to underneath.
  const ours = sale || !!p.note;
  const placeOfSupply = (sale ? partyState : (partyState ?? compState))?.name ?? '';
  const s = ours ? company : other;
  const b = ours ? other : company;
  const seller: Block = {
    caption: ours ? '' : 'Supplier (Bill from)',
    ...s,
    info: s.info.filter(([, v]) => v),
  };
  const buyer: Block = {
    caption: p.note && !sale ? 'Supplier (Bill to)' : 'Buyer (Bill to)',
    ...b,
    info: [...b.info, ['Place of Supply', placeOfSupply] as [string, string]].filter(([, v]) => v),
  };

  // ── Bill detail boxes, right of the addresses: two per row ──
  const boxes: [string, string][][] = p.note
    ? p.note.boxes
    : sale
      ? [
          [
            ['Invoice No.', bill.billNo],
            ['Dated', dmy(bill.billDate)],
          ],
          [
            ['', ''],
            ['Mode/Terms of Payment', p.inv.bill.payMode === 'Credit' ? 'Credit' : 'Cash'],
          ],
          [
            ["Buyer's Order No.", ''],
            ['Dated', ''],
          ],
        ]
      : [
          [
            ['Purchase No.', bill.billNo],
            ['Dated', dmy(bill.billDate)],
          ],
          [
            ["Supplier's Invoice No.", p.inv.bill.suppInvNo],
            ['Dated', p.inv.bill.suppInvDate ? dmy(p.inv.bill.suppInvDate) : ''],
          ],
          [
            ['Order No.', p.inv.bill.orderNo],
            ['Dated', p.inv.bill.orderDate ? dmy(p.inv.bill.orderDate) : ''],
          ],
          [
            ['Goods Rec No.', p.inv.bill.goodsRecNo],
            ['Rec. Date', p.inv.bill.recDate ? dmy(p.inv.bill.recDate) : ''],
          ],
        ];
  const delivery =
    sale || p.note
      ? []
      : clean([
          p.inv.bill.supplyWith && `Supply With : ${p.inv.bill.supplyWith}`,
          p.inv.bill.transporter && `Transporter : ${p.inv.bill.transporter}`,
        ]);

  // ── The goods; Disc. % only when some line has a discount ──
  const hasDisc = lines.some((l) => l.disP > 0 || l.disA > 0);
  const units = new Set(lines.map((l) => (l.unit ?? '').trim()));
  const oneUnit = units.size === 1 ? [...units][0]! : '';
  const items = lines.map((l, i): ItemLine => {
    const gst = l.sgstP + l.cgstP + l.igstP;
    const gross = l.qty * l.rate;
    const disc = l.disP > 0 ? l.disP : l.disA > 0 && gross > 0 ? (l.disA / gross) * 100 : 0;
    return {
      no: i + 1,
      name: l.itemName,
      desc: (l.desc ?? []).filter((d) => d.trim()),
      hsn: l.hsnNo ?? '',
      qty: `${fqIN(l.qty)} ${l.unit ?? ''}`.trim(),
      rateIncl: faIN(l.rate * (1 + gst / 100)),
      rate: faIN(l.rate),
      per: l.unit ?? '',
      disc: disc > 0 ? `${pct(disc)} %` : '',
      amount: faIN(l.amount),
    };
  });

  // Tax lines under the items: the rate shows when every line has the same one.
  const rates = new Set(lines.map((l) => (inter ? l.igstP : l.cgstP)));
  const oneRate = rates.size === 1 ? [...rates][0]! : null;
  const side = (label: string, amount: number, rate: number | null = null) => ({
    label,
    rate: rate !== null ? pct(rate) : '',
    amount: faIN(amount),
  });
  const sideLines = [
    ...(inter
      ? [side('IGST', t.igst, oneRate)]
      : [side('CGST', t.cgst, oneRate), side('SGST', t.sgst, oneRate)]),
    ...(st && st.billDisc > 0 ? [side('Less : Discount', -st.billDisc)] : []),
    ...(pt && pt.freight > 0 ? [side('Freight', pt.freight)] : []),
    ...(t.roundOff !== 0 ? [side('Round Off', t.roundOff)] : []),
  ];

  // ── HSN/SAC summary, by HSN code and rate ──
  type Hsn = {
    code: string;
    taxable: number;
    rate: number;
    cgst: number;
    sgst: number;
    igst: number;
  };
  const hsn = new Map<string, Hsn>();
  for (const l of lines) {
    const rate = inter ? l.igstP : l.cgstP;
    const code = (l.hsnNo ?? '').trim();
    const key = `${code}|${rate}`;
    const r = hsn.get(key) ?? { code, taxable: 0, rate, cgst: 0, sgst: 0, igst: 0 };
    r.taxable += l.amount;
    r.cgst += l.cgstA;
    r.sgst += l.sgstA;
    r.igst += l.igstA;
    hsn.set(key, r);
  }

  return {
    title: titleOf(p),
    docNo: bill.billNo,
    original: sale,
    seller,
    buyer,
    boxes,
    delivery,
    hasDisc,
    items,
    side: sideLines,
    totalQty: `${fqIN(t.qty)} ${oneUnit}`.trim(),
    net: faIN(t.net),
    words: inWords(t.net),
    inter,
    hsn: [...hsn.values()].map((r) => ({
      code: r.code,
      taxable: faIN(r.taxable),
      rate: `${pct(r.rate)}%`,
      cgst: faIN(r.cgst),
      sgst: faIN(r.sgst),
      igst: faIN(r.igst),
      tax: faIN(inter ? r.igst : r.cgst + r.sgst),
    })),
    hsnTotal: {
      taxable: faIN(t.subTotal),
      cgst: faIN(t.cgst),
      sgst: faIN(t.sgst),
      igst: faIN(t.igst),
      tax: faIN(taxTotal),
    },
    taxWords: inWords(taxTotal),
    remarks: p.note ? p.note.remarks.trim() : sale ? '' : p.inv.bill.narration.trim(),
    pan: (c?.pan ?? '').trim(),
    bank: sale
      ? (
          [
            ['Bank Name', (c?.bankName ?? '').trim()],
            ['A/c No.', (c?.bankAcNo ?? '').trim()],
            ['Branch & IFS Code', clean([c?.bankBranch, c?.bankIfsc]).join(' & ')],
          ] as [string, string][]
        ).filter(([, v]) => v)
      : [],
    compName,
  };
}

export const DECLARATION =
  'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.';

// ── Fitting the sheet to the paper ─────────────────────────────────────────────────

/** The sheet is laid out 190 mm wide (an A4 page inside its margins). On smaller paper (A5) it
 *  is scaled down whole, so the columns keep their room instead of crushing the description;
 *  on wider paper it simply widens. Height: it fills one page, and runs on when it's longer. */
export function sheetFit() {
  const [w, h] = paperMm();
  const cw = w - 2 * PAGE_MARGIN_MM;
  const ch = h - 2 * PAGE_MARGIN_MM;
  const zoom = Math.min(1, cw / 190);
  return {
    zoom,
    widthMm: cw / zoom,
    // A little short of the page, so rounding never pushes a blank second page.
    minHeightMm: ch / zoom - 2,
    paper: [w, h] as [number, number],
    content: [cw, ch] as [number, number],
  };
}

const MM = 96 / 25.4;

/** The sheet in px, for the preview and the PDF (the paper's shape at 96 dpi). */
export function pxSize() {
  const f = sheetFit();
  return {
    width: `${Math.round(f.widthMm * MM)}px`,
    minHeight: `${Math.round(f.minHeightMm * MM)}px`,
  };
}

/** A name-and-address block: caption, bold name, address lines, then labelled lines. */
function Party({ b }: { b: Block }) {
  return (
    <div className="px-1 py-0.5">
      {b.caption && <div className="text-[8pt]">{b.caption}</div>}
      <div className="font-bold">{b.name}</div>
      {b.lines.map((x) => (
        <div key={x}>{x}</div>
      ))}
      {b.info.map(([k, v]) => (
        <div key={k} className="flex">
          <span className="w-[92px] flex-none">{k}</span>
          <span className="min-w-0 break-words">: {v}</span>
        </div>
      ))}
    </div>
  );
}

/** The printed bill, [width] wide and at least [minHeight] tall (px on screen, mm on paper). */
export function Sheet({
  m,
  width,
  minHeight,
}: {
  m: SheetModel;
  width: string;
  minHeight: string;
}) {
  const tracks = [
    '28px', // Sl No.
    'minmax(0,1fr)', // Description of Goods
    '62px', // HSN/SAC
    '86px', // Quantity
    '70px', // Rate (Incl. of Tax)
    '66px', // Rate
    '34px', // per
    ...(m.hasDisc ? ['46px'] : []), // Disc. %
    '86px', // Amount
  ].join(' ');
  const cols = m.hasDisc ? 9 : 8;
  const row = (cells: ReactNode[], cls = '', key?: string | number) => (
    <div key={key} className={`grid ${cls}`} style={{ gridTemplateColumns: tracks }}>
      {cells.map((x, i) => (
        <div
          key={i}
          className={`min-w-0 px-1 ${i < cells.length - 1 ? 'border-r border-black' : ''} ${i >= 3 ? 'text-right tabular-nums' : ''}`}
        >
          {x}
        </div>
      ))}
    </div>
  );
  const blanks = (n: number): ReactNode[] => Array.from({ length: n }, () => '');
  const sideRow = (s: SheetModel['side'][number]) =>
    row(
      [
        '',
        <div className="text-right font-bold italic">{s.label}</div>,
        '',
        '',
        '',
        s.rate ? <i>{s.rate}</i> : '',
        s.rate ? <i className="block text-left">%</i> : '',
        ...(m.hasDisc ? [''] : []),
        <b>{s.amount}</b>,
      ],
      '',
      s.label,
    );

  const hsnTracks = m.inter
    ? 'minmax(0,1fr) 92px 52px 92px 96px'
    : 'minmax(0,1fr) 92px 44px 82px 44px 82px 96px';
  const hsnRow = (cells: ReactNode[], cls = '', key?: string) => (
    <div key={key} className={`grid ${cls}`} style={{ gridTemplateColumns: hsnTracks }}>
      {cells.map((x, i) => (
        <div
          key={i}
          className={`min-w-0 px-1 ${i < cells.length - 1 ? 'border-r border-black' : ''} ${i >= 1 ? 'text-right tabular-nums' : ''}`}
        >
          {x}
        </div>
      ))}
    </div>
  );
  const head = (x: ReactNode) => <div className="text-center leading-tight">{x}</div>;
  const label = (k: string, v: ReactNode) => (
    <div key={k} className="flex">
      <span className="w-[130px] flex-none">{k}</span>
      <span>
        : <b>{v}</b>
      </span>
    </div>
  );

  return (
    <div
      className="flex flex-col bg-white text-[9pt] leading-[1.3] text-black"
      // Arial, as the sample bill is printed.
      style={{ width, minHeight, fontFamily: 'Arial, Helvetica, sans-serif' }}
    >
      {/* Title */}
      <div className="relative pb-0.5 text-center">
        <span className="text-[11pt] font-bold">{m.title}</span>
        {m.original && (
          <span className="absolute right-0 top-0.5 text-[8pt] italic">
            (ORIGINAL FOR RECIPIENT)
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col border border-black">
        {/* Seller and buyer | bill detail boxes */}
        <div className="grid grid-cols-2 border-b border-black">
          <div className="min-w-0 border-r border-black">
            <div className="border-b border-black">
              <Party b={m.seller} />
            </div>
            <Party b={m.buyer} />
          </div>
          <div className="flex min-w-0 flex-col">
            {m.boxes.map((pair, i) => (
              <div key={i} className="grid grid-cols-2 border-b border-black">
                {pair.map(([k, v], j) => (
                  <div
                    key={j}
                    className={`min-h-[34px] min-w-0 px-1 py-0.5 ${j === 0 ? 'border-r border-black' : ''}`}
                  >
                    <div className="text-[8pt]">{k}</div>
                    <div className="break-words font-bold">{v}</div>
                  </div>
                ))}
              </div>
            ))}
            <div className="flex-1 px-1 py-0.5">
              <div className="text-[8pt]">Terms of Delivery</div>
              {m.delivery.map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
          </div>
        </div>

        {/* Goods: header, items, tax lines, then the empty columns run down to the total */}
        <div className="flex flex-1 flex-col">
          {row(
            [
              <div className="text-left text-[8pt] leading-tight">
                Sl
                <br />
                No.
              </div>,
              head('Description of Goods'),
              head('HSN/SAC'),
              head('Quantity'),
              head(
                <>
                  Rate
                  <br />
                  <span className="text-[7.5pt]">(Incl. of Tax)</span>
                </>,
              ),
              head('Rate'),
              head('per'),
              ...(m.hasDisc ? [head('Disc. %')] : []),
              head('Amount'),
            ],
            'border-b border-black',
          )}
          {m.items.map((l, i) => {
            const top = i === 0 ? 'pt-1' : '';
            return row(
              [
                <div className={top}>{l.no}</div>,
                <div className={top}>
                  <div className="font-bold">{l.name}</div>
                  {l.desc.map((d, k) => (
                    <div key={k} className="pl-2 text-[8pt] italic">
                      {d}
                    </div>
                  ))}
                </div>,
                <div className={`text-left ${top}`}>{l.hsn}</div>,
                <b className={`block whitespace-nowrap ${top}`}>{l.qty}</b>,
                <div className={top}>{l.rateIncl}</div>,
                <div className={top}>{l.rate}</div>,
                <div className={`text-left ${top}`}>{l.per}</div>,
                ...(m.hasDisc ? [<div className={top}>{l.disc}</div>] : []),
                <b className={`block ${top}`}>{l.amount}</b>,
              ],
              '',
              i,
            );
          })}
          {row(blanks(cols), 'h-3')}
          {m.side.map(sideRow)}
          {row(blanks(cols), 'flex-1')}
          {row(
            [
              '',
              <div className="text-right">Total</div>,
              '',
              <b className="whitespace-nowrap">{m.totalQty}</b>,
              '',
              '',
              '',
              ...(m.hasDisc ? [''] : []),
              <b className="whitespace-nowrap text-[10.5pt]">₹ {m.net}</b>,
            ],
            'border-y border-black',
          )}
        </div>

        {/* Amount in words */}
        <div className="flex justify-between px-1 pt-0.5 text-[8pt]">
          <span>Amount Chargeable (in words)</span>
          <i>E. &amp; O.E</i>
        </div>
        <div className="border-b border-black px-1 pb-1 text-[10pt] font-bold">{m.words}</div>

        {/* HSN/SAC summary */}
        <div className="border-b border-black text-[8pt]">
          {hsnRow(
            m.inter
              ? [
                  head('HSN/SAC'),
                  head('Taxable Value'),
                  head('IGST Rate'),
                  head('IGST Amount'),
                  head('Total Tax Amount'),
                ]
              : [
                  head('HSN/SAC'),
                  head('Taxable Value'),
                  head('CGST Rate'),
                  head('CGST Amount'),
                  head('SGST/ UTGST Rate'),
                  head('SGST/ UTGST Amount'),
                  head('Total Tax Amount'),
                ],
            'border-b border-black',
          )}
          {m.hsn.map((r) =>
            hsnRow(
              m.inter
                ? [r.code, r.taxable, r.rate, r.igst, r.tax]
                : [r.code, r.taxable, r.rate, r.cgst, r.rate, r.sgst, r.tax],
              '',
              `${r.code}|${r.rate}`,
            ),
          )}
          {hsnRow(
            m.inter
              ? [
                  <b className="block text-right">Total</b>,
                  <b>{m.hsnTotal.taxable}</b>,
                  '',
                  <b>{m.hsnTotal.igst}</b>,
                  <b>{m.hsnTotal.tax}</b>,
                ]
              : [
                  <b className="block text-right">Total</b>,
                  <b>{m.hsnTotal.taxable}</b>,
                  '',
                  <b>{m.hsnTotal.cgst}</b>,
                  '',
                  <b>{m.hsnTotal.sgst}</b>,
                  <b>{m.hsnTotal.tax}</b>,
                ],
            'border-t border-black',
          )}
        </div>

        {/* Tax in words, remarks, PAN, bank */}
        <div className="px-1 py-1">
          <div>
            Tax Amount (in words) : <b className="text-[10pt]">{m.taxWords}</b>
          </div>
          {m.remarks && (
            <div className="pt-1">
              <div className="italic">Remarks:</div>
              <div>{m.remarks}</div>
            </div>
          )}
          {m.pan && <div className="pt-1">{label("Company's PAN", m.pan)}</div>}
          {m.bank.length > 0 && (
            <div className="pt-1">
              <div className="italic">Company&apos;s Bank Details</div>
              {m.bank.map(([k, v]) => label(k, v))}
            </div>
          )}
        </div>

        {/* Declaration | signature */}
        <div className="grid grid-cols-2">
          <div className="px-1 pb-1">
            <div className="underline">Declaration</div>
            <div>{DECLARATION}</div>
          </div>
          <div className="flex min-h-[58px] flex-col justify-between border-l border-t border-black px-1 py-0.5 text-right">
            <b>for {m.compName}</b>
            <span>Authorised Signatory</span>
          </div>
        </div>
      </div>
      <div className="pt-1 text-center text-[8pt]">This is a Computer Generated Invoice</div>
    </div>
  );
}
