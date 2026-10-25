// Sales and Purchase Invoice printing. MDA never built it (its Sale Print button only says it
// "arrives with the report module"); added at the user's request (2026-10-25). The flow is the
// Receipt/Payment one: ask for the bill number, refuse a cancelled bill, show the A4 sheet with a
// Print button. The sheet is a GST invoice: company, party, the items with their tax, the totals.

import {
  GST_STATES,
  amountInWords,
  brand,
  purcTotals,
  saleTotals,
  stateCodeOfName,
  type PurcLine,
} from '@qi/core';
import { useEffect, useState } from 'react';
import { api, unwrap, type OkBody } from '../../api.ts';
import { Dialog, MessageDialog } from '../../components/Dialog.tsx';
import { faIN, fqIN } from '../../format.ts';
import { dmy } from './shared.tsx';

type SaleInvoice = NonNullable<
  OkBody<Awaited<ReturnType<typeof api.api.sales.print.$get>>>['invoice']
>;
type PurchaseInvoice = NonNullable<
  OkBody<Awaited<ReturnType<typeof api.api.purchases.print.$get>>>['invoice']
>;
type Printed = { kind: 'sale'; inv: SaleInvoice } | { kind: 'purchase'; inv: PurchaseInvoice };
type Kind = Printed['kind'];

const BTN =
  'flex h-11 cursor-pointer items-center border-[1.5px] border-foreground px-[18px] text-sm font-semibold';
const MAIN =
  'flex h-11 cursor-pointer items-center bg-primary px-[18px] text-sm font-semibold text-primary-foreground';

/** Asks for the bill number (filled with the bill on screen, or the one just saved), then
 *  previews and prints it. */
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
  const word = kind === 'sale' ? 'Sale' : 'Purchase';
  const [no, setNo] = useState(defaultNo);
  const [asking, setAsking] = useState(false);
  const [info, setInfo] = useState<{ title: [string, string]; text: string } | null>(null);
  const [preview, setPreview] = useState<Printed | null>(null);
  const [printing, setPrinting] = useState<Printed | null>(null);

  useEffect(() => {
    if (open) {
      setNo(defaultNo);
      setAsking(true);
    }
  }, [open, defaultNo]);

  // Print once the sheet is on the page and the preview has closed; then tidy up.
  useEffect(() => {
    if (!printing) return;
    const after = () => setPrinting(null);
    window.addEventListener('afterprint', after, { once: true });
    const t = setTimeout(() => window.print(), 50);
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', after);
    };
  }, [printing]);

  const finish = () => {
    setAsking(false);
    setInfo(null);
    setPreview(null);
    onDone();
  };

  async function look() {
    const n = no.trim();
    setAsking(false);
    if (!n) return finish();
    const found: Printed | null =
      kind === 'sale'
        ? await unwrap(api.api.sales.print.$get({ query: { no: n } })).then((r) =>
            r.invoice ? { kind: 'sale' as const, inv: r.invoice } : null,
          )
        : await unwrap(api.api.purchases.print.$get({ query: { no: n } })).then((r) =>
            r.invoice ? { kind: 'purchase' as const, inv: r.invoice } : null,
          );
    if (!found) {
      setInfo({
        title: ['Not', 'Found'],
        text: `No ${word.toLowerCase()} bill found with number "${n}".`,
      });
    } else if (found.inv.bill.status === 'Cancelled') {
      setInfo({
        title: ['Cancelled', 'Bill'],
        text: `${word} bill "${n}" has been cancelled and cannot be printed.`,
      });
    } else {
      setPreview(found);
    }
  }

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
            Enter the {word.toLowerCase()} bill number to print.
          </label>
          <input
            id="invoice-print-no"
            autoFocus
            value={no}
            onChange={(e) => setNo(e.target.value.toUpperCase())}
            placeholder={kind === 'sale' ? 'e.g. SB-0001' : 'e.g. PB-0001'}
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
        open={!!preview}
        onClose={finish}
        title={[preview ? titleOf(preview) : '', '']}
        className="w-[960px]"
      >
        <div className="max-h-[70vh] overflow-auto bg-neutral-200 p-4">
          {preview && (
            <div className="mx-auto w-[794px] max-w-none bg-white p-[30px] shadow">
              <Sheet p={preview} />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2.5 border-t border-border px-[26px] py-3">
          <button type="button" onClick={finish} className={BTN}>
            Close
          </button>
          <button
            type="button"
            className={MAIN}
            onClick={() => {
              const v = preview;
              finish();
              setPrinting(v);
            }}
          >
            Print
          </button>
        </div>
      </Dialog>

      {printing && (
        <div className="hidden bg-white p-[20pt] text-black print:block">
          <Sheet p={printing} />
        </div>
      )}
    </>
  );
}

/** A sale prints under its sale type's name ("Tax Invoice", "Counter Sale"…). */
const titleOf = (p: Printed) =>
  p.kind === 'sale' ? p.inv.bill.saleType.trim() || 'Tax Invoice' : 'Purchase Invoice';

const join = (parts: (string | null | undefined)[], sep: string) =>
  parts
    .filter((x) => x && x.trim())
    .map((x) => x!.trim())
    .join(sep);

/** "Uttar Pradesh (09)" from a name and/or a code. */
const stateLine = (name?: string | null, code?: string | null) => {
  const c = (code ?? '').trim() || stateCodeOfName(name);
  const n = (name ?? '').trim() || GST_STATES[c] || '';
  if (!n || n === 'Not Applicable') return '';
  return c ? `${n} (${c})` : n;
};

/** A percentage: always two decimals (the company's decimal places are for qty and money). */
const pct = (v: number) => v.toFixed(2);

/** dd-MM-yyyy h:mm am/pm, as the voucher print stamps it. */
function stamp() {
  const n = new Date();
  const p = (v: number) => String(v).padStart(2, '0');
  const h = n.getHours() % 12 || 12;
  return `${p(n.getDate())}-${p(n.getMonth() + 1)}-${n.getFullYear()}  ${h}:${p(n.getMinutes())} ${n.getHours() < 12 ? 'am' : 'pm'}`;
}

function Sheet({ p }: { p: Printed }) {
  const { company: c, party, bill } = p.inv;
  const sale = p.kind === 'sale';
  const lines = bill.lines as PurcLine[];
  const inter = bill.isInterState;
  const compName = (c?.compName ?? '').trim() || 'Company';

  // ── Totals, worked out as the bill screens do ──
  const st = sale ? saleTotals(lines, p.inv.bill.billDiscPct, p.inv.bill.billDiscAmt) : null;
  const pt = sale ? null : purcTotals(lines, p.inv.bill.freight);
  const t = (st ?? pt)!;
  const lineDisc = st ? st.itemDisc : pt!.discount;
  const net = t.net;

  // ── The party block ──
  const partyName = sale ? p.inv.bill.custName : (party?.accName ?? '');
  const partyAddr = sale
    ? join([p.inv.bill.address, p.inv.bill.area, p.inv.bill.city], ', ')
    : join([party?.add1, party?.add2, party?.city, party?.pinCode], ', ');
  const partyState = sale
    ? stateLine(p.inv.bill.state)
    : stateLine(p.inv.bill.state || party?.state, party?.stateCode);
  const partyGstin = sale ? p.inv.bill.gstNo : (party?.gstin ?? '');
  const partyMobile = sale ? p.inv.bill.mobile : join([party?.mobile, party?.phone], ', ');
  const supplyState = sale ? p.inv.bill.state : p.inv.bill.state || party?.state;

  // ── The bill's own details, right of the party ──
  const details: [string, string][] = sale
    ? [
        ['Invoice No.', bill.billNo],
        ['Date', dmy(bill.billDate)],
        ['Payment', p.inv.bill.payMode === 'Credit' ? 'Credit' : 'Cash'],
        ['Place of Supply', stateLine(supplyState)],
      ]
    : [
        ['Purchase No.', bill.billNo],
        ['Date', dmy(bill.billDate)],
        ['Supplier Bill No.', p.inv.bill.suppInvNo],
        ['Supplier Bill Date', p.inv.bill.suppInvDate],
        ['Supply With', p.inv.bill.supplyWith],
        ['Transporter', p.inv.bill.transporter],
        ['Order No.', p.inv.bill.orderNo],
        ['Order Date', p.inv.bill.orderDate ? dmy(p.inv.bill.orderDate) : ''],
        ['Goods Rec No', p.inv.bill.goodsRecNo],
        ['Place of Supply', stateLine(supplyState)],
      ];

  // ── Tax by rate, under the items ──
  const byRate = new Map<number, { taxable: number; cgst: number; sgst: number; igst: number }>();
  for (const l of lines) {
    const rate = Math.round((l.sgstP + l.cgstP + l.igstP) * 100) / 100;
    const r = byRate.get(rate) ?? { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    r.taxable += l.amount;
    r.cgst += l.cgstA;
    r.sgst += l.sgstA;
    r.igst += l.igstA;
    byRate.set(rate, r);
  }

  const th = 'border border-neutral-800 px-1.5 py-1 text-left text-[8.5pt] font-semibold';
  const td = 'border border-neutral-800 px-1.5 py-1 align-top text-[9pt]';
  const num = 'text-right tabular-nums';
  const totalRow = (label: string, value: string, strong = false) => (
    <div
      className={`flex justify-between gap-4 py-[2px] ${strong ? 'text-[11pt] font-bold' : 'text-[9.5pt]'}`}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );

  return (
    <div className="font-sans text-neutral-900">
      <div className="border border-neutral-900">
        {/* Company */}
        <div className="border-b border-neutral-900 px-3 py-2.5 text-center">
          <div className="text-[16pt] font-bold uppercase">{compName}</div>
          {join([c?.add1, c?.add2, c?.city, c?.pinCode], ', ') && (
            <div className="text-[9pt]">{join([c?.add1, c?.add2, c?.city, c?.pinCode], ', ')}</div>
          )}
          {stateLine(c?.state, c?.stateCode) && (
            <div className="text-[9pt]">State: {stateLine(c?.state, c?.stateCode)}</div>
          )}
          {join([c?.phone, c?.mobile, c?.email], '  |  ') && (
            <div className="text-[9pt]">{join([c?.phone, c?.mobile, c?.email], '  |  ')}</div>
          )}
          {join(
            [c?.gstin ? `GSTIN: ${c.gstin}` : null, c?.pan ? `PAN: ${c.pan}` : null],
            '     ',
          ) && (
            <div className="text-[9pt] font-semibold">
              {join(
                [c?.gstin ? `GSTIN: ${c.gstin}` : null, c?.pan ? `PAN: ${c.pan}` : null],
                '     ',
              )}
            </div>
          )}
        </div>
        <div className="border-b border-neutral-900 py-1 text-center text-[12pt] font-bold uppercase tracking-wide">
          {titleOf(p)}
        </div>

        {/* Party | bill details */}
        <div className="grid grid-cols-2 border-b border-neutral-900">
          <div className="border-r border-neutral-900 px-3 py-2 text-[9.5pt]">
            <div className="text-[8.5pt] font-semibold uppercase text-neutral-600">
              {sale ? 'Billed To' : 'Supplier'}
            </div>
            <div className="text-[11pt] font-bold">{partyName}</div>
            {partyAddr && <div>{partyAddr}</div>}
            {partyState && <div>State: {partyState}</div>}
            {partyMobile && <div>Mobile: {partyMobile}</div>}
            {partyGstin && <div className="font-semibold">GSTIN: {partyGstin}</div>}
          </div>
          <div className="px-3 py-2">
            {details
              .filter(([, v]) => v && v.trim())
              .map(([k, v]) => (
                <div key={k} className="flex gap-2 py-[1px] text-[9.5pt]">
                  <span className="w-[120px] flex-none text-neutral-600">{k}</span>
                  <span className="font-semibold">{v}</span>
                </div>
              ))}
          </div>
        </div>

        {/* Items */}
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-neutral-100">
              <th className={th}>S.No</th>
              <th className={th}>Item</th>
              <th className={th}>HSN</th>
              <th className={`${th} ${num}`}>Qty</th>
              <th className={th}>Unit</th>
              <th className={`${th} ${num}`}>Rate</th>
              <th className={`${th} ${num}`}>Disc</th>
              <th className={`${th} ${num}`}>Taxable</th>
              <th className={`${th} ${num}`}>GST %</th>
              {inter ? (
                <th className={`${th} ${num}`}>IGST</th>
              ) : (
                <>
                  <th className={`${th} ${num}`}>CGST</th>
                  <th className={`${th} ${num}`}>SGST</th>
                </>
              )}
              <th className={`${th} ${num}`}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td className={td}>{i + 1}</td>
                <td className={td}>
                  {l.itemName}
                  {(l.desc ?? [])
                    .filter((d) => d.trim())
                    .map((d, k) => (
                      <div key={k} className="text-[8pt] text-neutral-600">
                        {d}
                      </div>
                    ))}
                </td>
                <td className={td}>{l.hsnNo ?? ''}</td>
                <td className={`${td} ${num}`}>{fqIN(l.qty)}</td>
                <td className={td}>{l.unit ?? ''}</td>
                <td className={`${td} ${num}`}>{faIN(l.rate)}</td>
                <td className={`${td} ${num}`}>{l.disA > 0 ? faIN(l.disA) : ''}</td>
                <td className={`${td} ${num}`}>{faIN(l.amount)}</td>
                <td className={`${td} ${num}`}>{pct(l.sgstP + l.cgstP + l.igstP)}</td>
                {inter ? (
                  <td className={`${td} ${num}`}>{faIN(l.igstA)}</td>
                ) : (
                  <>
                    <td className={`${td} ${num}`}>{faIN(l.cgstA)}</td>
                    <td className={`${td} ${num}`}>{faIN(l.sgstA)}</td>
                  </>
                )}
                <td className={`${td} ${num} font-semibold`}>{faIN(l.lineTotal)}</td>
              </tr>
            ))}
            <tr className="bg-neutral-100 font-semibold">
              <td className={td} colSpan={3}>
                Total
              </td>
              <td className={`${td} ${num}`}>{fqIN(t.qty)}</td>
              <td className={td} colSpan={2} />
              <td className={`${td} ${num}`}>{lineDisc > 0 ? faIN(lineDisc) : ''}</td>
              <td className={`${td} ${num}`}>{faIN(t.subTotal)}</td>
              <td className={td} />
              {inter ? (
                <td className={`${td} ${num}`}>{faIN(t.igst)}</td>
              ) : (
                <>
                  <td className={`${td} ${num}`}>{faIN(t.cgst)}</td>
                  <td className={`${td} ${num}`}>{faIN(t.sgst)}</td>
                </>
              )}
              <td className={`${td} ${num}`}>{faIN(lines.reduce((a, l) => a + l.lineTotal, 0))}</td>
            </tr>
          </tbody>
        </table>

        {/* Tax by rate | totals */}
        <div className="grid grid-cols-[1fr_260px] border-t border-neutral-900">
          <div className="border-r border-neutral-900 px-3 py-2">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>GST %</th>
                  <th className={`${th} ${num}`}>Taxable</th>
                  {inter ? (
                    <th className={`${th} ${num}`}>IGST</th>
                  ) : (
                    <>
                      <th className={`${th} ${num}`}>CGST</th>
                      <th className={`${th} ${num}`}>SGST</th>
                    </>
                  )}
                  <th className={`${th} ${num}`}>Total Tax</th>
                </tr>
              </thead>
              <tbody>
                {[...byRate.entries()]
                  .sort((a, b) => a[0] - b[0])
                  .map(([rate, r]) => (
                    <tr key={rate}>
                      <td className={td}>{pct(rate)}</td>
                      <td className={`${td} ${num}`}>{faIN(r.taxable)}</td>
                      {inter ? (
                        <td className={`${td} ${num}`}>{faIN(r.igst)}</td>
                      ) : (
                        <>
                          <td className={`${td} ${num}`}>{faIN(r.cgst)}</td>
                          <td className={`${td} ${num}`}>{faIN(r.sgst)}</td>
                        </>
                      )}
                      <td className={`${td} ${num}`}>{faIN(r.cgst + r.sgst + r.igst)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <div className="pt-2 text-[9pt]">
              <span className="text-neutral-600">Amount in words: </span>
              <span className="font-semibold">{amountInWords(net)}</span>
            </div>
            {!sale && p.inv.bill.narration.trim() && (
              <div className="pt-1 text-[9pt]">
                <span className="text-neutral-600">Narration: </span>
                {p.inv.bill.narration}
              </div>
            )}
          </div>
          <div className="px-3 py-2">
            {totalRow('Taxable Value', faIN(t.subTotal))}
            {inter ? (
              totalRow('IGST', faIN(t.igst))
            ) : (
              <>
                {totalRow('CGST', faIN(t.cgst))}
                {totalRow('SGST', faIN(t.sgst))}
              </>
            )}
            {st && st.billDisc > 0 && totalRow('Discount', `- ${faIN(st.billDisc)}`)}
            {pt && pt.freight > 0 && totalRow('Freight', faIN(pt.freight))}
            {t.roundOff !== 0 && totalRow('Round Off', faIN(t.roundOff))}
            <div className="mt-1 border-t border-neutral-900 pt-1">
              {totalRow(sale ? 'Grand Total' : 'Net Amount', faIN(net), true)}
            </div>
          </div>
        </div>

        {/* Bank | signature */}
        <div className="grid grid-cols-2 border-t border-neutral-900">
          <div className="border-r border-neutral-900 px-3 py-2 text-[9pt]">
            {sale && join([c?.bankName, c?.bankAcNo], '') && (
              <>
                <div className="text-[8.5pt] font-semibold uppercase text-neutral-600">
                  Bank Details
                </div>
                {c?.bankName && <div>Bank: {c.bankName}</div>}
                {c?.bankBranch && <div>Branch: {c.bankBranch}</div>}
                {c?.bankAcNo && <div>A/c No.: {c.bankAcNo}</div>}
                {c?.bankIfsc && <div>IFSC: {c.bankIfsc}</div>}
              </>
            )}
          </div>
          <div className="flex flex-col items-end justify-between gap-8 px-3 py-2">
            <span className="text-[10pt] font-bold">For {compName.toUpperCase()}</span>
            <span className="text-[9pt]">(Authorised Signatory)</span>
          </div>
        </div>
      </div>
      <div className="flex justify-between pt-1.5 text-[8pt] text-neutral-600">
        <span>{stamp()}</span>
        <span>Printed by {brand.appName}</span>
      </div>
    </div>
  );
}
