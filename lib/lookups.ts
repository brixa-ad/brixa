import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";
import type { Feature, FormLookups, Member, Role, Settlement } from "./types";

const PAGE_SIZE = 1000;

/** Supabase caps responses at 1000 rows — page through larger tables (e.g. a full EKATTE import). */
async function fetchAllSettlements(supabase: SupabaseClient) {
  const rows: Settlement[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("geo_settlements")
      .select("id, region_id, name, settlement_type")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  // Towns first, then villages, alphabetically.
  return rows.sort((a, b) => {
    if (a.settlement_type !== b.settlement_type) return a.settlement_type === "гр." ? -1 : 1;
    return a.name.localeCompare(b.name, "bg");
  });
}

export async function getMembers(supabase: SupabaseClient, organizationId: string) {
  const { data, error } = await supabase
    .from("organization_members")
    .select("profile_id, role, created_at, profiles(full_name, email)")
    .eq("organization_id", organizationId)
    .order("created_at");

  if (error) throw error;

  return (data ?? []).map((row) => {
    const profile = row.profiles as unknown as { full_name: string | null; email: string } | null;
    return {
      profile_id: row.profile_id,
      role: row.role as Role,
      created_at: row.created_at as string,
      full_name: profile?.full_name ?? null,
      email: profile?.email ?? "",
    };
  });
}

export async function getFormLookups(organizationId: string): Promise<FormLookups> {
  const supabase = await createClient();

  const [categories, subtypes, subtypeFeatures, regions, settlements, members] = await Promise.all([
    supabase.from("property_categories").select("id, code, name, name_en").order("sort_order"),
    supabase
      .from("property_subtypes")
      .select("id, category_id, code, name, name_en")
      .order("sort_order"),
    supabase
      .from("property_subtype_features")
      .select("subtype_id, property_features(id, code, name, name_en)"),
    supabase.from("geo_regions").select("id, code, name").order("name"),
    fetchAllSettlements(supabase),
    getMembers(supabase, organizationId),
  ]);

  for (const result of [categories, subtypes, subtypeFeatures, regions]) {
    if (result.error) throw result.error;
  }

  const featuresBySubtype: Record<string, Feature[]> = {};
  for (const row of subtypeFeatures.data ?? []) {
    const feature = row.property_features as unknown as Feature | null;
    if (!feature) continue;
    (featuresBySubtype[row.subtype_id] ??= []).push(feature);
  }
  for (const list of Object.values(featuresBySubtype)) {
    list.sort((a, b) => a.name.localeCompare(b.name, "bg"));
  }

  return {
    categories: categories.data ?? [],
    subtypes: subtypes.data ?? [],
    subtypeFeatures: featuresBySubtype,
    regions: (regions.data ?? []).sort((a, b) => a.name.localeCompare(b.name, "bg")),
    settlements,
    members: members.map(
      (m): Member => ({ profile_id: m.profile_id, role: m.role, full_name: m.full_name, email: m.email })
    ),
  };
}
