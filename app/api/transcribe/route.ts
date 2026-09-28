import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

/** Two minutes of speech is about 1 MB; the host takes at most ~4.5 MB per request. */
const MAX_BYTES = 4 * 1024 * 1024;
const PROMPT: Record<string, string> = {
  bg: "Бележка на брокер на недвижими имоти: обаждане, оглед, среща, клиент, купувач, продавач, наем, капаро, предварителен договор, нотариус, квартал, апартамент, двустаен, тристаен, цена, евро.",
  en: "A real-estate broker's note: call, viewing, meeting, client, buyer, seller, rent, deposit, preliminary contract, notary, neighborhood, apartment, price, euro.",
};

/**
 * Speech → text for phones whose browser has no dictation of its own (the iPhone home-screen app):
 * the page records the note and sends it here. Only for signed-in people.
 */
export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "not_configured" }, { status: 503 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return Response.json({ error: "unauthorized" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof File) || audio.size === 0) return Response.json({ error: "no_audio" }, { status: 400 });
  if (audio.size > MAX_BYTES) return Response.json({ error: "too_long" }, { status: 413 });
  const lang = form?.get("lang") === "en" ? "en" : "bg";

  async function transcribe(model: string) {
    const body = new FormData();
    body.append("file", audio as File, (audio as File).name || "note.m4a");
    body.append("model", model);
    body.append("language", lang);
    body.append("prompt", PROMPT[lang]);
    return fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body,
    });
  }

  let response = await transcribe(process.env.TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe");
  // an account without the newer model still has Whisper
  if (response.status === 404 || response.status === 400) response = await transcribe("whisper-1");
  if (!response.ok) {
    console.error("Transcription failed:", response.status, (await response.text()).slice(0, 300));
    return Response.json({ error: "failed" }, { status: 502 });
  }
  const result = (await response.json()) as { text?: string };
  return Response.json({ text: (result.text ?? "").trim() });
}
