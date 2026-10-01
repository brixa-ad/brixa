import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AnniversaryCard, type CardData } from "@/components/deal/AnniversaryCard";
import { MessageSender } from "@/components/program/MessageSender";
import { Card } from "@/components/ui/form";
import { logoUrl } from "@/lib/agency";
import { avatarUrl } from "@/lib/avatar";
import { sofiaToday } from "@/lib/dates";
import { formatDate, formatPrice } from "@/lib/format";
import { fmt } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { signPhotoUrls } from "@/lib/photos-server";
import { firstName } from "@/lib/programs";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.anniversary.cardTitle };
}

type CardRow = {
  client: string | null;
  closed_on: string;
  title: string | null;
  area: number | null;
  place: string | null;
  photo: string | null;
  market: { growth: number; value: number; bought: number } | null;
  broker: { name: string; email: string; phone: string | null; job_title: string | null; avatar_path: string | null } | null;
  agency: { name: string; phone: string | null; website: string | null; logo_path: string | null } | null;
};

/** The anniversary of a purchase: the card to send the client (an image or a PDF) and the text to go with it. */
export default async function AnniversaryCardPage({ params }: PageProps<"/deals/[id]/card">) {
  const { id } = await params;
  const session = await getSession();
  if (!session) notFound();
  const supabase = await createClient();
  const [{ t, lang }, { data }] = await Promise.all([getI18n(), supabase.rpc("anniversary_card", { target_deal: id })]);
  const row = data as CardRow | null;
  if (!row) notFound();

  // the anniversary it's for: today's, or the next one
  const today = sofiaToday();
  const closedYear = Number(row.closed_on.slice(0, 4));
  let year = Number(today.slice(0, 4));
  if (`${year}${row.closed_on.slice(4)}` < today) year++;
  const years = Math.max(1, year - closedYear);
  const anniversary = `${closedYear + years}${row.closed_on.slice(4)}`;

  const growth = row.market && Number(row.market.growth) >= 0.01 ? Math.round(Number(row.market.growth) * 100) : null;
  const place = row.place ? fmt(t.anniversary.inPlace, { place: row.place }) : "";
  const since = `${years === 1 ? t.anniversary.sinceOne : fmt(t.anniversary.sinceMany, { n: years })}${place}`;
  const photo = row.photo ? (await signPhotoUrls(supabase, [row.photo])).get(row.photo) ?? null : null;
  const broker = row.broker;

  const card: CardData = {
    agency: row.agency?.name ?? "",
    logoUrl: logoUrl(row.agency?.logo_path),
    photoUrl: photo,
    heading: t.anniversary.heading,
    years: years === 1 ? t.anniversary.yearOne : fmt(t.anniversary.yearsMany, { n: years }),
    since: `${since}.`,
    growthPct: growth,
    growthLabel: t.anniversary.growth,
    growthHint: t.anniversary.growthHint,
    value: growth !== null && row.market ? fmt(t.anniversary.value, { value: formatPrice(Number(row.market.value), "EUR", lang) ?? "" }) : null,
    thanks: t.anniversary.thanks,
    broker: broker?.name ?? "",
    brokerLine: [broker?.phone, row.agency?.name].filter(Boolean).join(" · "),
    avatarUrl: avatarUrl(broker?.avatar_path),
  };
  const message = fmt(t.anniversary.message, {
    name: firstName(row.client ?? ""),
    since,
    growth: growth !== null ? fmt(t.anniversary.messageGrowth, { pct: growth }) : "",
    broker: broker?.name ?? "",
  });

  // the client's phone and e-mail, to send it straight away (whoever may see the deal sees its client)
  const { data: deal } = await supabase.from("deals").select("client:clients(phone, email)").eq("id", id).maybeSingle();
  const client = (deal?.client as unknown as { phone: string | null; email: string | null } | null) ?? null;

  return (
    <div className="stats-page">
      <div className="mb-5 flex items-center justify-between gap-3 print:hidden">
        <Link href={`/deals/${id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-fg">
          <ArrowLeft className="size-4" />
          {row.client ?? row.title}
        </Link>
        {anniversary !== today && <span className="text-xs text-muted">{fmt(t.anniversary.preview, { date: formatDate(anniversary, lang) })}</span>}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <AnniversaryCard card={card} fileName={`${t.anniversary.heading.replace(/[^\p{L}\p{N}]+/gu, "-")}${years}`} shareText={message} />
        <aside className="print:hidden">
          <Card title={t.anniversary.textTitle}>
            <MessageSender text={message} phone={client?.phone} email={client?.email} subject={t.anniversary.heading} />
          </Card>
        </aside>
      </div>
    </div>
  );
}
