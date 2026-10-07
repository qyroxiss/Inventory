// A mobile number box with its country code: the code picker on the left, then digits only,
// stopping at the code's length (10 for +91). The value is stored as "+91 9876543210"
// (packages/core/src/contact.ts). Used by Company Creation and Ledger Creation.

import { COUNTRY_CODES, joinPhone, mobileDigits, splitPhone } from '@qi/core';
import { useState, type KeyboardEvent, type Ref } from 'react';

export function PhoneInput({
  id,
  value,
  onChange,
  onEnter,
  error,
  inputRef,
  height = 'h-[42px]',
}: {
  id: string;
  value: string;
  onChange: (stored: string) => void;
  onEnter?: () => void;
  error?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  height?: string;
}) {
  const split = splitPhone(value);
  // The code is kept while the number is empty, so choosing a code before typing sticks.
  const [blankCode, setBlankCode] = useState(split.code);
  const code = split.number ? split.code : blankCode;
  const max = mobileDigits(code);
  const enter = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && onEnter) {
      e.preventDefault();
      onEnter();
    }
  };
  return (
    <div className={`flex w-full field-box ${height} ${error ? 'field-error' : ''}`}>
      {/* The box shows the code alone; the list it opens names each country. */}
      <span className="relative flex w-[74px] flex-none items-center justify-between gap-1 border-r border-border px-2.5 font-mono text-[15px] text-foreground focus-within:bg-accent">
        {code}
        <span aria-hidden="true" className="text-[10px] text-muted-foreground">
          ▼
        </span>
        <select
          aria-label="Country code"
          value={code}
          onChange={(e) => {
            setBlankCode(e.target.value);
            onChange(
              joinPhone(e.target.value, split.number.slice(0, mobileDigits(e.target.value))),
            );
          }}
          onKeyDown={enter}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          {COUNTRY_CODES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} {c.country}
            </option>
          ))}
        </select>
      </span>
      <input
        id={id}
        ref={inputRef}
        value={split.number}
        placeholder={`${max}-digit mobile`}
        inputMode="numeric"
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(joinPhone(code, e.target.value.replace(/\D/g, '').slice(0, max)))}
        onKeyDown={enter}
        className="min-w-0 flex-1 border-0 bg-transparent px-3 text-base text-foreground outline-none focus-visible:outline-none"
      />
    </div>
  );
}
