import { BRIX_MODEL, DAILY_LIMIT, brixClient, systemPrompt } from "@/lib/brix/model";
import { runTool } from "@/lib/brix/tools";
import { sofiaToday } from "@/lib/dates";
import { getI18n } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";
import { getMyNumbers } from "@/lib/stats";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

/**
 * Brix's plan for the day: written once a day (or again on "refresh") from the user's
 * agenda and numbers, and kept so the home screen shows it straight away.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "signed_out" }, { status: 401 });
  const anthropic = brixClient();
  if (!anthropic) return Response.json({ error: "not_configured" }, { status: 503 });

  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  const supabase = await createClient();
  const today = sofiaToday();

  if (!refresh) {
    const { data: kept } = await supabase
      .from("brix_briefs")
      .select("content")
      .eq("profile_id", session.userId)
      .eq("day", today)
      .maybeSingle();
    if (kept) return Response.json({ content: kept.content });
  }

  const { data: allowed } = await supabase.rpc("brix_take_turn", { daily_limit: DAILY_LIMIT });
  if (!allowed) return Response.json({ error: "limit" }, { status: 429 });

  const { t, lang } = await getI18n();
  const [agenda, numbers] = await Promise.all([
    runTool("my_agenda", { days_ahead: 1 }, { supabase, session, today, t }),
    getMyNumbers(session, today),
  ]);
  const facts = {
    agenda: agenda.result,
    goals_today: { calls: numbers.goals.dailyCalls, viewings: numbers.goals.dailyViewings, listings: numbers.goals.dailyListings },
    done_today: numbers.today,
    commission_this_month: numbers.monthCommission,
    monthly_target: numbers.goals.monthlyTarget,
    monthly_reward: numbers.goals.monthlyBonus,
    open_listings: numbers.activeListings,
    active_buyers: numbers.activeBuyers,
  };

  try {
    const response = await anthropic.messages.create({
      model: BRIX_MODEL,
      max_tokens: 700,
      system: systemPrompt(session, lang, today),
      messages: [
        {
          role: "user",
          content: `Write my plan for today from these facts (JSON below). Up to ~120 words:
a one-line greeting with the day's focus, then 3–6 bullets in the order I should do things (overdue and time-bound first — mention times and names, link clients / deals / tasks), then one short line about progress to my monthly target. No headings. If the day is empty, suggest what would move my numbers most (calling clients, new listings).

${JSON.stringify(facts)}`,
        },
      ],
    });
    const content = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("\n")
      .trim()
      .slice(0, 8000);

    await supabase
      .from("brix_briefs")
      .upsert({ profile_id: session.userId, day: today, content, created_at: new Date().toISOString() });
    return Response.json({ content });
  } catch (error) {
    console.error("Brix brief failed:", error);
    return Response.json({ error: "ai_failed" }, { status: 502 });
  }
}
