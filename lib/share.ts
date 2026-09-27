import "server-only";
import { createClient } from "@supabase/supabase-js";
import { cache } from "react";
import { logoUrl } from "./agency";
import { avatarUrl } from "./avatar";
import { PHOTO_BUCKET } from "./photos";

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
  };
  photos: string[];
  broker: { name: string; email: string; phone: string | null; job_title: string | null; avatarUrl: string | null } | null;
  agency: { name: string; phone: string | null; email: string | null; website: string | null; logoUrl: string | null } | null;
};

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    property: SharedListing["property"] & { photos: string[] };
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
    },
    photos,
    broker: raw.broker ? { ...raw.broker, avatarUrl: avatarUrl(raw.broker.avatar_path) } : null,
    agency: raw.agency ? { ...raw.agency, logoUrl: logoUrl(raw.agency.logo_path) } : null,
  };
});

/** Count an opening (called from the page itself, so link previews don't count). */
export async function markShareViewed(token: string) {
  if (!UUID.test(token)) return;
  await anonymous().rpc("mark_share_viewed", { share_token: token });
}
