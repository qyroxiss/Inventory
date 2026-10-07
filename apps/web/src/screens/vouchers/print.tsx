// Receipt / Payment printing (voucher_print.dart): ask for the voucher number, look it up,
// refuse a cancelled one, then show the A4 voucher with a Print button. The sheet follows MDA's
// layout; MDA's "An MDA Softwares" line is left out (unbranded, LOGIC-SPEC §15).

import { amountInWords, brand } from '@qi/core';
import { useEffect, useRef, useState } from 'react';
import { api, unwrap, type OkBody } from '../../api.ts';
import { Dialog, MessageDialog } from '../../components/Dialog.tsx';

type Printed = NonNullable<
  OkBody<Awaited<ReturnType<typeof api.api.vouchers.print.$get>>>['voucher']
>;
type Kind = 'receipt' | 'payment';

const BTN =
  'flex h-11 cursor-pointer items-center border-[1.5px] border-foreground px-[18px] text-sm font-semibold';
const MAIN =
  'flex h-11 cursor-pointer items-center bg-primary px-[18px] text-sm font-semibold text-primary-foreground';

/** Runs MDA's print flow; `open` starts it with the number currently on screen. */
export function PrintVoucher({
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
  const word = kind === 'receipt' ? 'Receipt' : 'Payment';
  const [no, setNo] = useState(defaultNo);
  const [asking, setAsking] = useState(false);
  const [info, setInfo] = useState<{ title: [string, string]; text: string } | null>(null);
  const [preview, setPreview] = useState<Printed | null>(null);
  const [printing, setPrinting] = useState<Printed | null>(null);
  const input = useRef<HTMLInputElement>(null);

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
    const { voucher } = await unwrap(api.api.vouchers.print.$get({ query: { no: n, kind } }));
    if (!voucher) {
      setInfo({
        title: ['Not', 'Found'],
        text: `No ${word.toLowerCase()} found with voucher number "${n}".`,
      });
    } else if (voucher.status === 'Cancelled') {
      setInfo({
        title: ['Cancelled', 'Voucher'],
        text: `${word} "${n}" has been cancelled and cannot be printed.`,
      });
    } else {
      setPreview(voucher);
    }
  }

  return (
    <>
      <Dialog open={asking} onClose={finish} title={['Print', word]} className="w-[440px]">
        <form
          className="flex flex-col gap-3 px-[26px] pb-[22px] pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            void look();
          }}
        >
          <label htmlFor="print-no" className="text-sm text-muted-foreground">
            Enter the {word.toLowerCase()} (voucher) number to print.
          </label>
          <input
            id="print-no"
            ref={input}
            autoFocus
            value={no}
            onChange={(e) => setNo(e.target.value.toUpperCase())}
            placeholder={kind === 'receipt' ? 'e.g. RCP-001' : 'e.g. PAY-001'}
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
        title={[preview ? sheetTitle(preview) : '', '']}
        className="w-[900px]"
      >
        <div className="max-h-[70vh] overflow-auto bg-neutral-200 p-4">
          {preview && (
            <div className="mx-auto w-[794px] max-w-none origin-top bg-white p-[37px] shadow max-md:w-[640px] max-md:p-6">
              <Sheet v={preview} />
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
        <div className="hidden bg-white p-[28pt] text-black print:block">
          <Sheet v={printing} />
        </div>
      )}
    </>
  );
}

const sheetTitle = (v: Printed) =>
  ({ RCP: 'Cash Receipt', BNK: 'Bank Receipt', PAY: 'Cash Payment', BPAY: 'Bank Payment' })[
    v.vchrType
  ] ?? v.vchrType;

const join = (parts: (string | null | undefined)[], sep: string) =>
  parts
    .filter((p) => p && p.trim())
    .map((p) => p!.trim())
    .join(sep);

/** yyyy-MM-dd → dd-MM-yyyy */
const dmy = (iso: string) => iso.split('-').reverse().join('-');

/** dd-MMM-yyyy h:mm am/pm (`_fmtStamp`) */
function stamp() {
  const n = new Date();
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const h = n.getHours() % 12 || 12;
  return `${String(n.getDate()).padStart(2, '0')}-${M[n.getMonth()]}-${n.getFullYear()}  ${h}:${String(n.getMinutes()).padStart(2, '0')} ${n.getHours() < 12 ? 'am' : 'pm'}`;
}

/** The voucher, laid out as MDA's CR.pdf (voucher_print.dart:290-465). */
function Sheet({ v }: { v: Printed }) {
  const c = v.company;
  const p = v.party;
  const receipt = v.vchrType === 'RCP' || v.vchrType === 'BNK';
  const compName = (c?.compName ?? '').trim() || 'Company';
  const compAddr = join([c?.add1, c?.add2, c?.city], ',');
  const compState = join([c?.city, c?.state], ',');
  const compContact = join([c?.phone, c?.mobile, c?.email], ',');
  const compTax = join(
    [c?.gstin ? `GSTIN: ${c.gstin}` : null, c?.pan ? `PAN: ${c.pan}` : null],
    '   ',
  );
  const partyAddr = join([p?.add1, p?.add2], ', ');
  const partyCityState = join([p?.city, p?.state, p?.pinCode], ' ');
  const onAccountOf =
    v.narration.trim() ||
    `Amount ${receipt ? 'received' : 'paid'}${v.refNo.trim() ? ` Ag. ${v.refNo.trim()}` : ''}`;
  // Payments always print "By Cash", bank ones too, as in MDA (Q-47).
  const amountLabel = receipt ? 'By Cash/Bank' : 'By Cash';
  const row = (label: string, value: string, strong = false) => (
    <div className="flex gap-2 py-[5px] text-[10.5pt]">
      <span className="w-[150px] flex-none text-[9.5pt] text-neutral-600">{label}</span>
      <span className={strong ? 'font-bold text-blue-700' : ''}>{value}</span>
    </div>
  );
  return (
    <div className="font-sans text-neutral-900">
      <div className="border border-neutral-900">
        <div className="border-b border-neutral-900 px-3 py-2.5">
          <div className="text-[15pt] font-bold uppercase text-blue-700 underline">{compName}</div>
          {compAddr && <div className="text-[9.5pt]">{compAddr}</div>}
          {compState && <div className="text-[9.5pt] uppercase">{compState}</div>}
          {compContact && <div className="text-[9.5pt]">{compContact}</div>}
          {compTax && <div className="text-[9.5pt]">{compTax}</div>}
        </div>
        <div className="border-b border-neutral-900 py-1.5 text-center text-[12pt] font-bold underline">
          {sheetTitle(v)}
        </div>
        <div className="px-3 py-3">
          <div className="flex flex-wrap items-baseline gap-x-[30px] py-[5px] text-[10.5pt]">
            <span className="flex gap-2">
              <span className="w-[150px] text-[9.5pt] text-neutral-600">Voucher No.</span>
              <span className="font-bold">{v.vchrNo}</span>
            </span>
            <span>Date&nbsp;&nbsp;{dmy(v.vchrDate)}</span>
            {v.vchrType === 'BNK' && v.drName && (
              <span>
                <span className="text-[9.5pt] text-neutral-600">Debited in A/c&nbsp;&nbsp;</span>
                {v.drName.toUpperCase()}
              </span>
            )}
          </div>
          {row(
            receipt ? 'Received On Account Of' : 'Payment Made On Account Of',
            (p?.accName ?? '').toUpperCase(),
            true,
          )}
          {row("Father's Name", '')}
          {partyAddr && row('Address', partyAddr)}
          {partyCityState && row('', `. ${partyCityState}`.toUpperCase())}
          {row('Contact No.', join([p?.mobile, p?.phone], ', '))}
          {row('Email', p?.email ?? '')}
          {row('A Sum Of', amountInWords(v.amount))}
          {row(amountLabel, v.amount.toFixed(2))}
          {row('On Account Of', onAccountOf)}
        </div>
        <div className="flex items-start border-t border-neutral-900 px-3 pb-3 pt-2.5">
          <span className="flex-1 text-[9pt] text-neutral-600">NOTE :</span>
          <div className="flex flex-col items-end gap-8">
            <span className="text-[10pt] font-bold">For&nbsp;&nbsp;{compName.toUpperCase()}</span>
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
