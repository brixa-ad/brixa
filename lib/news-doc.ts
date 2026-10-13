import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { pdfImage } from "./analysis-doc";
import { formatNumber } from "./format";
import { fmt, locale, type Dictionary, type Lang } from "./i18n/dictionaries";
import { monthName, newsHasPdf, newsText, payment, type NewsData, type NewsKind } from "./news";
import { NewsPdf, type NewsPdfProps } from "./pdf/news-pdf";

export const hasPdf = newsHasPdf;

export type NewsDocInput = {
  kind: NewsKind;
  data: NewsData;
  createdOn: string;
  client: { name: string; firstName: string };
  agency: { name: string; logoUrl: string | null; contacts: string };
  broker: { name: string; role: string | null; phone: string | null; email: string | null; photoUrl: string | null };
  /** the last months' average mortgage rates, newest first */
  rates: { month: string; rate: number }[];
  today: string;
};

const pct = (value: number, lang: Lang) => `${formatNumber(value, lang, 2)}%`;
const euro = (value: number, lang: Lang) => `${formatNumber(Math.round(value), lang)} €`;
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/** The news on A4: the agency's logo, the numbers, the broker's letter, a call to action, the broker with their photo. */
export async function renderNewsPdf(input: NewsDocInput, t: Dictionary, lang: Lang) {
  const P = t.newsPdf;
  const { kind, data } = input;
  const [logo, photo] = await Promise.all([pdfImage(input.agency.logoUrl), pdfImage(input.broker.photoUrl)]);
  const date = new Intl.DateTimeFormat(locale(lang), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${input.createdOn}T00:00:00Z`)
  );
  const area = data.area ?? "";
  const rateRows: [string, string][] = input.rates.slice(0, 6).map((r) => [monthName(r.month, lang), pct(r.rate, lang)]);
  const contactLine = input.broker.phone
    ? fmt(P.callMe, { phone: input.broker.phone })
    : input.broker.email
      ? fmt(P.writeMe, { email: input.broker.email })
      : input.agency.contacts;

  let title = "";
  let subtitle: string | null = null;
  let tiles: NewsPdfProps["tiles"] = [];
  let footnote: string | null = null;
  let table: NewsPdfProps["table"] = null;
  let bigText: string | null = null;
  let cta = P.ctaArea;

  if (kind === "rates" && data.from !== undefined && data.to !== undefined) {
    const monthly = payment(100000, data.from, 300) - payment(100000, data.to, 300);
    title = P.titles.rates;
    subtitle = P.sourceBnb;
    tiles = [
      { label: P.rateNow, value: pct(data.to, lang), note: data.toMonth ? monthName(data.toMonth, lang) : undefined, accent: true },
      { label: P.rateBefore, value: pct(data.from, lang), note: data.fromMonth ? monthName(data.fromMonth, lang) : undefined },
      { label: P.lessMonthly, value: `≈ ${euro(monthly, lang)}` },
      { label: P.lessTotal, value: `≈ ${euro(Math.round((monthly * 300) / 100) * 100, lang)}` },
    ];
    footnote = P.loanNote;
    table = { title: P.ratesTable, rows: rateRows };
    cta = P.ctaRates;
  } else if (kind === "warm_rates" && data.rate !== undefined) {
    title = P.titles.warm_rates;
    subtitle = P.sourceBnb;
    tiles = [
      { label: P.rateNow, value: pct(data.rate, lang), note: data.rateMonth ? monthName(data.rateMonth, lang) : undefined, accent: true },
      ...(data.rateBefore !== undefined ? [{ label: P.rateThreeMonths, value: pct(data.rateBefore, lang) }] : []),
      { label: P.payment, value: `≈ ${euro(payment(100000, data.rate, 300), lang)}`, note: P.perMonth },
    ];
    footnote = P.loanNote;
    table = { title: P.ratesTable, rows: rateRows };
    cta = data.role === "buyer" ? P.ctaRates : P.ctaOwner;
  } else if (kind === "prices") {
    title = fmt(P.titles.prices, { area });
    subtitle = data.since ? fmt(P.since, { since: monthName(data.since.slice(0, 7), lang) }) : null;
    tiles = [
      { label: P.avgPrice, value: `${formatNumber(data.sqm ?? 0, lang)} €/м²`, accent: true },
      { label: P.change, value: `+${formatNumber(data.change ?? 0, lang, 1)}%` },
    ];
    cta = data.role === "buyer" ? { title: fmt(P.ctaBuyer.title, { area }), line: P.ctaBuyer.line } : P.ctaOwner;
  } else if (kind === "monthly" || kind === "warm_analysis") {
    title = area ? fmt(kind === "monthly" ? P.titles.monthly : P.titles.warm_analysis, { area }) : P.titles.market;
    tiles = [
      ...(data.sqm ? [{ label: P.avgPrice, value: `${formatNumber(data.sqm, lang)} €/м²`, accent: true }] : []),
      ...(data.change !== undefined ? [{ label: P.change, value: `${data.change > 0 ? "+" : ""}${formatNumber(data.change, lang, 1)}%` }] : []),
      ...(data.listings ? [{ label: P.listings, value: String(data.listings) }] : []),
      ...(data.rate !== undefined ? [{ label: P.rateNow, value: pct(data.rate, lang), note: data.rateMonth ? monthName(data.rateMonth, lang) : undefined }] : []),
    ];
    cta = P.ctaArea;
  } else if (kind === "tips") {
    const index = Number((data.month ?? input.today.slice(0, 7)).slice(5, 7)) - 1;
    const month = new Intl.DateTimeFormat(locale(lang), { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2000, index, 1)));
    title = fmt(P.titles.tips, { month });
    const tip = t.news.tipsList[index] ?? t.news.tipsList[0];
    bigText = tip.charAt(0).toUpperCase() + tip.slice(1);
    cta = P.ctaTips;
  }

  // the broker's letter: the message itself (the document carries it too)
  const letter = kind === "tips" ? null : newsText(kind, data, { name: input.client.firstName, broker: input.broker.name }, t, lang, input.today);

  return renderToBuffer(
    NewsPdf({
      docTitle: title,
      preparedFor: fmt(P.preparedFor, { name: input.client.name }),
      date,
      agency: { name: input.agency.name, logo, contacts: input.agency.contacts },
      kicker: t.news.kinds[kind],
      title,
      subtitle,
      tiles,
      footnote,
      table,
      bigText,
      letter,
      cta: { title: cta.title, line: contactLine },
      broker: { ...input.broker, photo, initials: initials(input.broker.name) },
    })
  );
}
