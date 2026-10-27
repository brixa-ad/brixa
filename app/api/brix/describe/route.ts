import type Anthropic from "@anthropic-ai/sdk";
import { DAILY_LIMIT, brixClient } from "@/lib/brix/model";
import { getI18n } from "@/lib/i18n/server";
import { PHOTO_BUCKET } from "@/lib/photos";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

/** Writing for buyers well: the most capable model, at low effort (one listing, a few paragraphs). */
const MODEL = "claude-opus-5-5";
const MAX_PHOTOS = 4;
const MAX_BASE64 = 600_000;

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "A listing title for the portals, up to 70 characters" },
    description: { type: "string", description: "The listing's description" },
  },
  required: ["title", "description"],
  additionalProperties: false,
};

const SYSTEM = `You write property listings for a Bulgarian real-estate agency — for imot.bg, homes.bg, OLX and the agency's website.
Write like the best agents in the country: warm, concrete and honest, short paragraphs, the strongest point first (light, view, location, layout, condition), then the details a buyer asks about (rooms, floor, building, heating, furnishing, what's near), and a short invitation to a viewing at the end. No exclamation marks in a row, no clichés like "уникална възможност", no emojis.
Use only the facts given and what the photos clearly show; never invent a view, a renovation, a distance or a feature. Never write the exact address, the block or apartment number, the cadastral number, a name or a phone.`;

/**
 * Brix writes a listing's description (and a title) from its details and photos —
 * the broker reads it, changes what they like and saves it with the listing.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "signed_out" }, { status: 401 });
  const anthropic = brixClient();
  if (!anthropic) return Response.json({ error: "not_configured" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { facts?: unknown; neighborhoodId?: unknown; propertyId?: unknown; images?: unknown; draft?: unknown } | null;
  const facts = typeof body?.facts === "string" ? body.facts.slice(0, 3000) : "";
  if (!facts.trim()) return Response.json({ error: "bad_request" }, { status: 400 });
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("brix_take_turn", { daily_limit: DAILY_LIMIT });
  if (!allowed) return Response.json({ error: "limit" }, { status: 429 });
  const { lang } = await getI18n();

  // the neighbourhood by name; the photos sent along (a new listing) or its saved ones
  const uuid = /^[0-9a-f-]{36}$/i;
  const [{ data: hood }, saved] = await Promise.all([
    typeof body?.neighborhoodId === "string" && uuid.test(body.neighborhoodId)
      ? supabase.from("geo_neighborhoods").select("name").eq("id", body.neighborhoodId).maybeSingle()
      : Promise.resolve({ data: null }),
    typeof body?.propertyId === "string" && uuid.test(body.propertyId)
      ? supabase.from("property_photos").select("storage_path").eq("property_id", body.propertyId).order("position").limit(MAX_PHOTOS)
      : Promise.resolve({ data: null }),
  ]);
  const images: Anthropic.ImageBlockParam[] = [];
  for (const image of (Array.isArray(body?.images) ? body.images : []).slice(0, MAX_PHOTOS)) {
    if (typeof image === "string" && image.length < MAX_BASE64 && /^[A-Za-z0-9+/=]+$/.test(image)) {
      images.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } });
    }
  }
  if (images.length === 0 && saved.data?.length) {
    const { data: links } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(saved.data.map((p) => p.storage_path), 600);
    for (const link of links ?? []) if (link.signedUrl) images.push({ type: "image", source: { type: "url", url: link.signedUrl } });
  }
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
            ...images,
            {
              type: "text",
              text: [
                `Write the listing in ${lang === "bg" ? "Bulgarian" : "English"}, 120–220 words.`,
                `The property:\n${facts}${hood?.name ? `\nNeighbourhood: ${hood.name}` : ""}`,
                draft ? `The broker's own notes (keep every fact from them):\n${draft}` : "",
                images.length ? `${images.length} photos of it are above.` : "No photos yet.",
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
