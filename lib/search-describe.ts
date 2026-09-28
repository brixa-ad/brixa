import "server-only";
import type { OfferInput, SearchInput } from "./client-validation";
import { formatNumber, formatPrice, settlementLabel } from "./format";
import { localName, type Dictionary, type Lang } from "./i18n/dictionaries";
import { createClient } from "./supabase/server";

function range(min: number | null, max: number | null, t: Dictionary, format: (n: number) => string) {
  if (min === null && max === null) return null;
  if (min !== null && max !== null) return `${format(min)} – ${format(max)}`;
  return min !== null ? `${t.clients.from} ${format(min)}` : `${t.clients.to} ${format(max!)}`;
}

/** Turn a saved search into short readable lines. */
export async function describeSearch(search: SearchInput, t: Dictionary, lang: Lang) {
  const supabase = await createClient();
  const [subtypes, settlements, hoods, features] = await Promise.all([
    search.subtypeIds.length
      ? supabase.from("property_subtypes").select("id, name, name_en").in("id", search.subtypeIds)
      : Promise.resolve({ data: [] }),
    search.settlementIds.length
      ? supabase.from("geo_settlements").select("id, name, settlement_type").in("id", search.settlementIds)
      : Promise.resolve({ data: [] }),
    search.neighborhoodIds.length
      ? supabase.from("geo_neighborhoods").select("id, name, settlement_id").in("id", search.neighborhoodIds)
      : Promise.resolve({ data: [] }),
    search.featureIds.length
      ? supabase.from("property_features").select("id, name, name_en").in("id", search.featureIds)
      : Promise.resolve({ data: [] }),
  ]);

  const locations = (settlements.data ?? []).map((s) => {
    const inTown = (hoods.data ?? []).filter((h) => h.settlement_id === s.id).map((h) => h.name);
    return inTown.length ? `${settlementLabel(s)} (${inTown.join(", ")})` : settlementLabel(s);
  });
  const money = (n: number) => formatPrice(n, search.currency, lang)!;
  const plain = (n: number) => formatNumber(n, lang)!;

  return [
    [t.clients.searchOperation, t.options.searchOperation[search.operation]],
    [t.clients.searchSubtypes, (subtypes.data ?? []).map((s) => localName(s, lang)).join(", ") || t.clients.anyValue],
    [t.clients.searchLocations, locations.join(", ") || t.clients.anyValue],
    [t.clients.searchBudget, range(search.budgetMin, search.budgetMax, t, money) ?? t.clients.anyValue],
    [t.clients.searchArea, range(search.areaMin, search.areaMax, t, plain) ?? t.clients.anyValue],
    [t.clients.searchRooms, range(search.roomsMin, search.roomsMax, t, plain) ?? t.clients.anyValue],
    ...(search.featureIds.length
      ? [[t.clients.searchFeatures, (features.data ?? []).map((f) => localName(f, lang)).join(", ")]]
      : []),
  ] as [string, string][];
}

/** What a seller / landlord has, as short readable lines (only what's filled in). */
export async function describeOffer(offer: OfferInput, t: Dictionary, lang: Lang) {
  const supabase = await createClient();
  const [subtype, town, hood] = await Promise.all([
    offer.subtypeId
      ? supabase.from("property_subtypes").select("name, name_en").eq("id", offer.subtypeId).maybeSingle()
      : Promise.resolve({ data: null }),
    offer.settlementId
      ? supabase.from("geo_settlements").select("name, settlement_type").eq("id", offer.settlementId).maybeSingle()
      : Promise.resolve({ data: null }),
    offer.neighborhoodId
      ? supabase.from("geo_neighborhoods").select("name").eq("id", offer.neighborhoodId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const place = [hood.data?.name, town.data ? settlementLabel(town.data) : null].filter(Boolean).join(", ");
  const lines: [string, string][] = [[t.clients.offerOperation, t.options.offerOperation[offer.operation]]];
  if (subtype.data) lines.push([t.clients.offerSubtype, localName(subtype.data, lang)]);
  if (place) lines.push([t.clients.offerTown, place]);
  if (offer.area !== null) lines.push([t.clients.offerArea, formatNumber(offer.area, lang, 2)!]);
  if (offer.rooms !== null) lines.push([t.clients.offerRooms, String(offer.rooms)]);
  if (offer.price !== null) lines.push([t.clients.offerPrice, formatPrice(offer.price, offer.currency, lang)!]);
  return lines;
}
