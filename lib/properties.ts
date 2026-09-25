import "server-only";
import { cache } from "react";
import { signPhotoUrls } from "./photos-server";
import { createClient } from "./supabase/server";
import type { Feature, Photo } from "./types";

type NameRow = { name: string; name_en: string | null };
type PersonRow = { full_name: string | null; email: string };
type BrokerRow = PersonRow & { avatar_path: string | null };

export type PropertyDetail = {
  id: string;
  organization_id: string;
  category_id: string;
  subtype_id: string;
  operation_type: string;
  status: string;
  title: string;
  region_id: string | null;
  settlement_id: string | null;
  neighborhood_id: string | null;
  address: string | null;
  area: number | null;
  rooms: number | null;
  bedrooms: number | null;
  floor: number | null;
  total_floors: number | null;
  construction_type: string | null;
  condition: string | null;
  exposure: string | null;
  furnishing: string | null;
  heating: string | null;
  asking_price: number | null;
  current_price: number | null;
  currency: string;
  exclusive_contract: boolean;
  description: string | null;
  responsible_broker_id: string | null;
  created_at: string;
  updated_at: string;
  category: (NameRow & { code: string }) | null;
  subtype: NameRow | null;
  region: { name: string } | null;
  settlement: { name: string; settlement_type: string } | null;
  neighborhood: { name: string } | null;
  broker: BrokerRow | null;
  features: Feature[];
  priceHistory: {
    id: string;
    old_price: number | null;
    new_price: number | null;
    currency: string;
    changed_at: string;
    changed_by: PersonRow | null;
  }[];
  photos: Photo[];
};

const toNumber = (value: unknown) => (value === null || value === undefined ? null : Number(value));

/** Cached per request — the page and its metadata share one query. */
export const getProperty = cache(async (id: string): Promise<PropertyDetail | null> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("properties")
    .select(
      `*,
      category:property_categories(code, name, name_en),
      subtype:property_subtypes(name, name_en),
      region:geo_regions(name),
      settlement:geo_settlements(name, settlement_type),
      neighborhood:geo_neighborhoods(name),
      broker:profiles!properties_responsible_broker_id_fkey(full_name, email, avatar_path),
      feature_values:property_feature_values(feature:property_features(id, code, name, name_en)),
      price_history:property_price_history(id, old_price, new_price, currency, changed_at, changed_by:profiles(full_name, email)),
      photos:property_photos(id, storage_path, position)`
    )
    .eq("id", id)
    .order("changed_at", { referencedTable: "property_price_history", ascending: false })
    .order("position", { referencedTable: "property_photos" })
    .maybeSingle();

  if (error) {
    // Invalid UUIDs land here too — treat as not found.
    console.error("Loading property failed:", error.message);
    return null;
  }
  if (!data) return null;

  const photos = (data.photos ?? []) as { id: string; storage_path: string; position: number }[];
  const urls = await signPhotoUrls(
    supabase,
    photos.map((photo) => photo.storage_path)
  );

  const { feature_values, price_history, ...rest } = data;

  return {
    ...rest,
    area: toNumber(rest.area),
    asking_price: toNumber(rest.asking_price),
    current_price: toNumber(rest.current_price),
    features: ((feature_values ?? []) as { feature: Feature | null }[])
      .map((row) => row.feature)
      .filter((feature): feature is Feature => Boolean(feature)),
    priceHistory: ((price_history ?? []) as PropertyDetail["priceHistory"]).map((row) => ({
      ...row,
      old_price: toNumber(row.old_price),
      new_price: toNumber(row.new_price),
    })),
    photos: photos.map((photo) => ({ ...photo, url: urls.get(photo.storage_path) ?? null })),
  } as PropertyDetail;
});
