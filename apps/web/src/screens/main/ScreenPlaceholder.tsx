// What a menu item opens until its screen is built: the screen's name and its place in MDA's
// menu, on ruled paper. MDA's own placeholders keep MDA's "Not built yet".

import { Link, useParams } from '@tanstack/react-router';
import { NotBuiltTag } from './MainShell.tsx';
import { findItem, slug } from './nav.ts';

export function ScreenPlaceholder() {
  const { screen } = useParams({ strict: false }) as { screen: string };
  const item = findItem(screen);

  return (
    <section className="ledger-paper relative flex min-h-full flex-col gap-5 border border-border pb-10 pl-[76px] pr-12 pt-8">
      <div aria-hidden="true" className="absolute inset-y-0 left-[46px] w-px bg-ledger-margin" />
      <div aria-hidden="true" className="absolute inset-y-0 left-[50px] w-px bg-ledger-margin" />
      {item ? (
        <>
          <span className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
            {item.section}
            {item.group && <>&nbsp;&nbsp;›&nbsp;&nbsp;{item.group}</>}
          </span>
          <h1 className="m-0 border-b-2 border-foreground pb-4 font-serif text-[52px] font-normal leading-none">
            {item.label}
          </h1>
          {item.built ? (
            <p className="m-0 max-w-[560px] text-[15px] leading-[1.6] text-muted-foreground">
              One of MDA's working screens. It is rebuilt here in Phase 5, after MDA's calculations
              are ported.
            </p>
          ) : (
            <div className="flex flex-col items-start gap-3">
              <NotBuiltTag />
              <p className="m-0 max-w-[560px] text-[15px] leading-[1.6] text-muted-foreground">
                MDA lists this screen but has not built it yet. It gets its own specification in a
                later phase.
              </p>
            </div>
          )}
          <Link
            to="/app/section/$section"
            params={{ section: slug(item.section) }}
            className="mt-2 flex min-h-11 items-center self-start text-sm underline underline-offset-4"
          >
            ← {item.section}
          </Link>
        </>
      ) : (
        <>
          <h1 className="m-0 font-serif text-[42px] font-normal leading-none">No such screen</h1>
          <Link
            to="/app"
            className="flex min-h-11 items-center self-start text-sm underline underline-offset-4"
          >
            ← Dashboard
          </Link>
        </>
      )}
    </section>
  );
}
