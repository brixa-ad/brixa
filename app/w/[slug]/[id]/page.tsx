import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BedDouble, BrickWall, Building2, Flame, Hammer, Layers, LayoutGrid, Mail, MapPinned, Phone, Ruler, Sofa } from "lucide-react";
import { ClampText } from "@/components/listing/ClampText";
import { ListingHero } from "@/components/listing/ListingHero";
import { AmenityChips, BrokerPanel, ContactBar, DetailRows, Panel, PriceBlock, QuickAction } from "@/components/listing/ListingParts";
import { YieldPanel } from "@/components/listing/YieldPanel";
import { rentalYield } from "@/lib/yield";
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
  const place = [p.neighborhood, p.settlement].filter(Boolean).join(", ");
  const headline = [
    p.subtype ? localName(p.subtype, lang) : null,
    p.rooms ? (p.rooms === 1 ? t.listing.oneRoom : fmt(t.listing.rooms, { n: p.rooms })) : null,
    p.bedrooms ? (p.bedrooms === 1 ? t.listing.oneBedroom : fmt(t.listing.bedrooms, { n: p.bedrooms })) : null,
    p.area ? `${formatNumber(p.area, lang)} ${t.units.sqm}` : null,
  ].filter((x): x is string => Boolean(x));
  const ICONS = [Ruler, LayoutGrid, BedDouble, Layers, BrickWall, Hammer, Sofa, Flame];
  const rows = [
    ...(p.subtype ? [{ icon: Building2, label: t.listing.type, value: localName(p.subtype, lang) }] : []),
    ...facts
      .map(([name, value], i) => ({ icon: ICONS[i] ?? Building2, label: name, value }))
      .filter((row): row is { icon: typeof Building2; label: string; value: string } => Boolean(row.value)),
  ];

  // a listing for sale as an investment: the rent it would bring and the yield
  const investment = p.operation === "sale" ? rentalYield(p.price, p.currency, p.expected_rent, p.rent_estimate) : null;

  return (
    <main className="mx-auto max-w-5xl px-4 pb-8 pt-[calc(1rem+env(safe-area-inset-top))] sm:px-6">
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

      <div className="mt-3">
        <ListingHero photos={photos.map((url, i) => ({ id: url, storage_path: url, position: i, url }))} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <PriceBlock
            price={formatPrice(p.price, p.currency, lang) ?? "—"}
            perMonth={p.operation === "rent" && p.price !== null}
            title={p.title}
            place={place || null}
            specs={headline}
            t={t}
          >
            {place && <QuickAction href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`} icon={MapPinned} label={t.listing.map} external />}
          </PriceBlock>
          {rows.length > 0 && (
            <Panel title={t.listing.details}>
              <DetailRows rows={rows} />
            </Panel>
          )}

          {investment && (
            <YieldPanel
              y={investment}
              t={t}
              lang={lang}
              source={investment.fromBroker ? `${t.yield.fromBroker} ${t.yield.publicNote}` : t.yield.publicNote}
            />
          )}
          {p.description && (
            <Panel title={t.listing.description}>
              <ClampText text={p.description} more={t.listing.more} less={t.listing.less} />
            </Panel>
          )}
          {p.features.length > 0 && (
            <Panel title={t.listing.amenities}>
              <AmenityChips names={p.features.map((f) => localName(f, lang))} />
            </Panel>
          )}
          {broker && (
            <ContactBar person={{ name: broker.name, avatarUrl: broker.avatarUrl }} sub={broker.job_title ?? agency?.name ?? null} phone={broker.phone} t={t} />
          )}
        </div>

        <aside className="space-y-5">
          {broker && (
            <BrokerPanel
              person={{ name: broker.name, avatarUrl: broker.avatarUrl }}
              level={broker.job_title}
              rows={[
                ...(broker.phone ? [{ icon: Phone, label: t.partners.phone, value: broker.phone }] : []),
                { icon: Mail, label: t.partners.email, value: broker.email },
              ]}
            />
          )}
          <div className="rounded-3xl border border-accent/30 bg-accent-soft/30 p-5">
            <h2 className="mb-3 font-bold">{t.site.interested}</h2>
            <InquiryForm slug={slug} propertyId={p.id} agency={agency?.name ?? ""} defaultMessage={fmt(t.site.interestedMessage, { title: p.title })} />
          </div>
        </aside>
      </div>

      <footer className="mt-12 text-center text-xs text-subtle">{t.site.madeWith}</footer>
    </main>
  );
}
