import "server-only";
import { cache } from "react";
import { logoUrl } from "./agency";
import { toMarketFacts, type MarketFacts } from "./market";
import { avatarUrl } from "./avatar";
import { PHOTO_BUCKET } from "./photos";
import { UUID, anonymous } from "./share";

export type OwnerReport = {
  report: { period_start: string; period_end: string; comment: string | null; created_at: string };
  owner: string | null;
  property: {
    title: string;
    operation: string;
    status: string;
    price: number | null;
    asking_price: number | null;
    currency: string;
    area: number | null;
    listed_at: string;
    settlement: string | null;
    neighborhood: string | null;
    coverUrl: string | null;
  };
  totals: { viewings: number; inquiries: number; shared: number; opened: number; offers: number; best_offer: number | null };
  viewings: string[];
  inquiries: string[];
  offers: { amount: number; currency: string; on: string; status: "open" | "accepted" | "rejected" }[];
  in_progress: { stage: string; kind: string; count: number }[];
  prices: { at: string; old: number | null; new: number | null; currency: string }[];
  /** the price against the market (aggregates only) */
  market: MarketFacts | null;
  broker: { name: string; email: string; phone: string | null; job_title: string | null; avatarUrl: string | null } | null;
  agency: { name: string; phone: string | null; email: string | null; website: string | null; logoUrl: string | null } | null;
};

const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));

/** An owner's report page data (null: unknown or stopped link). Cached per request. */
export const getOwnerReport = cache(async (token: string): Promise<OwnerReport | null> => {
  if (!UUID.test(token)) return null;
  const supabase = anonymous();
  const { data, error } = await supabase.rpc("owner_report", { report_token: token });
  if (error || !data) return null;

  type Raw = Omit<OwnerReport, "property" | "broker" | "agency"> & {
    property: Omit<OwnerReport["property"], "coverUrl"> & { cover: string | null };
    broker: (Omit<NonNullable<OwnerReport["broker"]>, "avatarUrl"> & { avatar_path: string | null }) | null;
    agency: (Omit<NonNullable<OwnerReport["agency"]>, "logoUrl"> & { logo_path: string | null }) | null;
  };
  const raw = data as Raw;
  const { cover, ...property } = raw.property;

  let coverUrl: string | null = null;
  if (cover) {
    const { data: signed } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(cover, 7 * 24 * 3600);
    coverUrl = signed?.signedUrl ?? null;
  }

  return {
    ...raw,
    property: {
      ...property,
      price: num(property.price),
      asking_price: num(property.asking_price),
      area: num(property.area),
      coverUrl,
    },
    totals: {
      viewings: Number(raw.totals.viewings),
      inquiries: Number(raw.totals.inquiries),
      shared: Number(raw.totals.shared),
      opened: Number(raw.totals.opened),
      offers: Number(raw.totals.offers),
      best_offer: num(raw.totals.best_offer),
    },
    offers: raw.offers.map((o) => ({ ...o, amount: Number(o.amount) })),
    in_progress: raw.in_progress.map((s) => ({ ...s, count: Number(s.count) })),
    prices: raw.prices.map((p) => ({ ...p, old: num(p.old), new: num(p.new) })),
    market: toMarketFacts(raw.market),
    broker: raw.broker ? { ...raw.broker, avatarUrl: avatarUrl(raw.broker.avatar_path) } : null,
    agency: raw.agency ? { ...raw.agency, logoUrl: logoUrl(raw.agency.logo_path) } : null,
  };
});

/** Count an opening (called from the page itself, so link previews don't count). */
export async function markReportViewed(token: string) {
  if (!UUID.test(token)) return;
  await anonymous().rpc("mark_report_viewed", { report_token: token });
}
