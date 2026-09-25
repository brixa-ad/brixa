"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isOneOf, STATUSES } from "@/lib/options";
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

const PHOTO_BUCKET = "property-photos";
// Matches nothing — lets us run lookups unconditionally when a field is empty.
const NO_ID = "00000000-0000-0000-0000-000000000000";

/** Validate against the rules + database, and build the row to write. */
async function prepare(input: PropertyInput) {
  const session = await getSession();
  if (!session) return { ok: false as const, message: "noOrg" as const };

  const supabase = await createClient();

  const [subtypeRes, settlementRes, neighborhoodRes, allowedFeaturesRes, brokerRes] =
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
    address: input.address.trim() || null,
    area: input.area,
    rooms: building ? input.rooms : null,
    bedrooms: building ? input.bedrooms : null,
    floor: building ? input.floor : null,
    total_floors: building ? input.totalFloors : null,
    condition: building ? input.condition : null,
    construction_type: building ? input.constructionType : null,
    exposure: building ? input.exposure : null,
    furnishing: building ? input.furnishing : null,
    heating: building ? input.heating : null,
    current_price: input.price,
    currency: input.currency,
    responsible_broker_id: input.brokerId ?? session.userId,
    exclusive_contract: input.exclusiveContract,
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
  const prepared = await prepare(input);
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
  const { error } = await supabase.from("properties").update({ status }).eq("id", id);

  revalidatePath("/properties");
  revalidatePath(`/properties/${id}`);
  return { ok: !error };
}

export async function deleteProperty(id: string) {
  const supabase = await createClient();

  const { data: photos } = await supabase
    .from("property_photos")
    .select("storage_path")
    .eq("property_id", id);

  const { error } = await supabase.from("properties").delete().eq("id", id);
  if (error) {
    console.error("Delete property failed:", error);
    return { ok: false };
  }

  if (photos && photos.length > 0) {
    await supabase.storage.from(PHOTO_BUCKET).remove(photos.map((photo) => photo.storage_path));
  }

  revalidatePath("/properties");
  redirect("/properties");
}
