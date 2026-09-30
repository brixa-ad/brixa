import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, MapPin } from "lucide-react";
import { BrokerCard } from "@/components/PublicContact";
import { InquiryForm } from "@/components/site/InquiryForm";
import { formatNumber, formatPrice } from "@/lib/format";
import { fmt, localName } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getSiteListing } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/w/[slug]/[id]">): Promise<Metadata> {
  const { slug, id } = await params;
  const [listing, { lang }] = await Promise.all([getSiteListing(slug, id), getI18n()]);
  if (!listing) return { title: { absolute: "BRIXA" }, robots: { index: false } };
  const p = listing.property;
  const description = [formatPrice(p.price, p.currency, lang), p.area ? `${formatNumber(p.area, lang)} м²` : null, p.neighborhood, p.settlement]
    .filter(Boolean)
    .join(" · ");
  return {
    title: { absolute: `${p.title}${listing.agency ? ` · ${listing.agency.name}` : ""}` },
    description,
    openGraph: { title: p.title, description, images: listing.photos.slice(0, 1) },
  };
}

/** One listing on the website: the photos, the details, the broker, and "I'm interested". */
export default async function SiteListingPage({ params }: PageProps<"/w/[slug]/[id]">) {
  const { slug, id } = await params;
  const [listing, { t, lang }] = await Promise.all([getSiteListing(slug, id), getI18n()]);
  if (!listing) notFound();

  const { property: p, photos, broker, agency } = listing;
  const label = <K extends keyof typeof t.options>(group: K, code: string | null) =>
    code ? ((t.options[group] as Record<string, string>)[code] ?? code) : null;
  const facts: [string, string | null][] = [
    [t.share.area, p.area ? `${formatNumber(p.area, lang, 2)} ${t.units.sqm}` : null],
    [t.share.rooms, p.rooms !== null ? String(p.rooms) : null],
    [t.share.bedrooms, p.bedrooms !== null ? String(p.bedrooms) : null],
    [t.share.floor, p.floor !== null ? (p.total_floors !== null ? fmt(t.share.floorOf, { floor: p.floor, total: p.total_floors }) : String(p.floor)) : null],
    [t.form.construction, label("construction", p.construction)],
    [t.form.condition, label("condition", p.condition)],
    [t.form.furnishing, label("furnishing", p.furnishing)],
    [t.form.heating, label("heating", p.heating)],
  ];
  const shown = facts.filter(([, value]) => value);
  const place = [p.neighborhood, p.settlement].filter(Boolean).join(", ");

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-[calc(1rem+env(safe-area-inset-top))] sm:px-6">
      <header className="flex items-center justify-between gap-3 py-2">
        <Link href={`/w/${slug}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-fg">
          <ArrowLeft className="size-4" />
          {t.site.allListings}
        </Link>
        {agency?.logoUrl ? (
          <img src={agency.logoUrl} alt={agency.name} className="h-9 max-w-40 rounded-md bg-white object-contain p-1" />
        ) : (
          <span className="font-bold">{agency?.name}</span>
        )}
      </header>

      {photos.length > 0 && (
        <div className="-mx-4 mt-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {photos.map((url, i) => (
            <img key={url} src={url} alt={`${p.title} ${i + 1}`} loading={i === 0 ? "eager" : "lazy"} className="aspect-[4/3] w-[88%] shrink-0 snap-center rounded-2xl object-cover sm:w-[60%]" />
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <p className="text-sm font-medium text-muted">{[p.subtype && localName(p.subtype, lang), label("operation", p.operation)].filter(Boolean).join(" · ")}</p>
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
        </div>

        <aside className="space-y-4">
          {broker && <BrokerCard broker={broker} subject={p.title} t={t} />}
          <div className="rounded-2xl border border-accent/30 bg-accent-soft/30 p-5">
            <h2 className="mb-3 font-bold">{t.site.interested}</h2>
            <InquiryForm slug={slug} propertyId={p.id} agency={agency?.name ?? ""} defaultMessage={fmt(t.site.interestedMessage, { title: p.title })} />
          </div>
        </aside>
      </div>

      <footer className="mt-12 text-center text-xs text-subtle">{t.site.madeWith}</footer>
    </main>
  );
}
