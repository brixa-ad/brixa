import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BedDouble, BrickWall, Building2, Compass, Flame, Hammer, Layers, LayoutGrid, Mail, MapPinned, Phone, Ruler, Sofa } from "lucide-react";
import { ClampText } from "@/components/listing/ClampText";
import { ListingHero } from "@/components/listing/ListingHero";
import { AgencyPanel, AmenityChips, BrokerPanel, ContactBar, DetailRows, Panel, PriceBlock, QuickAction } from "@/components/listing/ListingParts";
import { AgencyFooter, PublicHeader } from "@/components/PublicContact";
import { PrintButton, ViewBeacon } from "@/components/PublicPageTools";
import { formatNumber, formatPrice } from "@/lib/format";
import { fmt, localName } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getSharedListing } from "@/lib/share";

export async function generateMetadata({ params }: PageProps<"/p/[token]">): Promise<Metadata> {
  const { token } = await params;
  const [listing, { lang }] = await Promise.all([getSharedListing(token), getI18n()]);
  if (!listing) return { title: { absolute: "BRIXA" }, robots: { index: false } };
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
  const place = [p.neighborhood, p.settlement].filter(Boolean).join(", ");

  const headline = [
    p.subtype ? localName(p.subtype, lang) : null,
    p.rooms ? (p.rooms === 1 ? t.listing.oneRoom : fmt(t.listing.rooms, { n: p.rooms })) : null,
    p.bedrooms ? (p.bedrooms === 1 ? t.listing.oneBedroom : fmt(t.listing.bedrooms, { n: p.bedrooms })) : null,
    p.area ? `${formatNumber(p.area, lang)} ${t.units.sqm}` : null,
  ].filter((x): x is string => Boolean(x));
  const ICONS = [Ruler, LayoutGrid, BedDouble, Layers, BrickWall, Hammer, Compass, Sofa, Flame];
  const rows = [
    ...(p.subtype ? [{ icon: Building2, label: t.listing.type, value: localName(p.subtype, lang) }] : []),
    ...facts
      .map(([name, value], i) => ({ icon: ICONS[i] ?? Building2, label: name, value }))
      .filter((row): row is { icon: typeof Building2; label: string; value: string } => Boolean(row.value)),
  ];

  return (
    <main className="shared-page mx-auto max-w-3xl px-4 pb-8 pt-[calc(1rem+env(safe-area-inset-top))] sm:px-6">
      <ViewBeacon token={token} kind="listing" />

      <PublicHeader agency={agency} />

      {/* the photos, edge to edge on the phone (swipe; tap: full screen) — a grid on paper */}
      <div className="no-print">
        <ListingHero photos={photos.map((url, i) => ({ id: url, storage_path: url, position: i, url }))} photoClass="listing-photo" />
      </div>
      <div className="shared-photos hidden">
        {photos.map((url, i) => (
          <img key={url} src={url} alt={`${p.title} ${i + 1}`} loading="lazy" />
        ))}
      </div>

      <div className="mt-5 space-y-5">
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
          <BrokerPanel
            person={{ name: broker.name, avatarUrl: broker.avatarUrl }}
            level={broker.job_title}
            rows={[
              ...(broker.phone ? [{ icon: Phone, label: t.partners.phone, value: broker.phone }] : []),
              { icon: Mail, label: t.partners.email, value: broker.email },
            ]}
          />
        )}

        {agency && (
          <AgencyPanel
            name={agency.name}
            logoUrl={agency.logoUrl}
            href={agency.website ?? undefined}
            linkLabel={agency.website ? t.listing.agencyListings : undefined}
          />
        )}

        <div className="no-print flex justify-center">
          <PrintButton />
        </div>

        {broker && (
          <ContactBar
            person={{ name: broker.name, avatarUrl: broker.avatarUrl }}
            sub={broker.job_title ?? agency?.name ?? null}
            phone={broker.phone}
            t={t}
          />
        )}
      </div>

      {agency && <AgencyFooter agency={agency} />}
    </main>
  );
}
