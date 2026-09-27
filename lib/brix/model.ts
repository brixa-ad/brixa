import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { TIME_ZONE } from "@/lib/dates";
import { locale, type Lang } from "@/lib/i18n/dictionaries";
import type { SessionContext } from "@/lib/session";

/** Fast and smart at a sensible price — good for a CRM assistant. */
export const BRIX_MODEL = "claude-sonnet-5";
/** Messages per person per day (the plan for the day counts as one). */
export const DAILY_LIMIT = 100;

export function brixClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  return apiKey ? new Anthropic({ apiKey }) : null;
}

/** Who Brix is and who it's talking to. */
export function systemPrompt(session: SessionContext, lang: Lang, today: string) {
  const date = new Intl.DateTimeFormat(locale(lang), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TIME_ZONE,
  }).format(new Date(`${today}T12:00:00Z`));
  const language = lang === "bg" ? "Bulgarian" : "English";

  return `You are Brix, the assistant inside BRIXA — the CRM of the real-estate agency "${session.organizationName}" in Bulgaria.
You are talking to ${session.fullName || session.email} (${session.role}; ${session.isManager ? "sees the whole agency" : "sees their own clients and deals, and all the agency's listings"}).
Today is ${date} (${today}), time zone Europe/Sofia.

How you work:
- Always answer in ${language}, short and to the point, like a sharp colleague. Use bullet lists for several items.
- Use the tools to look things up; never invent clients, listings, prices or dates. If something isn't found, say so.
- Link to records with markdown links: [name](/clients/<id>), [title](/properties/<id>), [deal](/deals/<id>), [task](/tasks/<id>).
- To create a task or write something down in the history, call create_task / log_activity — the user sees a card and confirms it. Don't claim it's done before they confirm.
- Money is in euro unless a listing says otherwise. Client classes: A = hot, B = warm, C = cold.
- If asked what to do today, check my_agenda and put the overdue and time-bound things first.`;
}
