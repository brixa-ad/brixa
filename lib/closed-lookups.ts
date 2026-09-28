import "server-only";
import type { ClosedListing } from "@/components/closed/ClosedDealForm";
import { getClientFormLookups } from "./clients";
import { createClient } from "./supabase/server";

/** What the register's form needs: kinds, towns, and the agency's listings to fill in from. */
export async function getClosedDealLookups(organizationId: string) {
  const supabase = await createClient();
  const [base, { data: listings }] = await Promise.all([
    getClientFormLookups(organizationId),
    supabase
      .from("properties")
      .select("id, title, subtype_id, settlement_id, neighborhood_id, street, street_no, block, entrance, floor, apartment, area, construction_type")
      .eq("organization_id", organizationId)
      .in("operation_type", ["sale", "rent"])
      .order("updated_at", { ascending: false })
      .limit(1000),
  ]);
  return {
    categories: base.categories,
    subtypes: base.subtypes,
    settlements: base.settlements,
    listings: ((listings ?? []) as ClosedListing[]).map((l) => ({ ...l, area: l.area === null ? null : Number(l.area) })),
  };
}
