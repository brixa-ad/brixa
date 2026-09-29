import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Mail, MapPin, Phone } from "lucide-react";
import { PrintButton } from "@/components/PublicPageTools";
import { getAgency } from "@/lib/agency";
import { avatarUrl } from "@/lib/avatar";
import { formatNumber, formatPrice } from "@/lib/format";
import { fmt, localName } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getOpenHouse, hhmm, placeOf, qrSvg, siteOrigin, weekdayDate } from "@/lib/open-houses";
import { signPhotoUrls } from "@/lib/photos-server";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { personName } from "@/lib/tasks";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.openHouses.flyer };
}

/** The flyer to hand out and to invite with: the home, the day, who to call, and a QR code to sign in. */
export default async function FlyerPage({ params }: PageProps<"/open-houses/[id]/flyer">) {
  const { id } = await params;
  const [session, house] = await Promise.all([getSession(), getOpenHouse(id)]);
  if (!session || !house?.property) notFound();

  const supabase = await createClient();
  const [{ t, lang }, agency, { data: photoRows }, origin] = await Promise.all([
    getI18n(),
    getAgency(house.organization_id),
    supabase.from("property_photos").select("storage_path").eq("property_id", house.property_id).order("position").limit(1),
    siteOrigin(),
  ]);
  const cover = photoRows?.[0]?.storage_path;
  const photo = cover ? (await signPhotoUrls(supabase, [cover])).get(cover) : undefined;
  const qr = await qrSvg(`${origin}/o/${house.token}`);
  const p = house.property;
  const place = placeOf(p);
  const facts = [
    p.area ? `${formatNumber(p.area, lang)} ${t.units.sqm}` : null,
    p.rooms !== null ? `${p.rooms} ${t.share.rooms.toLowerCase()}` : null,
    p.floor !== null ? (p.total_floors !== null ? fmt(t.share.floorOf, { floor: p.floor, total: p.total_floors }) : `${t.share.floor} ${p.floor}`) : null,
  ].filter(Boolean);
  const host = house.host;

  return (
    <div className="stats-page">
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <Link href={`/open-houses/${id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-fg">
          <ArrowLeft className="size-4" />
          {t.openHouses.title}
        </Link>
        <PrintButton label={t.openHouses.print} />
      </div>

      <article className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-line bg-surface shadow-xs print:max-w-none print:rounded-none print:border-0 print:shadow-none">
        <header className="flex items-center justify-between gap-3 px-6 pt-5">
          {agency?.logoUrl ? (
            <img src={agency.logoUrl} alt={agency.name} className="h-10 max-w-44 rounded-md bg-white object-contain p-1" />
          ) : (
            <span className="text-lg font-bold">{agency?.name}</span>
          )}
          <span className="rounded-full bg-accent px-3 py-1 text-xs font-bold uppercase tracking-wide text-on-accent">{t.openHouses.flyerBadge}</span>
        </header>

        {photo && <img src={photo} alt={p.title} className="mt-4 aspect-[16/10] w-full object-cover" />}

        <div className="space-y-4 px-6 py-5">
          <p className="flex items-center gap-2 text-xl font-bold capitalize text-accent-fg">
            <CalendarDays className="size-6 shrink-0" />
            {fmt(t.openHouses.when, { day: weekdayDate(house.day, lang), from: hhmm(house.starts_at), to: hhmm(house.ends_at) })}
          </p>
          <div>
            <p className="text-sm font-medium text-muted">{p.subtype ? localName(p.subtype, lang) : ""}</p>
            <h1 className="text-3xl font-bold tracking-tight">{p.title}</h1>
            {place && (
              <p className="mt-1 flex items-center gap-1.5 text-fg-2">
                <MapPin className="size-4 text-accent-fg" />
                {place}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <span className="text-3xl font-bold">{formatPrice(p.current_price, p.currency, lang) ?? ""}</span>
            {facts.length > 0 && <span className="text-lg text-fg-2">{facts.join(" · ")}</span>}
          </div>

          <p className="rounded-xl bg-accent-soft/60 px-4 py-3 text-sm font-medium">{t.openHouses.flyerCta}</p>

          <div className="flex items-center gap-5 border-t border-line pt-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                {avatarUrl(host?.avatar_path) ? (
                  <img src={avatarUrl(host?.avatar_path)!} alt="" className="size-14 rounded-full object-cover" />
                ) : null}
                <div className="min-w-0">
                  <p className="text-lg font-bold">{personName(host)}</p>
                  {host?.job_title && <p className="text-sm text-muted">{host.job_title}</p>}
                </div>
              </div>
              <div className="mt-2 space-y-0.5 text-sm">
                {host?.phone && (
                  <p className="flex items-center gap-2 font-semibold">
                    <Phone className="size-4 text-accent-fg" />
                    {host.phone}
                  </p>
                )}
                {host?.email && (
                  <p className="flex items-center gap-2 text-fg-2">
                    <Mail className="size-4 text-accent-fg" />
                    {host.email}
                  </p>
                )}
              </div>
            </div>
            <div className="w-32 shrink-0 text-center">
              <div className="rounded-lg bg-white p-1.5 [&_svg]:block [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} />
              <p className="mt-1 text-[11px] font-medium text-muted">{t.openHouses.flyerScan}</p>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}
