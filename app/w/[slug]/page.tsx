import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BedDouble, Globe, Home, Mail, MapPin, Maximize2, Phone } from "lucide-react";
import { InquiryForm } from "@/components/site/InquiryForm";
import { formatNumber, formatPrice } from "@/lib/format";
import { localName } from "@/lib/i18n/dictionaries";
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
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((l) => (
              <li key={l.id}>
                <Link href={`/w/${slug}/${l.id}`} className="group block overflow-hidden rounded-2xl border border-line bg-surface shadow-xs transition hover:border-accent/50 hover:shadow-md">
                  <div className="relative aspect-[4/3] bg-raised">
                    {l.photoUrl ? (
                      <img src={l.photoUrl} alt={l.title} loading="lazy" className="size-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                    ) : (
                      <Home className="absolute inset-0 m-auto size-10 text-faint" />
                    )}
                    <span className="absolute left-3 top-3 rounded-md bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">
                      {l.operation === "rent" ? t.site.forRent : t.site.forSale}
                    </span>
                    {l.status === "reserved" && (
                      <span className="absolute right-3 top-3 rounded-md bg-warning px-2 py-0.5 text-xs font-semibold text-white">{t.options.status.reserved}</span>
                    )}
                  </div>
                  <div className="p-4">
                    <p className="text-lg font-bold text-accent-fg">
                      {formatPrice(l.price, l.currency, lang) ?? "—"}
                      {l.operation === "rent" && l.price !== null && <span className="ml-1 text-sm font-medium text-muted">{t.share.perMonth}</span>}
                    </p>
                    <p className="mt-0.5 truncate font-semibold">{l.title}</p>
                    <p className="mt-1 flex items-center gap-1 truncate text-sm text-muted">
                      <MapPin className="size-3.5 shrink-0" />
                      {[l.neighborhood, l.settlement].filter(Boolean).join(", ") || "—"}
                    </p>
                    <p className="mt-2 flex flex-wrap gap-x-4 text-xs text-fg-2">
                      {l.subtype && <span>{localName(l.subtype, lang)}</span>}
                      {l.area && (
                        <span className="inline-flex items-center gap-1">
                          <Maximize2 className="size-3.5 text-subtle" />
                          {`${formatNumber(l.area, lang)} ${t.units.sqm}`}
                        </span>
                      )}
                      {l.rooms !== null && (
                        <span className="inline-flex items-center gap-1">
                          <BedDouble className="size-3.5 text-subtle" />
                          {l.rooms}
                        </span>
                      )}
                    </p>
                  </div>
                </Link>
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
