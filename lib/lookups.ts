import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommissionDefaults } from "./commission";
import { leads, type Office, type Team } from "./hierarchy";
import { getSession } from "./session";
import { createClient } from "./supabase/server";
import type { Feature, FormLookups, Member, Role, Settlement } from "./types";

const PAGE_SIZE = 1000;

/** Supabase caps responses at 1000 rows — page through larger tables (e.g. a full EKATTE import). */
export async function fetchAllSettlements(supabase: SupabaseClient) {
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
    .select("profile_id, role, office_id, team_id, created_at, profiles(full_name, email, avatar_path, job_title, phone)")
    .eq("organization_id", organizationId)
    .order("created_at");

  if (error) throw error;

  return (data ?? []).map((row) => {
    const profile = row.profiles as unknown as Omit<Member, "profile_id" | "role" | "office_id" | "team_id"> | null;
    return {
      profile_id: row.profile_id,
      role: row.role as Role,
      office_id: (row.office_id as string | null) ?? null,
      team_id: (row.team_id as string | null) ?? null,
      created_at: row.created_at as string,
      full_name: profile?.full_name ?? null,
      email: profile?.email ?? "",
      avatar_path: profile?.avatar_path ?? null,
      job_title: profile?.job_title ?? null,
      phone: profile?.phone ?? null,
    };
  });
}

/** The agency's offices and teams (everyone in it reads them). */
export async function getHierarchy(supabase: SupabaseClient, organizationId: string): Promise<{ offices: Office[]; teams: Team[] }> {
  const [{ data: offices }, { data: teams }] = await Promise.all([
    supabase.from("offices").select("id, name, city, address, phone").eq("organization_id", organizationId).order("created_at"),
    supabase.from("teams").select("id, office_id, name, manager_id").eq("organization_id", organizationId).order("name"),
  ]);
  return { offices: offices ?? [], teams: teams ?? [] };
}

/**
 * Whom one gives work to and filters by: a leader themself and the people they lead (the owner
 * everyone). A broker gets the whole agency — their pickers are locked to themself anyway.
 */
export async function getMyPeople(supabase: SupabaseClient) {
  const session = await getSession();
  const organizationId = session?.organizationId ?? "";
  const members = session ? await getMembers(supabase, organizationId) : [];
  if (!session || session.isOwner || !session.isManager) return members;
  const { teams } = await getHierarchy(supabase, organizationId);
  return members.filter((m) => m.profile_id === session.userId || leads(session, m, teams));
}

/** The agency's standard commission: % for sales, months of rent for leases. */
export const getCommissionDefaults = cache(async (organizationId: string): Promise<CommissionDefaults> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("commission_sale_percent, commission_rent_months")
    .eq("id", organizationId)
    .maybeSingle();
  return {
    salePercent: Number(data?.commission_sale_percent ?? 3),
    rentMonths: Number(data?.commission_rent_months ?? 1),
  };
});

export async function getFormLookups(organizationId: string): Promise<FormLookups> {
  const supabase = await createClient();

  const [categories, subtypes, subtypeFeatures, regions, settlements, members, ownerClients, commissionDefaults] = await Promise.all([
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
    getMyPeople(supabase),
    supabase
      .from("clients")
      .select("id, full_name, phone")
      .eq("organization_id", organizationId)
      .overlaps("types", ["seller", "landlord"])
      .not("responsible_broker_id", "is", null)
      .order("full_name"),
    getCommissionDefaults(organizationId),
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
    members,
    ownerClients: ownerClients.data ?? [],
    commissionDefaults,
  };
}
