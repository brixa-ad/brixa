import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarDays, DoorClosed, MapPin } from "lucide-react";
import { Logo } from "@/components/Logo";
import { VisitorSignIn } from "@/components/openhouse/VisitorSignIn";
import { logoUrl } from "@/lib/agency";
import { formatNumber, formatPrice } from "@/lib/format";
import { fmt, localName } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { hhmm, weekdayDate } from "@/lib/open-houses";
import { anonymous, UUID } from "@/lib/share";

type PublicHouse = {
  title: string;
  subtype: { name: string; name_en: string | null } | null;
  settlement: string | null;
  neighborhood: string | null;
  price: number | null;
  currency: string;
  area: number | null;
  rooms: number | null;
  day: string;
  starts_at: string;
  ends_at: string;
  cancelled: boolean;
  open: boolean;
  broker: { name: string; phone: string | null } | null;
  agency: { name: string; logo_path: string | null } | null;
};

async function getHouse(token: string) {
  if (!UUID.test(token)) return null;
  const { data } = await anonymous().rpc("open_house_public", { house_token: token });
  return (data as PublicHouse | null) ?? null;
}

export async function generateMetadata({ params }: PageProps<"/o/[token]">): Promise<Metadata> {
  const house = await getHouse((await params).token);
  return { title: { absolute: house ? `${house.title}${house.agency ? ` · ${house.agency.name}` : ""}` : "BRIXA" }, robots: { index: false, follow: false } };
}

/** What the QR code at the door opens: the home in a line, and the sign-in form. */
export default async function OpenHouseSignInPage({ params }: PageProps<"/o/[token]">) {
  const { token } = await params;
  const [house, { t, lang }] = await Promise.all([getHouse(token), getI18n()]);
  if (!house) notFound();

  const place = [house.neighborhood, house.settlement].filter(Boolean).join(", ");
  const logo = logoUrl(house.agency?.logo_path);
  const facts = [
    formatPrice(house.price === null ? null : Number(house.price), house.currency, lang),
    house.area ? `${formatNumber(Number(house.area), lang)} ${t.units.sqm}` : null,
  ].filter(Boolean);

  return (
    <main className="mx-auto max-w-lg px-4 pb-16 pt-[calc(1.25rem+env(safe-area-inset-top))] sm:px-6">
      <header className="mb-6 flex items-center justify-between gap-3">
        {logo ? (
          <img src={logo} alt={house.agency?.name ?? ""} className="h-10 max-w-44 rounded-md bg-white object-contain p-1" />
        ) : house.agency ? (
          <span className="text-lg font-bold">{house.agency.name}</span>
        ) : (
          <Logo />
        )}
        <span className="rounded-full bg-accent px-3 py-1 text-xs font-bold uppercase tracking-wide text-on-accent">{t.openHouses.flyerBadge}</span>
      </header>

      <p className="text-sm font-medium text-muted">{house.subtype ? localName(house.subtype, lang) : ""}</p>
      <h1 className="text-2xl font-bold tracking-tight">{house.title}</h1>
      {place && (
        <p className="mt-1 flex items-center gap-1.5 text-sm text-fg-2">
          <MapPin className="size-4 text-accent-fg" />
          {place}
        </p>
      )}
      <p className="mt-1 flex items-center gap-1.5 text-sm capitalize text-fg-2">
        <CalendarDays className="size-4 text-accent-fg" />
        {fmt(t.openHouses.when, { day: weekdayDate(house.day, lang), from: hhmm(house.starts_at), to: hhmm(house.ends_at) })}
      </p>
      {facts.length > 0 && <p className="mt-2 text-lg font-bold">{facts.join(" · ")}</p>}

      <div className="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-xs">
        {house.open ? (
          <>
            <p className="mb-5 text-sm text-fg-2">{t.openHouses.signIntro}</p>
            <VisitorSignIn token={token} agency={house.agency?.name ?? ""} broker={house.broker?.name ?? ""} />
          </>
        ) : (
          <div className="py-6 text-center">
            <DoorClosed className="mx-auto size-10 text-faint" />
            <p className="mt-3 font-semibold">{t.openHouses.closedTitle}</p>
            <p className="mt-1 text-sm text-muted">{t.openHouses.closedText}</p>
          </div>
        )}
      </div>

      {house.broker && (
        <p className="mt-6 text-center text-sm text-muted">
          {house.broker.name}
          {house.broker.phone ? ` · ${house.broker.phone}` : ""}
        </p>
      )}
    </main>
  );
}
