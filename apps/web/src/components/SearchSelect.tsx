// A type-to-filter dropdown — MDA's `_SearchDD` (ledger_creation_page.dart:1060-1241), used for
// Under Group, State and (with `allowNew`) City. Typed text always resolves to a list entry on
// blur/Enter: an exact (case-insensitive) match wins, or the one substring match if there's
// exactly one, or — only when `allowNew` is set — the typed text itself, stored as a new entry.
// Anything else reverts to whatever was last actually selected, so a filled-looking box never
// hides an unselected field.

import { useEffect, useRef, useState } from 'react';

export type SearchOption = { value: string; label: string };

export function SearchSelect({
  id,
  value,
  options,
  placeholder,
  allowNew,
  freeText,
  error,
  onCommit,
  onNext,
}: {
  id: string;
  /** The resolved value (an option's `value`, or — when `allowNew` — arbitrary stored text). */
  value: string;
  options: SearchOption[];
  placeholder: string;
  /** City only: a name with no match is accepted and treated as a new entry. */
  allowNew?: boolean;
  /** Stock Item's Unit and GST Rate: typed text is kept exactly as typed, like MDA's
   *  DropdownMenu there (stock_item_page.dart:163-165), unless a list entry is picked. */
  freeText?: boolean;
  error?: boolean;
  /** Called with the resolved (value, label), or ('', '') when the field is cleared. */
  onCommit: (value: string, label: string) => void;
  /** Focus-advance after a successful Enter, same as MDA's onSelected chaining. */
  onNext?: () => void;
}) {
  const labelOf = (v: string) =>
    options.find((o) => o.value === v)?.label ?? (allowNew || freeText ? v : '');
  const [text, setText] = useState(labelOf(value));
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const skipNextBlur = useRef(false);

  // A record loaded for edit arrives as a changed `value` prop.
  // Re-run only when the resolved value changes (not when `options` reloads mid-edit).
  useEffect(() => setText(labelOf(value)), [value]);

  const needle = text.trim().toLowerCase();
  const matches = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;

  /** Resolves typed text to a list entry (or discards it); returns whether it committed to something. */
  function resolve(): boolean {
    const typed = text.trim();
    if (!typed) {
      if (value) onCommit('', '');
      return false;
    }
    if (freeText) {
      onCommit(typed, typed);
      setText(typed);
      return true;
    }
    const exact = options.find((o) => o.label.toLowerCase() === typed.toLowerCase());
    if (exact) {
      onCommit(exact.value, exact.label);
      setText(exact.label);
      return true;
    }
    const sub = options.filter((o) => o.label.toLowerCase().includes(typed.toLowerCase()));
    if (sub.length === 1) {
      onCommit(sub[0]!.value, sub[0]!.label);
      setText(sub[0]!.label);
      return true;
    }
    if (allowNew) {
      onCommit(typed, typed);
      setText(typed);
      return true;
    }
    setText(labelOf(value));
    return false;
  }

  const pick = (o: SearchOption) => {
    onCommit(o.value, o.label);
    setText(o.label);
    setOpen(false);
  };

  return (
    <div className="relative">
      <input
        id={id}
        value={text}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setHi(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          if (skipNextBlur.current) {
            skipNextBlur.current = false;
            return;
          }
          resolve();
          setOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setHi((h) => Math.min(h + 1, matches.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHi((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            const chosen = open && matches[hi];
            const did = chosen ? (pick(chosen), true) : resolve();
            setOpen(false);
            if (did) onNext?.();
          } else if (e.key === 'Escape') {
            setText(labelOf(value));
            setOpen(false);
          }
        }}
        className={`h-[42px] w-full field-box px-3 text-base text-foreground outline-none focus-visible:outline-none ${
          error ? 'field-error' : ''
        }`}
      />
      {open && matches.length > 0 && (
        <div
          onMouseDown={() => {
            skipNextBlur.current = true;
          }}
          className="absolute left-0 right-0 top-full z-10 max-h-56 overflow-y-auto border border-border bg-card shadow-lg"
        >
          {matches.map((o, i) => (
            <button
              key={o.value}
              type="button"
              onClick={() => pick(o)}
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-accent ${i === hi ? 'bg-accent' : ''}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
