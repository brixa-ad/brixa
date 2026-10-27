import type Anthropic from "@anthropic-ai/sdk";
import { DAILY_LIMIT, brixClient } from "@/lib/brix/model";
import { getI18n } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

/** Writing that sells: the most capable model, at low effort (one listing, a few paragraphs). */
const MODEL = "claude-opus-5-5";

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "A listing title for the portals, up to 70 characters" },
    description: { type: "string", description: "The listing's description" },
  },
  required: ["title", "description"],
  additionalProperties: false,
};

const SYSTEM = `You are the copywriter of a Bulgarian real-estate agency: you write listings for imot.bg, homes.bg, OLX and the agency's website that make the right buyer want to see the place.
Write marketing copy from the listing's characteristics: a strong opening line with the biggest selling point, then what each feature means for the life of the buyer (a south exposure → sun all day; a second bedroom → room for a child or a home office; brick building, gas heating → quiet, warm and cheap to run; the floor, the size, the neighbourhood's appeal), the facts a buyer looks for, and a clear call to book a viewing. Short paragraphs, confident and warm, no clichés like "уникална възможност", no exclamation marks in a row, no emojis.
Use only the characteristics given and the broker's notes; never invent a view, a renovation, a distance or a feature. Never write the exact address, the block or apartment number, the cadastral number, a name or a phone.`;

/**
 * Brix writes a listing's description (and a title) from its characteristics, as marketing —
 * the broker reads it, changes what they like and saves it with the listing.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "signed_out" }, { status: 401 });
  const anthropic = brixClient();
  if (!anthropic) return Response.json({ error: "not_configured" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { facts?: unknown; neighborhoodId?: unknown; draft?: unknown } | null;
  const facts = typeof body?.facts === "string" ? body.facts.slice(0, 3000) : "";
  if (!facts.trim()) return Response.json({ error: "bad_request" }, { status: 400 });
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("brix_take_turn", { daily_limit: DAILY_LIMIT });
  if (!allowed) return Response.json({ error: "limit" }, { status: 429 });
  const { lang } = await getI18n();

  // the neighbourhood by name
  const uuid = /^[0-9a-f-]{36}$/i;
  const { data: hood } =
    typeof body?.neighborhoodId === "string" && uuid.test(body.neighborhoodId)
      ? await supabase.from("geo_neighborhoods").select("name").eq("id", body.neighborhoodId).maybeSingle()
      : { data: null };
  const draft = typeof body?.draft === "string" ? body.draft.trim().slice(0, 3000) : "";

  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                `Write the listing in ${lang === "bg" ? "Bulgarian" : "English"}, 120–220 words.`,
                `The property:\n${facts}${hood?.name ? `\nNeighbourhood: ${hood.name}` : ""}`,
                draft ? `The broker's own notes (keep every fact from them):\n${draft}` : "",
              ]
                .filter(Boolean)
                .join("\n\n"),
            },
          ],
        },
      ],
    });
    if (response.stop_reason === "refusal") return Response.json({ error: "failed" }, { status: 502 });
    const text = response.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    const out = JSON.parse(text) as { title?: unknown; description?: unknown };
    return Response.json({
      title: typeof out.title === "string" ? out.title.trim().slice(0, 120) : "",
      description: typeof out.description === "string" ? out.description.trim() : "",
    });
  } catch (error) {
    console.error("Brix's description failed:", error instanceof Error ? error.message : error);
    return Response.json({ error: "failed" }, { status: 502 });
  }
}
