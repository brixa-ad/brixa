import "server-only";
import { fmt, type Dictionary } from "./i18n/dictionaries";
import { nameDayOn } from "./namedays";
import { firstName } from "./programs";
import type { SessionContext } from "./session";
import { createClient } from "./supabase/server";

export type Greeting = {
  clientId: string;
  name: string;
  phone: string | null;
  email: string | null;
  reason: "nameday" | "birthday";
  feast: string | null;
  text: string;
};

const isLeap = (year: number) => new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1;

/** My clients with a name day or a birthday today, each with a ready greeting. */
export async function getGreetings(session: SessionContext, today: string, t: Dictionary): Promise<Greeting[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, full_name, phone, email, birth_day, birth_month")
    .eq("organization_id", session.organizationId)
    .eq("responsible_broker_id", session.userId)
    .limit(5000);
  if (error) {
    console.error("Loading the greetings failed:", error.message);
    return [];
  }

  const [year, month, day] = today.split("-").map(Number);
  const broker = session.fullName || session.email;
  const out: Greeting[] = [];
  for (const c of data ?? []) {
    const first = firstName(c.full_name);
    const vars = { name: first, broker };
    // birthdays come as tasks every morning (with their greeting); a name day on the birthday isn't repeated
    const birthday =
      c.birth_month === month && (c.birth_day === day || (c.birth_day === 29 && month === 2 && day === 28 && !isLeap(year)));
    if (birthday) continue;
    const feast = nameDayOn(first, today);
    if (feast) {
      out.push({ clientId: c.id, name: c.full_name, phone: c.phone, email: c.email, reason: "nameday", feast, text: fmt(t.programs.nameDayText, vars) });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "bg"));
}
