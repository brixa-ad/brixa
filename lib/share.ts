import "server-only";
import { createClient } from "@supabase/supabase-js";
import { cache } from "react";
import { logoUrl } from "./agency";
import { avatarUrl } from "./avatar";
import { PHOTO_BUCKET } from "./photos";
import type { Tap } from "./signals";
import { parseEstimate, type RentEstimate } from "./yield";
import { toStars, type Stars } from "./rating";

export type SharedListing = {
  property: {
    id: string;
    title: string;
    operation: string;
    status: string;
    price: number | null;
    currency: string;
    area: number | null;
    rooms: number | null;
    bedrooms: number | null;
    floor: number | null;
    total_floors: number | null;
    construction: string | null;
    condition: string | null;
    furnishing: string | null;
    heating: string | null;
    exposures: string[];
    description: string | null;
    subtype: { name: string; name_en: string | null } | null;
    settlement: string | null;
    neighborhood: string | null;
    features: { name: string; name_en: string | null }[];
    /** for sale: the broker's rent and BRIXA's estimate */
    expected_rent: number | null;
    rent_estimate: RentEstimate | null;
    /** the stars against the market — only 4 or 5 ever come */
    stars: Stars | null;
  };
  photos: string[];
  broker: { name: string; email: string; phone: string | null; job_title: string | null; avatarUrl: string | null } | null;
  agency: { name: string; phone: string | null; email: string | null; website: string | null; logoUrl: string | null } | null;
};

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The stars a client may see: 4 or 5. */
export function goodStars(rating: { stars?: unknown } | null | undefined): Stars | null {
  const stars = toStars(rating?.stars);
  return stars !== null && stars >= 4 ? stars : null;
}

/** Anyone's view: no session — the link's token is the only key. */
export function anonymous() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** A shared listing's public page data (null: unknown or stopped link). Cached per request. */
export const getSharedListing = cache(async (token: string): Promise<SharedListing | null> => {
  if (!UUID.test(token)) return null;
  const supabase = anonymous();
  const { data, error } = await supabase.rpc("shared_property", { share_token: token });
  if (error || !data) return null;

  const raw = data as {
    property: Omit<SharedListing["property"], "rent_estimate" | "stars"> & { photos: string[]; rent_estimate: unknown; rating?: { stars?: unknown } | null };
    broker: { name: string; email: string; phone: string | null; job_title: string | null; avatar_path: string | null } | null;
    agency: { name: string; phone: string | null; email: string | null; website: string | null; logo_path: string | null } | null;
  };
  const { photos: paths, ...property } = raw.property;

  // The photos stay private — these links work for a week.
  let photos: string[] = [];
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 7 * 24 * 3600);
    photos = (signed ?? []).map((s) => s.signedUrl).filter((url): url is string => Boolean(url));
  }

  return {
    property: {
      ...property,
      price: property.price === null ? null : Number(property.price),
      area: property.area === null ? null : Number(property.area),
      exposures: property.exposures ?? [],
      features: property.features ?? [],
      expected_rent: property.expected_rent === null || property.expected_rent === undefined ? null : Number(property.expected_rent),
      rent_estimate: parseEstimate(property.rent_estimate),
      stars: goodStars(raw.property.rating),
    },
    photos,
    broker: raw.broker ? { ...raw.broker, avatarUrl: avatarUrl(raw.broker.avatar_path) } : null,
    agency: raw.agency ? { ...raw.agency, logoUrl: logoUrl(raw.agency.logo_path) } : null,
  };
});

/**
 * Count an opening (called from the page itself, so link previews don't count). Returns the
 * opening's id — the page adds its time to it when it's left.
 */
export async function markShareViewed(token: string): Promise<string | null> {
  if (!UUID.test(token)) return null;
  const { data } = await anonymous().rpc("record_share_event", { share_token: token, event: "open" });
  return typeof data === "string" ? data : null;
}

/** A tap on call / Viber / WhatsApp / e-mail on the listing's page. */
export async function recordShareTap(token: string, tap: Tap) {
  await anonymous().rpc("record_share_event", { share_token: token, event: tap });
}

/** How long the page was looked at and how many photos were seen. */
export async function recordShareTime(token: string, eventId: string, seconds: number, photos: number) {
  await anonymous().rpc("share_event_time", { share_token: token, event_id: eventId, seen_seconds: seconds, seen_photos: photos });
}
