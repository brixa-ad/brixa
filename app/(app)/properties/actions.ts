"use server";

import { composeAddress } from "@/lib/address";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { closedAddress, validateClosedDeal, type ClosedDealInput } from "@/lib/closed-deal-validation";
import { toEuro } from "@/lib/commission";
import { sofiaToday } from "@/lib/dates";
import { CLOSED_CONDITIONS, CONSTRUCTION_TYPES, isOneOf, STATUSES } from "@/lib/options";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import {
  hasBuildingFields,
  validateProperty,
  type ErrorCode,
  type FieldErrors,
  type PropertyInput,
} from "@/lib/validation";

export type SaveResult =
  | { ok: true; id: string }
  | { ok: false; errors?: FieldErrors; message?: ErrorCode };

import { originalPathOf } from "@/lib/photos";

const PHOTO_BUCKET = "property-photos";
// Matches nothing — lets us run lookups unconditionally when a field is empty.
const NO_ID = "00000000-0000-0000-0000-000000000000";

/** Validate against the rules + database, and build the row to write. */
async function prepare(input: PropertyInput, propertyId: string | null = null) {
  const session = await getSession();
  if (!session) return { ok: false as const, message: "noOrg" as const };

  const supabase = await createClient();

  const [subtypeRes, settlementRes, neighborhoodRes, allowedFeaturesRes, brokerRes, ownerRes, currentRes] =
    await Promise.all([
      supabase
        .from("property_subtypes")
        .select("id, category_id, property_categories(code)")
        .eq("id", input.subtypeId || NO_ID)
        .maybeSingle(),
      supabase
        .from("geo_settlements")
        .select("id, region_id")
        .eq("id", input.settlementId || NO_ID)
        .maybeSingle(),
      input.neighborhoodId
        ? supabase
            .from("geo_neighborhoods")
            .select("id, settlement_id")
            .eq("id", input.neighborhoodId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("property_subtype_features")
        .select("feature_id")
        .eq("subtype_id", input.subtypeId || NO_ID),
      input.brokerId
        ? supabase
            .from("organization_members")
            .select("profile_id")
            .eq("organization_id", session.organizationId)
            .eq("profile_id", input.brokerId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      // RLS: only clients this user can see come back.
      input.ownerClientId
        ? supabase
            .from("clients")
            .select("id")
            .eq("organization_id", session.organizationId)
            .eq("id", input.ownerClientId)
            .not("responsible_broker_id", "is", null)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      propertyId
        ? supabase.from("properties").select("owner_client_id").eq("id", propertyId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const subtype = subtypeRes.data;
  const categoryCode = (subtype?.property_categories as unknown as { code: string } | null)?.code;

  const errors = validateProperty(input, categoryCode);

  if (input.subtypeId && (!subtype || subtype.category_id !== input.categoryId)) {
    errors.subtypeId = "invalid";
  }
  if (input.settlementId && !settlementRes.data) errors.settlementId = "invalid";
  if (
    input.neighborhoodId &&
    neighborhoodRes.data?.settlement_id !== input.settlementId
  ) {
    errors.neighborhoodId = "invalid";
  }
  if (input.brokerId && !brokerRes.data) errors.brokerId = "invalid";
  // An owner the user can't see (e.g. set by a manager) may stay as it is, but can't be newly picked.
  const ownerUnchanged = input.ownerClientId !== null && currentRes.data?.owner_client_id === input.ownerClientId;
  if (input.ownerClientId && !ownerRes.data && !ownerUnchanged) errors.ownerClientId = "invalid";
  // Brokers can only keep properties on their own name; managers assign freely.
  if (!session.isManager && input.brokerId && input.brokerId !== session.userId) {
    errors.brokerId = "invalid";
  }

  if (Object.keys(errors).length > 0) return { ok: false as const, errors };

  const allowedFeatures = new Set((allowedFeaturesRes.data ?? []).map((row) => row.feature_id));
  const featureIds = [...new Set(input.featureIds)].filter((id) => allowedFeatures.has(id));
  const building = hasBuildingFields(categoryCode);

  const row = {
    category_id: input.categoryId,
    subtype_id: input.subtypeId,
    operation_type: input.operationType,
    title: input.title.trim(),
    region_id: settlementRes.data!.region_id,
    settlement_id: input.settlementId,
    neighborhood_id: input.neighborhoodId,
    street: input.street.trim() || null,
    street_no: input.streetNo.trim() || null,
    block: building ? input.block.trim() || null : null,
    entrance: building ? input.entrance.trim() || null : null,
    apartment: building ? input.apartment.trim() || null : null,
    cadastral_id: input.cadastralId.trim() || null,
    address:
      composeAddress(
        building ? input : { ...input, block: "", entrance: "", apartment: "" },
        building ? input.floor : null
      ) || null,
    area: input.area,
    rooms: building ? input.rooms : null,
    bedrooms: building ? input.bedrooms : null,
    floor: building ? input.floor : null,
    total_floors: building ? input.totalFloors : null,
    condition: building ? input.condition : null,
    construction_type: building ? input.constructionType : null,
    exposures: building ? [...new Set(input.exposures)] : [],
    furnishing: building ? input.furnishing : null,
    heating: building ? input.heating : null,
    current_price: input.price,
    currency: input.currency,
    commission_rate: input.operationType === "sale" || input.operationType === "rent" ? input.commissionRate : null,
    responsible_broker_id: session.isManager ? (input.brokerId ?? session.userId) : session.userId,
    owner_client_id: input.ownerClientId,
    exclusive_contract: input.exclusiveContract,
    off_market: input.offMarket,
    description: input.description.trim() || null,
  };

  return { ok: true as const, session, supabase, row, featureIds };
}

export async function createProperty(input: PropertyInput): Promise<SaveResult> {
  const prepared = await prepare(input);
  if (!prepared.ok) return prepared;

  const { session, supabase, row, featureIds } = prepared;

  const { data: property, error } = await supabase
    .from("properties")
    .insert({
      ...row,
      organization_id: session.organizationId,
      asking_price: row.current_price,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error || !property) {
    console.error("Create property failed:", error);
    return { ok: false, message: "generic" };
  }

  if (featureIds.length > 0) {
    const { error: featuresError } = await supabase
      .from("property_feature_values")
      .insert(featureIds.map((feature_id) => ({ property_id: property.id, feature_id })));

    if (featuresError) console.error("Saving features failed:", featuresError);
  }

  revalidatePath("/properties");
  return { ok: true, id: property.id };
}

export async function updateProperty(id: string, input: PropertyInput): Promise<SaveResult> {
  const prepared = await prepare(input, id);
  if (!prepared.ok) return prepared;

  const { supabase, row, featureIds } = prepared;

  const { data: updated, error } = await supabase
    .from("properties")
    .update(row)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    console.error("Update property failed:", error);
    return { ok: false, message: error ? "generic" : "notFound" };
  }

  const { error: clearError } = await supabase
    .from("property_feature_values")
    .delete()
    .eq("property_id", id);

  if (!clearError && featureIds.length > 0) {
    await supabase
      .from("property_feature_values")
      .insert(featureIds.map((feature_id) => ({ property_id: id, feature_id })));
  }

  revalidatePath("/properties");
  revalidatePath(`/properties/${id}`);
  return { ok: true, id };
}

export async function setPropertyStatus(id: string, status: string) {
  if (!isOneOf(STATUSES, status)) return { ok: false };

  const supabase = await createClient();
  // RLS skips rows the user may not edit without an error — check a row actually changed.
  const { data, error } = await supabase.from("properties").update({ status }).eq("id", id).select("id");

  revalidatePath("/properties");
  revalidatePath(`/properties/${id}`);
  return { ok: !error && Boolean(data?.length) };
}

/** The monthly rent (€) the broker expects for a listing for sale — null: BRIXA's estimate again. */
export async function setExpectedRent(id: string, rent: number | null) {
  if (rent !== null && !(Number.isFinite(rent) && rent > 0 && rent < 1_000_000)) return { ok: false };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("properties")
    .update({ expected_rent: rent === null ? null : Math.round(rent) })
    .eq("id", id)
    .select("id");

  revalidatePath(`/properties/${id}`);
  return { ok: !error && Boolean(data?.length) };
}

export type LeaveOutcome = "ours" | "elsewhere" | "withdrawn";

/**
 * "Delete" asks what happened: sold (or rented) by us, by another agency, or taken off the market.
 * The listing goes to "Sold" / "Withdrawn" with the price and the day it went for, when told;
 * sold by us, for sale, it is written in the register of closed deals too.
 */
export async function leaveMarket(id: string, outcome: LeaveOutcome, price: number | null, soldOn: string | null) {
  const session = await getSession();
  if (!session?.isManager) return { ok: false };
  if (!isOneOf(["ours", "elsewhere", "withdrawn"] as const, outcome)) return { ok: false };
  const sold = outcome !== "withdrawn";
  if (price !== null && !(Number.isFinite(price) && price > 0 && price <= 100_000_000)) return { ok: false };
  const today = sofiaToday();
  if (soldOn !== null && !(/^\d{4}-\d{2}-\d{2}$/.test(soldOn) && !Number.isNaN(Date.parse(soldOn)) && soldOn <= today)) return { ok: false };

  const supabase = await createClient();
  const { data: property } = await supabase
    .from("properties")
    .select(
      "id, operation_type, currency, subtype_id, settlement_id, neighborhood_id, street, street_no, block, entrance, apartment, floor, area, construction_type, condition, responsible_broker_id, broker:profiles!properties_responsible_broker_id_fkey(full_name, email)"
    )
    .eq("id", id)
    .maybeSingle();
  if (!property) return { ok: false };

  const rent = property.operation_type === "rent";
  const status = outcome === "ours" ? (rent ? "rented" : "sold") : outcome === "elsewhere" ? "sold_elsewhere" : "withdrawn";
  const { data: changed, error } = await supabase
    .from("properties")
    .update({ status, sold_price: sold ? price : null, sold_on: sold ? (soldOn ?? today) : null })
    .eq("id", id)
    .select("id");
  if (error || !changed?.length) {
    console.error("Taking a listing off the market failed:", error ?? "no row changed");
    return { ok: false };
  }

  // Sold by us: the register of closed deals learns the real price (once per listing).
  const euro = price === null ? null : toEuro(price, property.currency);
  if (outcome === "ours" && property.operation_type === "sale" && euro !== null && Number(property.area) > 0) {
    const { count } = await supabase.from("closed_deals").select("id", { count: "exact", head: true }).eq("property_id", id);
    if (!count) {
      const broker = property.broker as unknown as { full_name: string | null; email: string } | null;
      const input: ClosedDealInput = {
        reportedOn: soldOn ?? today,
        subtypeId: property.subtype_id,
        settlementId: property.settlement_id,
        neighborhoodId: property.neighborhood_id,
        street: property.street ?? "",
        streetNo: property.street_no ?? "",
        block: property.block ?? "",
        entrance: property.entrance ?? "",
        floor: property.floor === null ? "" : String(property.floor),
        apartment: property.apartment ?? "",
        side: "sale",
        conditions: isOneOf(CLOSED_CONDITIONS, property.condition) ? [property.condition] : [],
        construction: isOneOf(CONSTRUCTION_TYPES, property.construction_type) ? property.construction_type : null,
        parking: false,
        area: Number(property.area),
        price: Math.round(euro),
        parkingPrice: null,
        brokerName: (broker?.full_name || broker?.email || session.fullName || "").slice(0, 120),
        colleagueName: "",
        colleagueAgency: "",
        doubleSided: false,
        propertyId: id,
        note: "",
      };
      if (Object.keys(validateClosedDeal(input)).length === 0) {
        const { error: registerError } = await supabase.from("closed_deals").insert({
          organization_id: session.organizationId,
          created_by: session.userId,
          reported_on: input.reportedOn,
          subtype_id: input.subtypeId,
          settlement_id: input.settlementId,
          neighborhood_id: input.settlementId ? input.neighborhoodId : null,
          street: input.street || null,
          street_no: input.streetNo || null,
          block: input.block || null,
          entrance: input.entrance || null,
          floor: input.floor || null,
          apartment: input.apartment || null,
          address: closedAddress(input) || null,
          side: input.side,
          conditions: input.conditions,
          construction: input.construction,
          area: input.area,
          price: input.price,
          broker_name: input.brokerName,
          property_id: id,
        });
        if (registerError) console.error("Writing the sale in the register failed:", registerError.message);
        else {
          revalidatePath("/closed-deals");
          revalidatePath("/market");
        }
      }
    }
  }

  revalidatePath("/properties");
  revalidatePath(`/properties/${id}`);
  // to the tab it went to: the broker's own, or the whole agency's by status
  const tab = outcome === "ours" ? "sold" : "withdrawn";
  redirect(property.responsible_broker_id === session.userId ? `/properties?view=${tab}` : `/properties?status=${status}`);
}

export async function deleteProperty(id: string) {
  const session = await getSession();
  if (!session?.isManager) return { ok: false };

  const supabase = await createClient();

  const { data: photos } = await supabase
    .from("property_photos")
    .select("storage_path")
    .eq("property_id", id);

  // .select() tells us whether a row was really deleted (RLS silently skips rows otherwise),
  // so photos are only removed once the property is gone.
  const { data: deleted, error } = await supabase
    .from("properties")
    .delete()
    .eq("id", id)
    .select("id");
  if (error || !deleted?.length) {
    console.error("Delete property failed:", error ?? "no row deleted");
    return { ok: false };
  }

  if (photos && photos.length > 0) {
    await supabase.storage.from(PHOTO_BUCKET).remove(photos.flatMap((photo) => [photo.storage_path, originalPathOf(photo.storage_path)]));
  }

  revalidatePath("/properties");
  redirect("/properties");
}
