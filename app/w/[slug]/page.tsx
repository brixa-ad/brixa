import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Globe, Mail, MapPin, Phone } from "lucide-react";
import { ListingCard } from "@/components/listing/ListingCard";
import { InquiryForm } from "@/components/site/InquiryForm";
import { formatNumber, formatPrice } from "@/lib/format";
import { fmt, localName } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { telHref } from "@/lib/phone";
import { getSite } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/w/[slug]">): Promise<Metadata> {
  const site = await getSite((await params).slug);
  if (!site) return { title: { absolute: "BRIXA" }, robots: { index: false } };
  const description = site.agency.headline ?? site.agency.about?.slice(0, 160) ?? undefined;
  return {
    title: { absolute: site.agency.name },
    description,
    openGraph: { title: site.agency.name, description, images: site.listings.find((l) => l.photoUrl)?.photoUrl ? [site.listings.find((l) => l.photoUrl)!.photoUrl!] : [] },
  };
}

/** The agency's (or the solo broker's) own website: every active listing, the team, and "call me back". */
export default async function SitePage({ params, searchParams }: PageProps<"/w/[slug]">) {
  const { slug } = await params;
  const { op, town } = await searchParams;
  const [site, { t, lang }] = await Promise.all([getSite(slug), getI18n()]);
  if (!site) notFound();

  const operation = op === "sale" || op === "rent" ? op : null;
  const towns = [...new Set(site.listings.map((l) => l.settlement).filter((s): s is string => Boolean(s)))].sort((a, b) => a.localeCompare(b, "bg"));
  const shown = site.listings.filter((l) => (!operation || l.operation === operation) && (typeof town !== "string" || !town || l.settlement === town));
  const href = (next: { op?: string | null; town?: string | null }) => {
    const qs = new URLSearchParams();
    const o = next.op === undefined ? operation : next.op;
    const tw = next.town === undefined ? (typeof town === "string" ? town : null) : next.town;
    if (o) qs.set("op", o);
    if (tw) qs.set("town", tw);
    const s = qs.toString();
    return s ? `/w/${slug}?${s}` : `/w/${slug}`;
  };
  const chip = (active: boolean) =>
    `whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${active ? "border-accent bg-accent text-on-accent" : "border-line bg-surface text-fg-2 hover:border-accent/50"}`;
  const { agency } = site;

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-[calc(1rem+env(safe-area-inset-top))] sm:px-6">
      {/* ---- the agency ---- */}
      <header className="flex flex-wrap items-center justify-between gap-3 py-2">
        {agency.logoUrl ? (
          <img src={agency.logoUrl} alt={agency.name} className="h-11 max-w-52 rounded-md bg-white object-contain p-1" />
        ) : (
          <span className="text-xl font-bold">{agency.name}</span>
        )}
        {agency.phone && (
          <a href={telHref(agency.phone)} className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-on-accent">
            <Phone className="size-4" />
            {agency.phone}
          </a>
        )}
      </header>

      <section className="mt-6 rounded-3xl border border-line bg-gradient-to-br from-accent/15 via-surface to-brand-cyan/10 px-6 py-10 sm:px-10">
        <h1 className="max-w-3xl text-3xl font-bold tracking-tight sm:text-5xl">{agency.headline || agency.name}</h1>
        {agency.about && <p className="mt-4 max-w-2xl whitespace-pre-line text-base leading-relaxed text-fg-2">{agency.about}</p>}
        <p className="mt-6 text-sm font-medium text-muted">{`${site.listings.length} ${t.site.listingsCount}`}</p>
      </section>

      {/* ---- the listings ---- */}
      <section className="mt-8">
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          <Link href={href({ op: null })} className={chip(!operation)}>
            {t.site.all}
          </Link>
          <Link href={href({ op: "sale" })} className={chip(operation === "sale")}>
            {t.site.forSale}
          </Link>
          <Link href={href({ op: "rent" })} className={chip(operation === "rent")}>
            {t.site.forRent}
          </Link>
          {towns.length > 1 &&
            towns.map((tw) => (
              <Link key={tw} href={href({ town: town === tw ? null : tw })} className={chip(town === tw)}>
                {tw}
              </Link>
            ))}
        </div>

        {shown.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center text-sm text-muted">{t.site.noListings}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((l) => (
              <li key={l.id}>
                <ListingCard
                  t={t}
                  data={{
                    href: `/w/${slug}/${l.id}`,
                    photos: l.photoUrl ? [l.photoUrl] : [],
                    title: l.title,
                    place: [l.neighborhood, l.settlement].filter(Boolean).join(", ") || null,
                    price: formatPrice(l.price, l.currency, lang) ?? "—",
                    perMonth: l.operation === "rent" && l.price !== null,
                    specs: [
                      l.subtype ? localName(l.subtype, lang) : null,
                      l.rooms ? (l.rooms === 1 ? t.listing.oneRoom : fmt(t.listing.rooms, { n: l.rooms })) : null,
                      l.area ? `${formatNumber(l.area, lang)} ${t.units.sqm}` : null,
                    ].filter((x): x is string => Boolean(x)),
                    status: l.status === "active" ? null : { code: l.status, label: t.options.status[l.status as keyof typeof t.options.status] ?? l.status },
                    exclusive: false,
                    offMarket: false,
                    broker: null,
                    phone: agency.phone,
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- the people, and "call me back" ---- */}
      <section className="mt-12 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-line bg-surface p-6">
          <h2 className="text-lg font-bold">{site.team.length > 1 ? t.site.team : t.site.contact}</h2>
          <ul className="mt-4 space-y-4">
            {site.team.map((m) => (
              <li key={m.email} className="flex items-center gap-3">
                {m.avatarUrl ? (
                  <img src={m.avatarUrl} alt={m.name} className="size-12 rounded-full object-cover" />
                ) : (
                  <span className="grid size-12 place-items-center rounded-full bg-accent text-lg font-bold text-on-accent">{m.name.slice(0, 1)}</span>
                )}
                <div className="min-w-0">
                  <p className="font-semibold">{m.name}</p>
                  {m.job_title && <p className="text-sm text-muted">{m.job_title}</p>}
                  {m.phone && (
                    <a href={telHref(m.phone)} className="text-sm font-medium text-accent-fg">
                      {m.phone}
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-6 space-y-1.5 border-t border-line-soft pt-4 text-sm text-fg-2">
            {agency.address && (
              <p className="flex items-center gap-2">
                <MapPin className="size-4 text-accent-fg" />
                {agency.address}
              </p>
            )}
            {agency.email && (
              <p className="flex items-center gap-2">
                <Mail className="size-4 text-accent-fg" />
                <a href={`mailto:${agency.email}`}>{agency.email}</a>
              </p>
            )}
            {agency.website && (
              <p className="flex items-center gap-2">
                <Globe className="size-4 text-accent-fg" />
                <a href={agency.website} target="_blank" rel="noreferrer">
                  {agency.website.replace(/^https?:\/\//, "")}
                </a>
              </p>
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-accent/30 bg-accent-soft/30 p-6">
          <h2 className="text-lg font-bold">{t.site.callMe}</h2>
          <p className="mb-4 mt-1 text-sm text-fg-2">{t.site.callMeHint}</p>
          <InquiryForm slug={slug} propertyId={null} agency={agency.name} />
        </div>
      </section>

      <footer className="mt-12 text-center text-xs text-subtle">{t.site.madeWith}</footer>
    </main>
  );
}
