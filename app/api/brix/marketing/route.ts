import type Anthropic from "@anthropic-ai/sdk";
import { getAnalysis } from "@/lib/analysis";
import { DAILY_LIMIT, brixClient } from "@/lib/brix/model";
import { daysBetween, sofiaDay, sofiaToday } from "@/lib/dates";
import { localName } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getProperty } from "@/lib/properties";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 120;

/** Copy that sells and a plan that sells: the most capable model, at low effort. */
const MODEL = "claude-opus-5-5";

const POSTS = {
  type: "object",
  properties: {
    facebook: { type: "string", description: "A Facebook post: a hook line, 3–5 short lines on what the place gives, the price, a call to message or call. 2–4 fitting emojis at most." },
    instagram: { type: "string", description: "An Instagram caption: a hook, short lines, the price, a call to send a DM — without the hashtags." },
    hashtags: { type: "array", items: { type: "string" }, description: "12–18 hashtags, Bulgarian and English, the town, the neighbourhood, the kind (no #)" },
    colleagues: { type: "string", description: "For brokers' Viber / WhatsApp groups: short and factual — the kind, the place, the area, the floor, the price, the strongest 2–3 features, 'партньорство — пишете ми'." },
  },
  required: ["facebook", "instagram", "hashtags", "colleagues"],
  additionalProperties: false,
};

const PLAN = {
  type: "object",
  properties: {
    summary: { type: "string", description: "Two or three sentences: where the listing stands and the plan's idea" },
    price: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["keep", "lower", "raise"] },
        price_eur: { type: "number", description: "The price to move to (0 when keeping it)" },
        after_days: { type: "integer", description: "In how many days from today, if there's no serious interest by then" },
        why: { type: "string" },
      },
      required: ["action", "price_eur", "after_days", "why"],
      additionalProperties: false,
    },
    steps: {
      type: "array",
      description: "6–10 steps over the next 6 weeks, in order",
      items: {
        type: "object",
        properties: {
          day: { type: "integer", description: "Days from today (0 = today)" },
          channel: { type: "string", description: "Where: imot.bg / homes.bg / OLX / Facebook / Instagram / colleagues / the buyers in BRIXA / open house / the owner…" },
          action: { type: "string", description: "What to do, as a task title (imperative, short)" },
          why: { type: "string" },
          kind: { type: "string", enum: ["call", "email", "message", "meeting", "viewing", "other"] },
        },
        required: ["day", "channel", "action", "why", "kind"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "price", "steps"],
  additionalProperties: false,
};

/**
 * Brix for a listing's marketing: the posts (Facebook, Instagram with hashtags, the colleagues'
 * groups) or a selling plan for the next weeks — from the listing and how it stands on the market.
 */
export async function POST(request: Request) {
  try {
    return await answer(request);
  } catch (error) {
    // whatever went wrong, the broker sees why (never a key: the API's messages don't carry one)
    const reason = error instanceof Error ? error.message.slice(0, 200) : "unknown";
    console.error("Brix's marketing failed:", reason);
    return Response.json({ error: "failed", reason }, { status: 502 });
  }
}

async function answer(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "signed_out" }, { status: 401 });
  const anthropic = brixClient();
  if (!anthropic) return Response.json({ error: "not_configured" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { propertyId?: unknown; kind?: unknown } | null;
  const id = typeof body?.propertyId === "string" ? body.propertyId : "";
  const kind = body?.kind === "plan" ? "plan" : "posts";
  const [{ t, lang }, property, analysis] = await Promise.all([getI18n(), getProperty(id), getAnalysis(id)]);
  if (!property) return Response.json({ error: "bad_request" }, { status: 400 });

  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("brix_take_turn", { daily_limit: DAILY_LIMIT });
  if (!allowed) return Response.json({ error: "limit" }, { status: 429 });

  const today = sofiaToday();
  const option = <T extends Record<string, string>>(labels: T, code: string | null) => (code ? labels[code as keyof T] : null);
  const line = (label: string, value: unknown) => (value === null || value === undefined || value === "" ? null : `${label}: ${value}`);
  const facts = [
    line("Сделка", property.operation_type === "rent" ? "наем" : "продажба"),
    line("Вид", property.subtype ? localName(property.subtype, lang) : property.category ? localName(property.category, lang) : null),
    line("Място", [property.settlement ? `${property.settlement.settlement_type} ${property.settlement.name}` : null, property.neighborhood?.name].filter(Boolean).join(", ")),
    line("Площ", property.area ? `${property.area} м²` : null),
    line("Стаи", property.rooms),
    line("Спални", property.bedrooms),
    line("Етаж", property.floor !== null ? `${property.floor}${property.total_floors ? ` от ${property.total_floors}` : ""}` : null),
    line("Строителство", option(t.options.construction, property.construction_type)),
    line("Състояние", option(t.options.condition, property.condition)),
    line("Обзавеждане", option(t.options.furnishing, property.furnishing)),
    line("Отопление", option(t.options.heating, property.heating)),
    line("Изложение", (property.exposures ?? []).map((e) => option(t.options.exposure, e)).filter(Boolean).join(", ")),
    line("Екстри", (property.features ?? []).map((f) => localName(f, lang)).join(", ")),
    line("Цена", property.current_price ? `${property.current_price} ${property.currency}` : null),
    line("Ексклузивен договор", property.exclusive_contract ? "да" : null),
    line("Описание", property.description?.slice(0, 1500)),
  ]
    .filter(Boolean)
    .join("\n");

  const market =
    kind === "plan"
      ? [
          `Обявен преди ${daysBetween(sofiaDay(property.created_at), today)} дни.`,
          property.priceHistory?.length ? `Смени на цената: ${property.priceHistory.map((p) => `${p.old_price} → ${p.new_price} (${sofiaDay(p.changed_at)})`).join("; ")}` : "Цената не е сменяна.",
          analysis?.rating
            ? `Спрямо пазара: ${Math.round(analysis.rating.diff * 100)}% (${analysis.rating.stars}★), пазарна цена ~${Math.round(analysis.rating.benchSqm)} €/м², препоръчителна ${analysis.rating.estimate ? `${analysis.rating.estimate.low}–${analysis.rating.estimate.high} €` : "—"}.`
            : "Няма достатъчно данни за сравнение с пазара.",
          analysis?.facts.sold.avg_days ? `Подобни имоти наблизо се продават средно за ${analysis.facts.sold.avg_days} дни.` : "",
          analysis?.facts.discount !== null && analysis?.facts.discount !== undefined ? `Обичайно пазарене: ${Math.round(analysis.facts.discount * 100)}%.` : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "";

  const prompt =
    kind === "posts"
      ? `Write the social posts for this listing, in ${lang === "bg" ? "Bulgarian" : "English"}. Use only these facts; never invent a view, a renovation or a distance. Never write the exact address, a name or a phone.\n\n${facts}`
      : `Make a selling plan for this listing for the next 6 weeks, in ${lang === "bg" ? "Bulgarian" : "English"}: where and when to publish (the portals, Facebook, Instagram, the colleagues' groups, the agency's buyers), when an open house makes sense, when to call the owner about the price — and the price advice (keep, lower or raise, by how much and after how many days without serious interest), grounded in how it stands on the market. Practical, for a Bulgarian broker.\n\n${facts}\n\nThe market:\n${market}`;

  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 12000,
      output_config: { effort: "low", format: { type: "json_schema", schema: kind === "posts" ? POSTS : PLAN } },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system:
        "You are Brix, the marketing assistant of a Bulgarian real-estate agency: a sharp copywriter and a practical sales strategist. Warm, concrete, honest; no clichés like 'уникална възможност'.",
      messages: [{ role: "user", content: prompt }],
    });
    if (response.stop_reason === "refusal") return Response.json({ error: "failed", reason: "refusal" }, { status: 502 });
    if (response.stop_reason === "max_tokens") return Response.json({ error: "failed", reason: "too long" }, { status: 502 });
    const text = response.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    return Response.json({ kind, result: JSON.parse(text), today });
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 200) : "unknown";
    console.error("Brix's marketing failed:", reason);
    return Response.json({ error: "failed", reason }, { status: 502 });
  }
}
