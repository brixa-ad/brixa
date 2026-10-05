import Link from "next/link";
import { Check, MessageCircle, Phone } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { telHref, viberHref, whatsappHref } from "@/lib/phone";

/** A round button floating on a listing's photo (back, share…). */
export const floatingButton = "grid size-10 place-items-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/65";

/** A section of a listing's page, as the portals draw them: a rounded card with a big title. */
export function Panel({ title, id, children }: { title?: React.ReactNode; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-3xl border border-line bg-surface p-5 sm:p-6">
      {title && <h2 className="mb-4 text-xl font-bold tracking-tight">{title}</h2>}
      {children}
    </section>
  );
}

/** The price, what it is and where — and the round quick actions under it. */
export function PriceBlock({
  price,
  perMonth,
  title,
  place,
  specs,
  t,
  badge,
  children,
}: {
  price: string;
  perMonth: boolean;
  title: string;
  place: string | null;
  specs: string[];
  t: Dictionary;
  /** under the price: how it stands on the market (the stars) */
  badge?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Panel>
      <p className="text-3xl font-bold tracking-tight">
        {price}
        {perMonth && <span className="ml-1.5 text-lg font-medium text-muted">{t.listing.perMonth}</span>}
      </p>
      {badge && <div className="mt-2">{badge}</div>}
      <h1 className="mt-3 text-xl font-semibold leading-snug">{title}</h1>
      {place && <p className="mt-1 text-lg text-muted">{place}</p>}
      {specs.length > 0 && <p className="mt-1 text-lg text-fg-2">{specs.join(" · ")}</p>}
      {children && <div className="mt-5 flex flex-wrap gap-x-6 gap-y-4">{children}</div>}
    </Panel>
  );
}

/** A round quick action with its label under it (a map, the market, edit…). */
export function QuickAction({ href, icon: Icon, label, external = false }: { href: string; icon: LucideIcon; label: string; external?: boolean }) {
  const body = (
    <>
      <span className="grid size-14 place-items-center rounded-full bg-raised text-accent-fg transition group-hover:bg-overlay">
        <Icon className="size-6" />
      </span>
      <span className="mt-1.5 block max-w-16 text-center text-xs leading-tight text-fg-2">{label}</span>
    </>
  );
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="group flex flex-col items-center">
      {body}
    </a>
  ) : (
    <Link href={href} className="group flex flex-col items-center">
      {body}
    </Link>
  );
}

/** The details as rows: an icon, what, how much. */
export function DetailRows({ rows }: { rows: { icon: LucideIcon; label: string; value: string }[] }) {
  return (
    <dl className="divide-y divide-line-soft">
      {rows.map(({ icon: Icon, label, value }) => (
        <div key={label} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
          <Icon className="size-5 shrink-0 text-muted" />
          <dt className="min-w-0 flex-1 text-fg-2">{label}</dt>
          <dd className="text-right font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The amenities: chips with a tick. */
export function AmenityChips({ names }: { names: string[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {names.map((name) => (
        <li key={name} className="inline-flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5 text-sm text-fg-2">
          <Check className="size-3.5 text-success" />
          {name}
        </li>
      ))}
    </ul>
  );
}

type Person = { name: string; avatarPath?: string | null; avatarUrl?: string | null };

function Face({ person, size }: { person: Person; size: "md" | "lg" | "xl" }) {
  return person.avatarUrl ? (
    <img src={person.avatarUrl} alt={person.name} className={`${size === "xl" ? "size-24" : size === "lg" ? "size-16" : "size-12"} shrink-0 rounded-full object-cover ring-2 ring-line-strong`} />
  ) : (
    <Avatar path={person.avatarPath} name={person.name} size={size === "md" ? "md" : size} className="ring-2! ring-line-strong" />
  );
}

/** Who offers the listing: the face, the level, the numbers — and their other listings. */
export function BrokerPanel({
  person,
  level,
  rows,
  href,
  linkLabel,
}: {
  person: Person;
  /** the broker's level, or their job title */
  level: string | null;
  rows: { icon: LucideIcon; label: string; value: string }[];
  href?: string;
  linkLabel?: string;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-surface">
      <div className="flex items-center gap-4 bg-raised/50 p-5 sm:p-6">
        <Face person={person} size="xl" />
        <div className="min-w-0">
          {level && <p className="text-xs font-semibold uppercase tracking-wide text-accent-fg">{level}</p>}
          <p className="mt-0.5 text-2xl font-bold leading-tight tracking-tight">{person.name}</p>
        </div>
      </div>
      {(rows.length > 0 || href) && (
        <div className="p-5 sm:p-6">
          {rows.length > 0 && <DetailRows rows={rows} />}
          {href && linkLabel && (
            <Link href={href} className="mt-5 block rounded-full bg-raised py-3 text-center text-sm font-semibold transition hover:bg-overlay">
              {linkLabel}
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

/** The agency: its logo and name — and its listings. */
export function AgencyPanel({ name, logoUrl, href, linkLabel }: { name: string; logoUrl: string | null; href?: string; linkLabel?: string }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-surface">
      <div className="flex items-center gap-4 bg-raised/50 p-5 sm:p-6">
        {logoUrl ? (
          <img src={logoUrl} alt={name} className="h-16 w-24 shrink-0 rounded-2xl bg-white object-contain p-2" />
        ) : (
          <span className="grid h-16 w-24 shrink-0 place-items-center rounded-2xl bg-accent-soft text-2xl font-bold text-accent-fg">{name.slice(0, 1)}</span>
        )}
        <p className="min-w-0 text-xl font-bold uppercase leading-tight tracking-tight">{name}</p>
      </div>
      {href && linkLabel && (
        <div className="p-5 pt-4 sm:px-6">
          <Link href={href} className="block rounded-full bg-raised py-3 text-center text-sm font-semibold transition hover:bg-overlay">
            {linkLabel}
          </Link>
        </div>
      )}
    </section>
  );
}

/**
 * The bar that floats at the bottom while scrolling: who to reach (the face, the name, a line under)
 * and call / Viber / WhatsApp. Above the phone's bottom menu inside BRIXA.
 */
export function ContactBar({
  person,
  sub,
  phone,
  t,
  inApp = false,
}: {
  person: Person;
  sub: string | null;
  phone: string | null;
  t: Dictionary;
  inApp?: boolean;
}) {
  if (!phone) return null;
  return (
    <div
      className={`sticky z-20 ${
        inApp ? "bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-4" : "bottom-[calc(0.75rem+env(safe-area-inset-bottom))]"
      } rounded-3xl border border-line-strong bg-surface/90 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl print:hidden`}
    >
      <div className="flex items-center gap-3">
        <Face person={person} size="md" />
        <div className="min-w-0">
          <p className="truncate font-bold">{person.name}</p>
          {sub && <p className="truncate text-sm text-muted">{sub}</p>}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] gap-2">
        <a href={telHref(phone)} className="inline-flex items-center justify-center gap-2 rounded-full bg-raised py-3 text-sm font-semibold transition hover:bg-overlay">
          <Phone className="size-4" />
          {t.listing.call}
        </a>
        <a href={viberHref(phone)} aria-label="Viber" className="grid size-12 place-items-center rounded-full bg-[#7360f2] text-white transition hover:opacity-90">
          <MessageCircle className="size-5" />
        </a>
        <a
          href={whatsappHref(phone)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-full bg-[#25d366] py-3 text-sm font-semibold text-white transition hover:opacity-90"
        >
          <MessageCircle className="size-4" />
          WhatsApp
        </a>
      </div>
    </div>
  );
}

/** Deals on similar properties nearby: when, for how much, €/m², m². */
export function SimilarDeals({
  rows,
  subtitle,
  t,
  lang,
}: {
  rows: { day: string; price: string; sqm: string; area: string }[];
  subtitle: string;
  t: Dictionary;
  lang: string;
}) {
  return (
    <Panel title={t.listing.similarTitle}>
      <p className="-mt-3 mb-4 text-lg text-fg-2">{subtitle}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{t.listing.similarNone}</p>
      ) : (
        <div className="overflow-hidden rounded-2xl">
          <table className="w-full text-[13px] sm:text-sm" lang={lang}>
            <thead className="bg-raised/70 text-left">
              <tr>
                <th className="whitespace-nowrap px-3 py-2.5 font-semibold">{t.listing.date}</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">{t.listing.price}</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">{t.listing.perSqm}</th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">{t.listing.area}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {rows.map((row, i) => (
                <tr key={i} className="text-fg-2">
                  <td className="whitespace-nowrap px-3 py-2.5">{row.day}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium text-fg">{row.price}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{row.sqm}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{row.area}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
