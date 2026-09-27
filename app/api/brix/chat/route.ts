import type Anthropic from "@anthropic-ai/sdk";
import { BRIX_MODEL, DAILY_LIMIT, brixClient, systemPrompt } from "@/lib/brix/model";
import { BRIX_TOOLS, runTool, type ProposedAction } from "@/lib/brix/tools";
import { sofiaToday } from "@/lib/dates";
import { getI18n } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const MAX_TURNS = 16;
const MAX_STEPS = 6;

type ChatMessage = { role: "user" | "assistant"; content: string };

/** One message to Brix: it may look things up (several steps), then answers — plus any actions to confirm. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "signed_out" }, { status: 401 });
  const anthropic = brixClient();
  if (!anthropic) return Response.json({ error: "not_configured" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { messages?: unknown } | null;
  const history = (Array.isArray(body?.messages) ? body.messages : [])
    .filter(
      (m): m is ChatMessage =>
        typeof m === "object" && m !== null && (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
    )
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  // The conversation has to start with the user and end with their new message.
  while (history.length && history[0].role !== "user") history.shift();
  if (history.length === 0 || history[history.length - 1].role !== "user") {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("brix_take_turn", { daily_limit: DAILY_LIMIT });
  if (!allowed) return Response.json({ error: "limit" }, { status: 429 });

  const { t, lang } = await getI18n();
  const today = sofiaToday();
  const ctx = { supabase, session, today, t };
  const messages: Anthropic.MessageParam[] = history;
  const actions: ProposedAction[] = [];
  let reply = "";

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const response = await anthropic.messages.create({
        model: BRIX_MODEL,
        max_tokens: 1500,
        system: systemPrompt(session, lang, today),
        tools: BRIX_TOOLS,
        messages,
      });
      messages.push({ role: "assistant", content: response.content });
      const uses = response.content.filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
      reply = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
      if (response.stop_reason !== "tool_use" || uses.length === 0) break;

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const use of uses) {
        const { result, proposal } = await runTool(use.name, (use.input ?? {}) as Record<string, unknown>, ctx);
        if (proposal) actions.push(proposal);
        results.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(result).slice(0, 15000) });
      }
      messages.push({ role: "user", content: results });
    }
  } catch (error) {
    console.error("Brix failed:", error);
    return Response.json({ error: "ai_failed" }, { status: 502 });
  }

  return Response.json({ reply, actions });
}
