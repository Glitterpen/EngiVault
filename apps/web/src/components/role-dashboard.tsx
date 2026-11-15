import { useId, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

/** The same compact, container-responsive layout in the sidebar and on mobile. */
export function RoleDashboard({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <div className={`@container mx-auto min-w-0 space-y-4 ${wide ? "max-w-[1900px]" : "max-w-6xl"}`}>{children}</div>;
}

export function DashboardLead({ children }: { children: ReactNode }) {
  return <div className="grid min-w-0 items-start gap-4 @min-[52rem]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">{children}</div>;
}

export function DashboardPanel({ id, title, children, action }: {
  id?: string; title: string; children: ReactNode; action?: ReactNode;
}) {
  const heading = useId();
  return <section id={id} tabIndex={id ? -1 : undefined} aria-labelledby={heading} className="ev-card min-w-0 scroll-mt-24 space-y-3 px-4 py-4 sm:px-5">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <h2 id={heading} className="min-w-0 break-words font-semibold text-[#14263d]">{title}</h2>
      {action}
    </div>
    {children}
  </section>;
}

export type DashboardTask = {
  href: string;
  title: string;
  description: string;
  icon?: ReactNode;
  badge?: { text: string; attention?: boolean };
};

export function DashboardWorkQueue({ id, title, items }: { id?: string; title: string; items: DashboardTask[] }) {
  const heading = useId();
  if (!items.length) return null;
  return <section id={id} tabIndex={id ? -1 : undefined} aria-labelledby={heading} className="ev-card min-w-0 scroll-mt-24 overflow-hidden">
    <div className="border-b border-[#e7ecef] px-4 py-3 sm:px-5"><h2 id={heading} className="font-semibold text-[#14263d]">{title}</h2></div>
    <ul className="divide-y divide-[#e7ecef]">{items.map(({ href, title, description, icon, badge }, index) => {
      const titleId = `${heading}-${index}`;
      const badgeId = `${titleId}-status`;
      const descriptionId = `${titleId}-description`;
      return <li key={href}>
        <Link href={href} prefetch={false} aria-labelledby={badge ? `${titleId} ${badgeId}` : titleId} aria-describedby={descriptionId}
          className="flex min-h-11 min-w-0 items-center gap-3 px-4 py-4 transition-colors hover:bg-[#f4f7fb] focus-visible:outline-offset-[-3px] sm:px-5">
          {icon ? <span aria-hidden="true" className="shrink-0 text-[#526675]">{icon}</span> : null}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <h3 id={titleId} className="min-w-0 break-words text-sm font-semibold text-[#14263d]">{title}</h3>
              {badge ? <span id={badgeId} className={`min-w-0 break-words rounded-md px-2 py-1 text-xs font-medium tabular-nums ${badge.attention ? "bg-[#fff0e8] text-[#993d21]" : "bg-[#eef3fa] text-[#526675]"}`}>{badge.text}</span> : null}
            </div>
            <p id={descriptionId} className="mt-1 break-words text-xs leading-5 text-[#526675]">{description}</p>
          </div>
          <ArrowRight size={17} aria-hidden="true" className="shrink-0 text-[#617083]" />
        </Link>
      </li>;
    })}</ul>
  </section>;
}

export function DashboardSummary({ id, title, items, help }: {
  id?: string;
  title: string;
  items: { label: string; value: ReactNode; attention?: boolean; note?: string }[];
  help?: ReactNode;
}) {
  const heading = useId();
  // The component responds to available content width, not the viewport width:
  // it can be used above a grid or in one of its columns without crowding values.
  return <section id={id} tabIndex={id ? -1 : undefined} aria-labelledby={heading} className="ev-card @container/summary min-w-0 scroll-mt-24 px-4 py-3 sm:px-5">
    <div className="flex flex-wrap items-center gap-1"><h2 id={heading} className="text-sm font-semibold text-[#14263d]">{title}</h2>{help}</div>
    <dl className={`mt-2 grid grid-cols-2 gap-x-4 gap-y-3 ${items.length > 4 ? "@min-[24rem]/summary:grid-cols-3 @min-[58rem]/summary:grid-cols-6" : "@min-[28rem]/summary:grid-cols-4"}`}>
      {items.map(({ label, value, attention, note }) => <div key={label} className="flex min-w-0 flex-col gap-1 [overflow-wrap:anywhere]">
        <dt className="order-2 text-xs text-[#526675]">{label}</dt>
        <dd className={`text-2xl font-semibold tabular-nums ${attention ? "text-[#a5452f]" : "text-[#14263d]"}`}>{value}</dd>
        {note ? <dd className="order-3 text-xs leading-5 text-[#526675]">{note}</dd> : null}
      </div>)}
    </dl>
  </section>;
}

const plannedDateFormatter = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

function PlannedDate({ label, value }: { label: string; value: string | null }) {
  const date = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null;
  const valid = date && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  return <div className="min-w-0 [overflow-wrap:anywhere]">
    <dt className="text-xs font-medium text-[#526675]">{label}</dt>
    <dd className="mt-1 text-sm font-semibold tabular-nums text-[#14263d]">
      {valid ? <time dateTime={value ?? undefined}>{plannedDateFormatter.format(date)}</time> : <span className="font-normal text-[#526675]">Not planned</span>}
    </dd>
  </div>;
}

export function DashboardDates({ start, end }: { start: string | null; end: string | null }) {
  return <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 rounded-lg border-l-2 border-l-[#b94d20] bg-[#f4f7fb] px-3 py-3 sm:px-4">
    <PlannedDate label="Planned start" value={start} />
    <PlannedDate label="Planned completion" value={end} />
  </dl>;
}
