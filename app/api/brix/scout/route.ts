import type Anthropic from "@anthropic-ai/sdk";
import { brixClient } from "@/lib/brix/model";
import { anonymous } from "@/lib/share";

export const maxDuration = 300;

/** Reading the portals needs care: the most capable model, at medium effort. */
const MODEL = "claude-opus-5-5";
const MAX_CONTINUATIONS = 4;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The Bulgarian property portals (subdomains included). */
const PORTALS = ["imot.bg", "homes.bg", "alo.bg", "olx.bg", "imoti.net", "address.bg", "bazar.bg", "luximmo.bg", "suprimmo.bg"];

type SearchJob = {
  kind: "search";
  operation: "sale" | "rent";
  town: string;
  neighborhoods: string[];
  kinds: string[];
  price_max: number | null;
  private_only: boolean;
  known: string[];
};
type TrackJob = { kind: "track"; listings: { id: string; url: string; price_eur: number | null }[] };

const LISTING = {
  type: "object",
  properties: {
    url: { type: "string", description: "The listing's own page, exactly as found (not a search page)" },
    title: { type: "string", description: "Short, in Bulgarian, e.g. 'Двустаен, 64 м², Левски'" },
    price_eur: { type: "number", description: "Asking price in euro (BGN ÷ 1.95583); 0 when not shown" },
    area: { type: "number", description: "Area in m²; 0 when not shown" },
    place: { type: "string", description: "Neighbourhood (or town) as the listing says" },
    private: { type: "string", enum: ["yes", "no", "unknown"], description: "Sold by a private person (частно лице / собственик), not an agency" },
  },
  required: ["url", "title", "price_eur", "area", "place", "private"],
  additionalProperties: false,
};

const SEARCH_TOOL = {
  name: "report_listings",
  description: "Report the new listings you found. Call it exactly once, at the end. An empty list is fine.",
  strict: true,
  input_schema: {
    type: "object" as const,
    properties: { listings: { type: "array", items: LISTING } },
    required: ["listings"],
    additionalProperties: false,
  },
};

const TRACK_TOOL = {
  name: "report_checks",
  description: "Report what each listing page shows now. Call it exactly once, at the end, with one entry per listing given.",
  strict: true,
  input_schema: {
    type: "object" as const,
    properties: {
      listings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            status: {
              type: "string",
              enum: ["active", "gone", "unknown"],
              description:
                "active: the listing is up; gone: removed, sold, expired (изтекла), invalid (невалидна / не съществува), or the page leads to a search or the home page instead; unknown: the page couldn't be read",
            },
            price_eur: { type: "number", description: "The asking price now, in euro; 0 when not shown" },
            title: { type: "string" },
            area: { type: "number", description: "m²; 0 when not shown" },
            place: { type: "string" },
            private: { type: "string", enum: ["yes", "no", "unknown"] },
          },
          required: ["id", "status", "price_eur", "title", "area", "place", "private"],
          additionalProperties: false,
        },
      },
    },
    required: ["listings"],
    additionalProperties: false,
  },
};

function searchPrompt(job: SearchJob) {
  return [
    `Find listings put on the Bulgarian property portals in the last 2–3 days (newest first) for ${job.operation === "rent" ? "RENT" : "SALE"} in ${job.town}.`,
    job.neighborhoods.length ? `Neighbourhoods: ${job.neighborhoods.join(", ")}.` : "Any neighbourhood.",
    job.kinds.length ? `Kinds of property: ${job.kinds.join(", ")}.` : "Any kind of property.",
    job.price_max ? `Price up to ${job.price_max} € (${job.operation === "rent" ? "a month" : "total"}).` : "",
    job.private_only
      ? "ONLY listings by private persons (частно лице / от собственик / без посредник) — leave out agencies."
      : "Mark which ones a private person sells.",
    "Search several times, in Bulgarian, with different words (e.g. 'продава двустаен Левски Варна', 'двустаен апартамент Варна от собственик', the kind and the neighbourhood on each portal), so as to find as many as possible.",
    "Report only a listing's own page (one property), never a search or category page. Up to 15 — they will each be opened and checked.",
    job.known.length ? `Already known — leave these out:\n${job.known.slice(0, 150).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function trackPrompt(job: TrackJob) {
  return [
    "Open each of these listing pages and say what it shows now: is it still up, and its asking price.",
    ...job.listings.map((l) => `- id ${l.id}: ${l.url}${l.price_eur ? ` (was ${l.price_eur} €)` : ""}`),
  ].join("\n");
}

const num = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};
const privateOf = (value: unknown) => (value === "yes" ? true : value === "no" ? false : null);
const onPortal = (url: string) => {
  try {
    const host = new URL(url).hostname;
    return PORTALS.some((p) => host === p || host.endsWith(`.${p}`));
  } catch {
    return false;
  }
};
const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : null);

/**
 * The database's morning job for one watch (or a handful of followed listings): Brix looks on the
 * portals and the result goes back with the job's token — the token is the proof, no one else has it.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { id?: unknown; token?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const token = typeof body?.token === "string" ? body.token : "";
  if (!UUID.test(id) || !UUID.test(token)) return new Response(null, { status: 400 });

  const anthropic = brixClient();
  if (!anthropic) return new Response(null, { status: 503 });
  const db = anonymous();
  const { data: claimed } = await db.rpc("scout_claim", { target: id, job_token: token });
  const job = claimed as SearchJob | TrackJob | null;
  if (!job) return new Response(null, { status: 404 });

  const search = job.kind === "search";

  /** One task for Brix with its tools; what it reported through `tool` (null: nothing). */
  async function ask(prompt: string, tools: Anthropic.Beta.BetaToolUnion[], tool: typeof SEARCH_TOOL | typeof TRACK_TOOL) {
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: prompt }];
    try {
      for (let step = 0; step <= MAX_CONTINUATIONS; step++) {
        const response = await anthropic!.beta.messages.create({
          model: MODEL,
          max_tokens: 16000,
          output_config: { effort: "medium" },
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system:
            "You are Brix, the market scout of a Bulgarian real-estate agency. You look at the public listings on the property portals and report facts only: never invent a listing, a link or a price. Leave out people's names and phone numbers.",
          tools: [...tools, tool],
          messages,
        });
        if (response.stop_reason === "refusal") return null;
        const use = response.content.find(
          (block): block is Anthropic.Beta.BetaToolUseBlock => block.type === "tool_use" && block.name === tool.name
        );
        if (use) {
          return ((use.input as { listings?: unknown[] })?.listings ?? []).filter(
            (row): row is Record<string, unknown> => typeof row === "object" && row !== null
          );
        }
        if (response.stop_reason !== "pause_turn") return null;
        messages.push({ role: "assistant", content: response.content });
      }
    } catch (error) {
      console.error("Brix's market scout failed:", error instanceof Error ? error.message : error);
    }
    return null;
  }

  const fetchTool = (pages: number): Anthropic.Beta.BetaToolUnion => ({ type: "web_fetch_20260209", name: "web_fetch", max_uses: pages + 2 });
  const checked = (r: Record<string, unknown>) => ({
    id: text(r.id, 40),
    status: r.status === "active" || r.status === "gone" ? r.status : "unknown",
    price_eur: num(r.price_eur),
    title: text(r.title, 200),
    area: num(r.area),
    place: text(r.place, 120),
    private: privateOf(r.private),
  });

  let payload: { listings: unknown[] };
  if (search) {
    const found = ((await ask(searchPrompt(job), [{ type: "web_search_20260209", name: "web_search", max_uses: 8, allowed_domains: PORTALS }], SEARCH_TOOL)) ?? [])
      .map((r) => ({
        url: text(r.url, 600) ?? "",
        title: text(r.title, 200),
        price_eur: num(r.price_eur),
        area: num(r.area),
        place: text(r.place, 120),
        private: privateOf(r.private),
      }))
      .filter((r) => /^https?:\/\//i.test(r.url) && onPortal(r.url) && !job.known.includes(r.url))
      .slice(0, 12);

    // a search engine still shows listings taken down days ago: each one is opened, and only the live ones stay
    const checks = found.length
      ? ((await ask(trackPrompt({ kind: "track", listings: found.map((r, i) => ({ id: String(i), url: r.url, price_eur: r.price_eur })) }), [fetchTool(found.length)], TRACK_TOOL)) ?? []).map(checked)
      : [];
    const byIndex = new Map(checks.map((c) => [c.id, c]));
    payload = {
      listings: found
        .map((r, i) => {
          const page = byIndex.get(String(i));
          if (page?.status === "gone") return null;
          // what the page itself says wins over the search's snippet
          return page?.status === "active"
            ? { ...r, price_eur: page.price_eur ?? r.price_eur, area: page.area ?? r.area, place: page.place ?? r.place, title: page.title ?? r.title, private: page.private ?? r.private }
            : r;
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .filter((r) => !job.private_only || r.private !== false),
    };
  } else {
    payload = { listings: ((await ask(trackPrompt(job), [fetchTool(job.listings.length)], TRACK_TOOL)) ?? []).map(checked) };
  }

  // reported even when nothing was found: the job is done for today
  const { error } = await db.rpc("scout_report", { target: id, job_token: token, payload });
  if (error) console.error("Reporting the market scout failed:", error.message);
  return Response.json({ ok: !error, found: payload.listings.length });
}
