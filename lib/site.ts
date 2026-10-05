import "server-only";
import { cache } from "react";
import { logoUrl } from "./agency";
import { avatarUrl } from "./avatar";
import { PHOTO_BUCKET } from "./photos";
import { anonymous, goodStars, type SharedListing } from "./share";
import { parseEstimate } from "./yield";

export const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

type Named = { name: string; name_en: string | null };

export type SiteListing = {
  id: string;
  title: string;
  operation: "sale" | "rent";
  status: string;
  price: number | null;
  currency: string;
  area: number | null;
  rooms: number | null;
  subtype: Named | null;
  settlement: string | null;
  neighborhood: string | null;
  photoUrl: string | null;
};

export type Site = {
  agency: {
    name: string;
    phone: string | null;
    email: string | null;
    website: string | null;
    address: string | null;
    logoUrl: string | null;
    headline: string | null;
    about: string | null;
  };
  listings: SiteListing[];
  team: { name: string; phone: string | null; email: string; job_title: string | null; avatarUrl: string | null }[];
};

/** The public website of an agency (null: no such address, or it's turned off). */
export const getSite = cache(async (slug: string): Promise<Site | null> => {
  if (!SLUG.test(slug.toLowerCase())) return null;
  const supabase = anonymous();
  const { data, error } = await supabase.rpc("site_public", { site: slug.toLowerCase() });
  if (error || !data) return null;
  const raw = data as {
    agency: Site["agency"] & { logo_path: string | null };
    listings: (Omit<SiteListing, "photoUrl"> & { photo: string | null })[];
    team: (Omit<Site["team"][number], "avatarUrl"> & { avatar_path: string | null })[];
  };

  // the cover photos, for a week (the site's listings' photos are open while the site is on)
  const paths = raw.listings.map((l) => l.photo).filter((p): p is string => Boolean(p));
  const urls = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 7 * 24 * 3600);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  const { logo_path, ...agency } = raw.agency;
  return {
    agency: { ...agency, logoUrl: logoUrl(logo_path) },
    listings: raw.listings.map(({ photo, ...l }) => ({
      ...l,
      price: l.price === null ? null : Number(l.price),
      area: l.area === null ? null : Number(l.area),
      photoUrl: photo ? (urls.get(photo) ?? null) : null,
    })),
    team: raw.team.map(({ avatar_path, ...m }) => ({ ...m, avatarUrl: avatarUrl(avatar_path) })),
  };
});

/** One listing of a website, shaped like a shared listing (so the same page parts show it). */
export const getSiteListing = cache(async (slug: string, id: string): Promise<SharedListing | null> => {
  if (!SLUG.test(slug.toLowerCase()) || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = anonymous();
  const { data, error } = await supabase.rpc("site_listing", { site: slug.toLowerCase(), target_property: id });
  if (error || !data) return null;
  const raw = data as {
    property: Omit<SharedListing["property"], "rent_estimate" | "stars"> & { photos: string[]; rent_estimate: unknown; rating?: { stars?: unknown } | null };
    broker: { name: string; email: string; phone: string | null; job_title: string | null; avatar_path: string | null } | null;
    agency: { name: string; phone: string | null; email: string | null; website: string | null; logo_path: string | null };
  };
  const { photos: paths, ...property } = raw.property;
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
    agency: { ...raw.agency, logoUrl: logoUrl(raw.agency.logo_path) },
  };
});
