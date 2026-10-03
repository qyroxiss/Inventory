// Small building blocks of the "Ledger" look (docs/design/AUTH-SCREENS.md). Colours come from
// the theme file; change them there, not here.

import { cn } from '@qi/ui/cn';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, Ref } from 'react';

/** Serif heading with an italic ending: <Heading lead="Company & Year" tail="Setup" />. Wording follows MDA. */
export const Heading = ({
  lead,
  tail,
  as: Tag = 'h2',
  className,
}: {
  lead: string;
  tail: string;
  as?: 'h1' | 'h2';
  className?: string;
}) => (
  <Tag className={cn('m-0 font-serif font-normal leading-none', className)}>
    {lead} <span className="italic">{tail}</span>
  </Tag>
);

/** A labelled text field drawn as a single underline, with MDA's error under it. */
export function UnderlineField({
  id,
  label,
  error,
  trailing,
  inputRef,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  error?: string;
  trailing?: ReactNode;
  inputRef?: Ref<HTMLInputElement>;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="ledger-label">
        {label}
      </label>
      <div
        className={cn(
          'flex items-center border-b-[1.5px]',
          error ? 'border-destructive' : 'border-input',
        )}
      >
        <input
          id={id}
          ref={inputRef}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          className="h-[46px] min-w-0 flex-1 rounded-none border-0 bg-transparent px-0.5 text-lg text-foreground outline-none focus-visible:outline-none"
          {...input}
        />
        {trailing}
      </div>
      {error && (
        <span id={`${id}-err`} className="text-[13px] text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

/** The green main action, label on the left and an arrow on the right. */
export const PrimaryButton = ({ children, className, ...rest }: ButtonProps) => (
  <button
    className={cn(
      'flex h-14 cursor-pointer items-center justify-between bg-primary px-[22px] text-base font-semibold text-primary-foreground disabled:cursor-wait disabled:opacity-70',
      className,
    )}
    {...rest}
  >
    <span>{children}</span>
    <span aria-hidden="true" className="text-xl">
      →
    </span>
  </button>
);

/** Solid ink button ("New Company") and outlined button ("Manage Years", "Cancel"). */
export const InkButton = ({ className, ...rest }: ButtonProps) => (
  <button
    className={cn(
      'flex h-12 cursor-pointer items-center gap-2.5 bg-secondary px-5 text-[15px] font-semibold text-secondary-foreground',
      className,
    )}
    {...rest}
  />
);

export const OutlineButton = ({ className, ...rest }: ButtonProps) => (
  <button
    className={cn(
      'flex h-12 cursor-pointer items-center gap-2.5 border-[1.5px] border-foreground bg-card px-5 text-[15px] font-semibold text-foreground',
      className,
    )}
    {...rest}
  />
);
