// A section's page (MDA main.dart:1315-1420): the section name, "N entries · M categories",
// and a card per screen — "Open →", or "Not built yet" for MDA's own placeholders.

import { Link, useParams } from '@tanstack/react-router';
import { Icon, NotBuiltTag } from './MainShell.tsx';
import { SECTION_ICONS, findItem, findSection, slug } from './nav.ts';

export function SectionPage() {
  const { section } = useParams({ strict: false }) as { section: string };
  const s = findSection(section);
  if (!s) return <h1 className="m-0 font-serif text-[42px] font-normal">No such section</h1>;

  const count = s.groups.reduce((n, g) => n + g.items.length, 0);
  const grouped = s.groups.some((g) => g.label);
  const subtitle = grouped
    ? `${count} entries  ·  ${s.groups.length} categories`
    : `${count} entries`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 border-b-2 border-foreground pb-4">
        <span className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
          Navigation&nbsp;&nbsp;›&nbsp;&nbsp;{s.label}
        </span>
        <h1 className="m-0 font-serif text-[46px] font-normal leading-none">{s.label}</h1>
        <span className="whitespace-pre font-mono text-xs text-muted-foreground">{subtitle}</span>
      </div>
      {s.groups.map((g) => (
        <section key={g.label || s.label} className="flex flex-col gap-3">
          {g.label && (
            <h2 className="m-0 font-mono text-xs font-medium uppercase tracking-[0.12em] text-primary-text">
              {g.label}
            </h2>
          )}
          <div className="grid grid-cols-4 gap-3.5">
            {g.items.map((label) => {
              const item = findItem(slug(label))!;
              return (
                <Link
                  key={label}
                  to="/app/$screen"
                  params={{ screen: item.slug }}
                  className={`flex min-h-[128px] flex-col justify-between gap-3 border border-border bg-card px-[18px] py-4 hover:border-foreground ${
                    item.built ? '' : 'text-muted-foreground'
                  }`}
                >
                  <span className="grid size-[38px] place-items-center border border-border">
                    <Icon d={SECTION_ICONS[s.index]!} size={19} />
                  </span>
                  <span className="flex flex-col items-start gap-1.5">
                    <span className="text-base font-semibold">{label}</span>
                    {item.built ? (
                      <span className="text-[13px] text-primary-text">Open →</span>
                    ) : (
                      <NotBuiltTag />
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
