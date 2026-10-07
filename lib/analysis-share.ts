import "server-only";
import { cache } from "react";
import { logoUrl } from "./agency";
import { avatarUrl } from "./avatar";
import { parseAnalysis, type Analysis } from "./analysis";
import { PHOTO_BUCKET } from "./photos";
import { UUID, anonymous } from "./share";
import { parseEstimate, type RentEstimate } from "./yield";

export type SharedAnalysis = {
  audience: "owner" | "buyer";
  analysis: Analysis;
  property: {
    id: string;
    title: string;
    operation: string;
    price: number | null;
    currency: string;
    area: number | null;
    rooms: number | null;
    floor: number | null;
    totalFloors: number | null;
    subtype: { name: string; name_en: string | null } | null;
    settlement: string | null;
    neighborhood: string | null;
    photoUrl: string | null;
    expectedRent: number | null;
    rentEstimate: RentEstimate | null;
  };
  broker: { name: string; email: string; phone: string | null; avatarUrl: string | null } | null;
  agency: { name: string; phone: string | null; email: string | null; website: string | null; logoUrl: string | null };
};

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** A sent analysis by its link ("unavailable": stopped, or a buyer's whose price is no longer a good one). */
export const getSharedAnalysis = cache(async (token: string): Promise<SharedAnalysis | "unavailable" | null> => {
  if (!UUID.test(token)) return null;
  const supabase = anonymous();
  const { data, error } = await supabase.rpc("shared_analysis", { share_token: token });
  if (error || !data) return null;
  const raw = data as {
    unavailable?: boolean;
    audience: "owner" | "buyer";
    analysis: unknown;
    property: Record<string, unknown>;
    broker: { name: string; email: string; phone: string | null; avatar_path: string | null } | null;
    agency: { name: string; phone: string | null; email: string | null; website: string | null; logo_path: string | null };
  };
  if (raw.unavailable) return "unavailable";
  const analysis = parseAnalysis(raw.analysis);
  if (!analysis?.rating) return "unavailable";
  const p = raw.property;

  // the photo stays private — a link that works for a week
  let photoUrl: string | null = null;
  if (typeof p.photo === "string") {
    const { data: signed } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(p.photo, 7 * 24 * 3600);
    photoUrl = signed?.signedUrl ?? null;
  }

  return {
    audience: raw.audience === "buyer" ? "buyer" : "owner",
    analysis,
    property: {
      id: String(p.id),
      title: String(p.title ?? ""),
      operation: String(p.operation ?? "sale"),
      price: num(p.price),
      currency: String(p.currency ?? "EUR"),
      area: num(p.area),
      rooms: num(p.rooms),
      floor: num(p.floor),
      totalFloors: num(p.total_floors),
      subtype: (p.subtype as { name: string; name_en: string | null } | null) ?? null,
      settlement: (p.settlement as string | null) ?? null,
      neighborhood: (p.neighborhood as string | null) ?? null,
      photoUrl,
      expectedRent: num(p.expected_rent),
      rentEstimate: parseEstimate(p.rent_estimate),
    },
    broker: raw.broker ? { ...raw.broker, avatarUrl: avatarUrl(raw.broker.avatar_path) } : null,
    agency: { ...raw.agency, logoUrl: logoUrl(raw.agency.logo_path) },
  };
});

/** The link was opened (by someone not signed in to BRIXA). */
export async function markAnalysisViewed(token: string) {
  if (!UUID.test(token)) return;
  await anonymous().rpc("record_analysis_view", { share_token: token });
}
