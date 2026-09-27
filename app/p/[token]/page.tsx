import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, Globe, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { Logo } from "@/components/Logo";
import { formatNumber, formatPrice } from "@/lib/format";
import { fmt, localName } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { telHref, viberHref, whatsappHref } from "@/lib/phone";
import { getSharedListing } from "@/lib/share";
import { PrintButton, ViewBeacon } from "./SharedPageTools";

export async function generateMetadata({ params }: PageProps<"/p/[token]">): Promise<Metadata> {
  const { token } = await params;
  const [listing, { lang }] = await Promise.all([getSharedListing(token), getI18n()]);
  if (!listing) return { title: "BRIXA", robots: { index: false } };
  const p = listing.property;
  const price = formatPrice(p.price, p.currency, lang);
  const description = [price, p.area ? `${formatNumber(p.area, lang)} м²` : null, p.neighborhood, p.settlement]
    .filter(Boolean)
    .join(" · ");
  return {
    title: { absolute: `${p.title}${listing.agency ? ` · ${listing.agency.name}` : ""}` },
    description,
    robots: { index: false, follow: false },
    openGraph: { title: p.title, description, images: listing.photos.slice(0, 1) },
  };
}

/** The page a client opens from a shared link: the listing, nicely — and who to call. */
export default async function SharedListingPage({ params }: PageProps<"/p/[token]">) {
  const { token } = await params;
  const [listing, { t, lang }] = await Promise.all([getSharedListing(token), getI18n()]);
  if (!listing) notFound();

  const { property: p, photos, broker, agency } = listing;
  const label = <K extends keyof typeof t.options>(group: K, code: string | null) =>
    code ? ((t.options[group] as Record<string, string>)[code] ?? code) : null;
  const facts: [string, string | null][] = [
    [t.share.area, p.area ? `${formatNumber(p.area, lang, 2)} ${t.units.sqm}` : null],
    [t.share.rooms, p.rooms !== null ? String(p.rooms) : null],
    [t.share.bedrooms, p.bedrooms !== null ? String(p.bedrooms) : null],
    [
      t.share.floor,
      p.floor !== null ? (p.total_floors !== null ? fmt(t.share.floorOf, { floor: p.floor, total: p.total_floors }) : String(p.floor)) : null,
    ],
    [t.form.construction, label("construction", p.construction)],
    [t.form.condition, label("condition", p.condition)],
    [t.form.exposure, p.exposures.length ? p.exposures.map((e) => label("exposure", e)).join(", ") : null],
    [t.form.furnishing, label("furnishing", p.furnishing)],
    [t.form.heating, label("heating", p.heating)],
  ];
  const shown = facts.filter(([, value]) => value);
  const place = [p.neighborhood, p.settlement].filter(Boolean).join(", ");
  const whatsapp = broker?.phone ? whatsappHref(broker.phone) : null;

  return (
    <main className="shared-page mx-auto max-w-3xl px-4 pb-16 pt-[calc(1rem+env(safe-area-inset-top))] sm:px-6">
      <ViewBeacon token={token} />

      <header className="mb-5 flex items-center justify-between gap-3">
        {agency?.logoUrl ? (
          <img src={agency.logoUrl} alt={agency.name} className="h-10 max-w-44 rounded-md bg-white object-contain p-1" />
        ) : agency ? (
          <span className="text-lg font-bold">{agency.name}</span>
        ) : (
          <Logo />
        )}
        <PrintButton />
      </header>

      {/* photos: swipe on the phone, a grid on paper */}
      {photos.length > 0 && (
        <div className="shared-photos -mx-4 mb-6 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {photos.map((url, i) => (
            <img
              key={url}
              src={url}
              alt={`${p.title} ${i + 1}`}
              loading={i === 0 ? "eager" : "lazy"}
              className="aspect-[4/3] w-[88%] shrink-0 snap-center rounded-2xl object-cover sm:w-[70%]"
            />
          ))}
        </div>
      )}

      <p className="text-sm font-medium text-muted">
        {[p.subtype && localName(p.subtype, lang), label("operation", p.operation)].filter(Boolean).join(" · ")}
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{p.title}</h1>
      {place && (
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-fg-2">
          <MapPin className="size-4 text-accent-fg" />
          {place}
        </p>
      )}
      <p className="mt-4 text-3xl font-bold text-accent-fg">
        {formatPrice(p.price, p.currency, lang) ?? "—"}
        {p.operation === "rent" && p.price !== null && <span className="ml-1.5 text-base font-medium text-muted">{t.share.perMonth}</span>}
      </p>

      {shown.length > 0 && (
        <section className="mt-6 rounded-2xl border border-line bg-surface p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-subtle">{t.share.details}</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            {shown.map(([name, value]) => (
              <div key={name}>
                <dt className="text-xs text-muted">{name}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {p.features.length > 0 && (
        <section className="mt-4 rounded-2xl border border-line bg-surface p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-subtle">{t.share.features}</h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {p.features.map((f) => (
              <li key={f.name} className="flex items-center gap-2 text-sm text-fg-2">
                <Check className="size-4 text-success" />
                {localName(f, lang)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {p.description && (
        <section className="mt-4 rounded-2xl border border-line bg-surface p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-subtle">{t.share.description}</h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-fg-2">{p.description}</p>
        </section>
      )}

      {/* who to call */}
      {broker && (
        <section className="mt-6 rounded-2xl border border-accent/30 bg-accent-soft/40 p-5">
          <h2 className="mb-3 text-sm font-semibold">{t.share.contactBroker}</h2>
          <div className="flex items-center gap-3">
            {broker.avatarUrl ? (
              <img src={broker.avatarUrl} alt={broker.name} className="size-14 rounded-full object-cover" />
            ) : (
              <span className="grid size-14 place-items-center rounded-full bg-accent text-lg font-bold text-on-accent">
                {broker.name.slice(0, 1)}
              </span>
            )}
            <div className="min-w-0">
              <p className="font-semibold">{broker.name}</p>
              {broker.job_title && <p className="text-sm text-muted">{broker.job_title}</p>}
              {broker.phone && <p className="text-sm text-fg-2">{broker.phone}</p>}
            </div>
          </div>
          <div className="no-print mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {broker.phone && (
              <a href={telHref(broker.phone)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-on-accent">
                <Phone className="size-4" />
                {t.share.call}
              </a>
            )}
            {broker.phone && (
              <a href={viberHref(broker.phone)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm font-semibold">
                <MessageCircle className="size-4" />
                Viber
              </a>
            )}
            {whatsapp && (
              <a href={whatsapp} className="inline-flex items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm font-semibold">
                <MessageCircle className="size-4" />
                WhatsApp
              </a>
            )}
            <a href={`mailto:${broker.email}?subject=${encodeURIComponent(p.title)}`} className="inline-flex items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm font-semibold">
              <Mail className="size-4" />
              {t.share.email}
            </a>
          </div>
        </section>
      )}

      {agency && (
        <footer className="mt-8 space-y-1 border-t border-line pt-5 text-center text-sm text-muted">
          <p className="font-semibold text-fg-2">{agency.name}</p>
          <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            {agency.phone && (
              <a href={telHref(agency.phone)} className="inline-flex items-center gap-1 hover:text-fg">
                <Phone className="size-3.5" />
                {agency.phone}
              </a>
            )}
            {agency.email && (
              <a href={`mailto:${agency.email}`} className="inline-flex items-center gap-1 hover:text-fg">
                <Mail className="size-3.5" />
                {agency.email}
              </a>
            )}
            {agency.website && (
              <a href={agency.website} className="inline-flex items-center gap-1 hover:text-fg" target="_blank" rel="noopener noreferrer">
                <Globe className="size-3.5" />
                {agency.website.replace(/^https?:\/\//, "")}
              </a>
            )}
          </p>
        </footer>
      )}
    </main>
  );
}
