import type Anthropic from "@anthropic-ai/sdk";
import { DAILY_LIMIT, brixClient } from "@/lib/brix/model";
import { localName } from "@/lib/i18n/dictionaries";
import { getProperty } from "@/lib/properties";
import { portalOf, type FoundComparable } from "@/lib/rating";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 120;

/** Searching the web and reading portals needs care: the most capable model, at medium effort. */
const MODEL = "claude-opus-5-5";
const MAX_CONTINUATIONS = 3;

/** The Bulgarian property portals (subdomains included). */
const PORTALS = ["imot.bg", "homes.bg", "alo.bg", "olx.bg", "imoti.net", "address.bg", "bulgarianproperties.bg", "luximmo.bg", "suprimmo.bg"];

const REPORT_TOOL = {
  name: "report_comparables",
  description:
    "Report the comparable listings you found. Call it exactly once, at the end, with every good match (up to 8). An empty list is fine when nothing fits.",
  strict: true,
  input_schema: {
    type: "object" as const,
    properties: {
      listings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            url: { type: "string", description: "The listing's own address, exactly as found" },
            title: { type: "string", description: "A short description in Bulgarian, e.g. 'Двустаен, 64 м², тухла'" },
            price_eur: { type: "number", description: "The asking price in euro (BGN ÷ 1.95583)" },
            area_m2: { type: "number", description: "The area in m²" },
            floor: { type: "integer", description: "The floor, or -99 when the listing doesn't say" },
          },
          required: ["url", "title", "price_eur", "area_m2", "floor"],
          additionalProperties: false,
        },
      },
    },
    required: ["listings"],
    additionalProperties: false,
  },
};

const SYSTEM = `You find comparable property listings for a real-estate agency in Bulgaria.
Search the Bulgarian property portals for listings advertised now that are similar to the subject property: the same town and neighbourhood (the neighbouring ones only if there are too few), the same type, an area within about 25%.
Use only listings whose page or search result states both the price and the area. Convert prices in BGN to euro at 1.95583. Leave out the subject property itself and duplicates of one flat posted on several portals.
Never invent a listing, a price or an address: every URL must be one you actually found.
When you are done, call report_comparables once with the best matches (up to 8).`;

/** Brix looks for listings like this one on the property portals; the broker picks which to add. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "signed_out" }, { status: 401 });
  const anthropic = brixClient();
  if (!anthropic) return Response.json({ error: "not_configured" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { propertyId?: unknown } | null;
  const propertyId = typeof body?.propertyId === "string" ? body.propertyId : "";
  const property = propertyId ? await getProperty(propertyId) : null;
  if (!property || (property.operation_type !== "sale" && property.operation_type !== "rent") || !property.settlement) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("brix_take_turn", { daily_limit: DAILY_LIMIT });
  if (!allowed) return Response.json({ error: "limit" }, { status: 429 });

  const subject = [
    `Operation: ${property.operation_type === "rent" ? "for rent (monthly rent)" : "for sale"}`,
    `Type: ${property.subtype ? localName(property.subtype, "bg") : property.category?.name ?? "—"}`,
    `Town: ${property.settlement.settlement_type} ${property.settlement.name}`,
    property.neighborhood ? `Neighbourhood: ${property.neighborhood.name}` : null,
    property.area ? `Area: ${property.area} m²` : null,
    property.rooms ? `Rooms: ${property.rooms}` : null,
    property.floor !== null ? `Floor: ${property.floor}${property.total_floors ? ` of ${property.total_floors}` : ""}` : null,
    property.construction_type ? `Construction: ${property.construction_type}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: `Find listings comparable to this property:\n${subject}` },
  ];

  try {
    for (let step = 0; step <= MAX_CONTINUATIONS; step++) {
      const response = await anthropic.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        output_config: { effort: "medium" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: SYSTEM,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6, allowed_domains: PORTALS }, REPORT_TOOL],
        messages,
      });

      if (response.stop_reason === "refusal") return Response.json({ error: "failed" }, { status: 502 });

      const report = response.content.find(
        (block): block is Anthropic.Beta.BetaToolUseBlock => block.type === "tool_use" && block.name === REPORT_TOOL.name
      );
      if (report) return Response.json({ listings: cleanListings(report.input) });

      // the server paused its search loop: send the turn back and it resumes
      if (response.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: response.content });
        continue;
      }
      return Response.json({ listings: [] });
    }
    return Response.json({ listings: [] });
  } catch (error) {
    console.error("Finding comparables failed:", error instanceof Error ? error.message : error);
    return Response.json({ error: "failed" }, { status: 502 });
  }
}

/** Only real web addresses with a price and an area; one per address. */
function cleanListings(input: unknown): FoundComparable[] {
  const rows = (input as { listings?: unknown })?.listings;
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  const out: FoundComparable[] = [];
  for (const row of rows.slice(0, 8)) {
    const r = row as { url?: unknown; title?: unknown; price_eur?: unknown; area_m2?: unknown; floor?: unknown };
    const url = typeof r.url === "string" ? r.url.trim() : "";
    const priceEur = Number(r.price_eur);
    const area = Number(r.area_m2);
    if (!/^https?:\/\//i.test(url) || url.length > 500 || seen.has(url)) continue;
    if (!(priceEur > 0 && priceEur < 100_000_000) || !(area > 0 && area < 100_000)) continue;
    seen.add(url);
    const floor = Number(r.floor);
    out.push({
      url,
      source: portalOf(url),
      title: typeof r.title === "string" ? r.title.slice(0, 160) : "",
      priceEur: Math.round(priceEur),
      area: Math.round(area * 100) / 100,
      floor: Number.isInteger(floor) && floor >= -5 && floor <= 200 ? floor : null,
    });
  }
  return out;
}
