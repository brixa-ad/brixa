import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MessageSquareQuote, Search } from "lucide-react";
import { AgencyFooter, BrokerCard, PublicHeader } from "@/components/PublicContact";
import { formatDate, formatNumber, formatPrice } from "@/lib/format";
import { fmt, localName, type Dictionary } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getSharedSearch } from "@/lib/search-share";

export async function generateMetadata({ params }: PageProps<"/s/[token]">): Promise<Metadata> {
  const { token } = await params;
  const [data, { t }] = await Promise.all([getSharedSearch(token), getI18n()]);
  if (!data) return { title: { absolute: "BRIXA" }, robots: { index: false } };
  return {
    title: { absolute: `${t.searchShare.pageTitle}${data.agency ? ` · ${data.agency.name}` : ""}` },
    description: t.searchShare.intro,
    robots: { index: false, follow: false },
  };
}

function range(min: number | null, max: number | null, t: Dictionary, format: (n: number) => string) {
  if (min === null && max === null) return null;
  if (min !== null && max !== null) return `${format(min)} – ${format(max)}`;
  return min !== null ? `${t.clients.from} ${format(min)}` : `${t.clients.to} ${format(max!)}`;
}

/** A broker's client search, for colleagues: the criteria and who to call — never the client. */
export default async function SharedSearchPage({ params }: PageProps<"/s/[token]">) {
  const { token } = await params;
  const [data, { t, lang }] = await Promise.all([getSharedSearch(token), getI18n()]);
  if (!data) notFound();

  const s = data.search;
  const money = (n: number) => formatPrice(n, s.currency, lang)!;
  const plain = (n: number) => formatNumber(n, lang)!;
  const places = s.neighborhoods.length ? [...s.neighborhoods, ...s.settlements] : s.settlements;
  const rows: [string, string][] = [
    [t.clients.searchOperation, t.options.searchOperation[s.operation]],
    [t.clients.searchSubtypes, s.subtypes.map((x) => localName(x, lang)).join(", ") || t.clients.anyValue],
    [t.clients.searchLocations, places.join(", ") || t.clients.anyValue],
    [t.clients.searchBudget, range(s.budget_min, s.budget_max, t, money) ?? t.clients.anyValue],
    [t.clients.searchArea, range(s.area_min, s.area_max, t, (n) => `${plain(n)} ${t.units.sqm}`) ?? t.clients.anyValue],
    [t.clients.searchRooms, range(s.rooms_min, s.rooms_max, t, plain) ?? t.clients.anyValue],
  ];
  if (s.features.length) rows.push([t.clients.searchFeatures, s.features.map((f) => localName(f, lang)).join(", ")]);

  return (
    <main className="shared-page mx-auto max-w-3xl px-4 pb-16 pt-[calc(1rem+env(safe-area-inset-top))] sm:px-6">
      <PublicHeader agency={data.agency} />

      <p className="flex items-center gap-2 text-sm font-medium text-muted">
        <Search className="size-4 text-accent-fg" />
        {t.searchShare.pageTitle}
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
        {[s.subtypes.map((x) => localName(x, lang)).join(", "), places.join(", ")].filter(Boolean).join(" · ") ||
          t.searchShare.pageTitle}
      </h1>
      <p className="mt-2 text-fg-2">{t.searchShare.intro}</p>

      <section className="mt-6 rounded-2xl border border-line bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-subtle">{t.searchShare.criteria}</h2>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="mt-0.5 font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-subtle">{fmt(t.searchShare.updated, { date: formatDate(s.updated_at, lang) })}</p>
      </section>

      {data.comment && (
        <section className="mt-4 rounded-2xl border border-accent/30 bg-accent-soft/40 p-5">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <MessageSquareQuote className="size-4 text-accent-fg" />
            {t.searchShare.comment}
          </h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-fg-2">{data.comment}</p>
        </section>
      )}

      {data.broker && <BrokerCard broker={data.broker} subject={t.searchShare.pageTitle} t={t} />}
      {data.agency && <AgencyFooter agency={data.agency} />}
    </main>
  );
}
