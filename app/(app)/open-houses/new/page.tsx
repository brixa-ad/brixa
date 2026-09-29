import type { Metadata } from "next";
import { OpenHouseForm } from "@/components/openhouse/OpenHouseForm";
import { PageHeader } from "@/components/PageHeader";
import { addDays, sofiaToday } from "@/lib/dates";
import { getI18n } from "@/lib/i18n/server";
import { getMembers } from "@/lib/lookups";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.openHouses.new };
}

/** The first Saturday with at least four days to prepare. */
function nextSaturday(today: string) {
  let day = addDays(today, 4);
  while (new Date(`${day}T12:00:00Z`).getUTCDay() !== 6) day = addDays(day, 1);
  return day;
}

export default async function NewOpenHousePage({ searchParams }: PageProps<"/open-houses/new">) {
  const { property } = await searchParams;
  const session = (await getSession())!;
  const supabase = await createClient();
  const [{ t }, { data: listings }, members] = await Promise.all([
    getI18n(),
    supabase
      .from("properties")
      .select("id, title")
      .eq("organization_id", session.organizationId)
      .in("status", ["active", "reserved"])
      .in("operation_type", ["sale", "rent"])
      .order("updated_at", { ascending: false })
      .limit(500),
    session.isManager ? getMembers(supabase, session.organizationId) : Promise.resolve([]),
  ]);

  const options = (listings ?? []) as { id: string; title: string }[];
  const preselected = typeof property === "string" && options.some((p) => p.id === property) ? property : "";

  return (
    <>
      <PageHeader backHref="/open-houses" backLabel={t.openHouses.title} title={t.openHouses.new} />
      <div className="max-w-2xl">
        <OpenHouseForm
          initial={{ propertyId: preselected, day: nextSaturday(sofiaToday()), from: "11:00", to: "13:00", hostId: session.userId, note: "" }}
          listings={options}
          members={members.map((m) => ({ id: m.profile_id, name: m.full_name || m.email }))}
        />
      </div>
    </>
  );
}
