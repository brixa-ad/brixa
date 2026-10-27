import type Anthropic from "@anthropic-ai/sdk";
import { brixClient } from "@/lib/brix/model";
import { getI18n } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";

export const maxDuration = 60;

/** A photo editor's eye: the most capable model, at low effort (one look, a few numbers). */
const MODEL = "claude-opus-5-5";
/** A 640px JPEG is ~60 KB; anything much bigger isn't a thumbnail. */
const MAX_BASE64 = 600_000;

const knob = (what: string) => ({ type: "number", description: `${what}, from -1 to 1; 0 = leave it to the automatic correction` });

const SCHEMA = {
  type: "object",
  properties: {
    exposure: knob("Brighter (+) or darker (-) than the automatic correction"),
    contrast: knob("More (+) or less (-) contrast"),
    saturation: knob("Richer (+) or calmer (-) colours"),
    warmth: knob("Warmer (+) or cooler (-)"),
    shadows: knob("Open the dark areas more (+) or less (-)"),
    highlights: knob("Hold back bright windows and lamps more (+) or less (-)"),
    sharpen: knob("Crisper (+) or softer (-)"),
    tip: {
      type: "string",
      description: "Only if the photo itself has a problem editing can't fix (blurry, tilted, cluttered, a person or a car plate in it, too dark to save): one short sentence to the broker, in the given language. Otherwise empty.",
    },
  },
  required: ["exposure", "contrast", "saturation", "warmth", "shadows", "highlights", "sharpen", "tip"],
  additionalProperties: false,
};

const SYSTEM = `You are the photo editor of a luxury real-estate magazine. You see a listing photo (already small). An automatic correction will set levels, white balance and a bright, airy exposure; you choose how much more or less of each adjustment this photo needs for a clean, bright, true-to-life magazine look — light walls, clear windows, natural wood and stone, no colour cast, nothing overdone. Most photos need small numbers (-0.3 … 0.3). Never suggest changing what is in the picture.`;

/** Brix looks at one listing photo and says how to edit it — the editing itself happens in the browser. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "signed_out" }, { status: 401 });
  const anthropic = brixClient();
  if (!anthropic) return Response.json({ error: "not_configured" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { image?: unknown } | null;
  const image = typeof body?.image === "string" ? body.image : "";
  if (!image || image.length > MAX_BASE64 || !/^[A-Za-z0-9+/=]+$/.test(image)) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const { lang } = await getI18n();

  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
            { type: "text", text: `The broker's language: ${lang === "bg" ? "Bulgarian" : "English"}.` },
          ],
        },
      ],
    });
    if (response.stop_reason === "refusal") return Response.json({ error: "failed" }, { status: 502 });
    const text = response.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    const look = JSON.parse(text) as Record<string, unknown>;
    return Response.json({ look, tip: typeof look.tip === "string" ? look.tip.slice(0, 200) : "" });
  } catch (error) {
    console.error("Brix's photo look failed:", error instanceof Error ? error.message : error);
    return Response.json({ error: "failed" }, { status: 502 });
  }
}
