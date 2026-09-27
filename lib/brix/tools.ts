import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { searchFromRow } from "@/lib/clients";
import { addDays, sofiaDay } from "@/lib/dates";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { findBuyers, findMatches } from "@/lib/matching";
import { ACTIVITY_TYPES, CLIENT_STAGES, TASK_TYPES, isOneOf } from "@/lib/options";
import type { SessionContext } from "@/lib/session";
import { getLeaderboards } from "@/lib/stats";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type ToolContext = { supabase: Supabase; session: SessionContext; today: string; t: Dictionary };

/** Something Brix wants to do — only happens once the user confirms it. */
export type ProposedAction =
  | {
      kind: "task";
      title: string;
      type: (typeof TASK_TYPES)[number];
      dueDate: string;
      dueTime: string | null;
      clientId: string | null;
      clientName: string | null;
      propertyId: string | null;
      propertyTitle: string | null;
      description: string;
    }
  | {
      kind: "activity";
      type: Exclude<(typeof ACTIVITY_TYPES)[number], "task">;
      note: string;
      clientId: string | null;
      clientName: string | null;
      propertyId: string | null;
      propertyTitle: string | null;
    };

const LIMIT = 25;
const clean = (text: unknown, max = 200) => (typeof text === "string" ? text.trim().slice(0, max) : "");
const ilike = (text: string) => text.replace(/[,()%_\\]/g, " ").trim();

export const BRIX_TOOLS: Anthropic.Tool[] = [
  {
    name: "search_clients",
    description:
      "Search the user's clients (and, if asked, the agency's free contacts). Returns id, name, phone, e-mail, types, class (A hot, B warm, C cold), stage and next follow-up deadline.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Part of the name, phone or e-mail" },
        stage: { type: "string", enum: [...CLIENT_STAGES] },
        client_class: { type: "string", enum: ["A", "B", "C"] },
        type: { type: "string", enum: ["buyer", "seller", "tenant", "landlord", "investor"] },
        follow_up_overdue: { type: "boolean", description: "Only clients whose follow-up deadline has passed" },
        free_contacts: { type: "boolean", description: "Search the free contacts (no broker) instead" },
      },
    },
  },
  {
    name: "get_client",
    description: "Everything about one client: details, what they are looking for, recent history, open tasks and deals.",
    input_schema: { type: "object", properties: { client_id: { type: "string" } }, required: ["client_id"] },
  },
  {
    name: "search_properties",
    description: "Search the agency's listings. Prices are as listed (usually EUR).",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Part of the title or address" },
        status: { type: "string", enum: ["active", "reserved", "sold", "rented", "withdrawn", "sold_elsewhere"] },
        operation: { type: "string", enum: ["sale", "rent"] },
        min_price: { type: "number" },
        max_price: { type: "number" },
        min_rooms: { type: "number" },
        settlement: { type: "string", description: "Town / village name" },
        mine_only: { type: "boolean", description: "Only the user's own listings" },
      },
    },
  },
  {
    name: "get_property",
    description: "Everything about one listing: details, extras, commission, deals on it.",
    input_schema: { type: "object", properties: { property_id: { type: "string" } }, required: ["property_id"] },
  },
  {
    name: "properties_for_client",
    description: "The agency's active listings that fit a buyer's / tenant's saved search, best first.",
    input_schema: { type: "object", properties: { client_id: { type: "string" } }, required: ["client_id"] },
  },
  {
    name: "buyers_for_property",
    description: "The user's buyers / tenants whose saved search fits a listing, best first.",
    input_schema: { type: "object", properties: { property_id: { type: "string" } }, required: ["property_id"] },
  },
  {
    name: "my_agenda",
    description:
      "The user's agenda: open tasks (incl. overdue), clients to contact (follow-up) and scheduled deal steps, for today and the next days.",
    input_schema: {
      type: "object",
      properties: { days_ahead: { type: "number", description: "0 = today only (default), up to 14" } },
    },
  },
  {
    name: "list_deals",
    description: "The user's deals (managers: the whole agency) with stage, price and commission.",
    input_schema: {
      type: "object",
      properties: { status: { type: "string", enum: ["open", "won", "lost"] } },
    },
  },
  {
    name: "team_ranking",
    description: "This month's and this year's agency ranking: commission and activity points per broker.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "create_task",
    description:
      "Propose a task for the user (they confirm it with a button). Use ids from earlier results for the client / property.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        type: { type: "string", enum: [...TASK_TYPES] },
        due_date: { type: "string", description: "YYYY-MM-DD" },
        due_time: { type: "string", description: "HH:MM, optional" },
        client_id: { type: "string" },
        property_id: { type: "string" },
        description: { type: "string" },
      },
      required: ["title", "type", "due_date"],
    },
  },
  {
    name: "log_activity",
    description:
      "Propose writing down a call / meeting / viewing / message / e-mail / note in the history (the user confirms it).",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["call", "email", "message", "meeting", "viewing", "note"] },
        note: { type: "string" },
        client_id: { type: "string" },
        property_id: { type: "string" },
      },
      required: ["type"],
    },
    // everything above rarely changes — cache it
    cache_control: { type: "ephemeral" },
  },
];

type Input = Record<string, unknown>;

async function clientName(ctx: ToolContext, id: unknown) {
  if (typeof id !== "string" || !id) return null;
  const { data } = await ctx.supabase.from("clients").select("id, full_name").eq("id", id).not("responsible_broker_id", "is", null).maybeSingle();
  return data;
}
async function propertyTitle(ctx: ToolContext, id: unknown) {
  if (typeof id !== "string" || !id) return null;
  const { data } = await ctx.supabase.from("properties").select("id, title").eq("id", id).maybeSingle();
  return data;
}

/** Run one tool. Reads go through the user's own permissions; writes come back as proposals. */
export async function runTool(
  name: string,
  input: Input,
  ctx: ToolContext
): Promise<{ result: unknown; proposal?: ProposedAction }> {
  const { supabase, session, today } = ctx;
  const org = session.organizationId;

  switch (name) {
    case "search_clients": {
      let q = supabase
        .from("clients")
        .select("id, full_name, phone, email, types, client_class, stage, follow_up_at, broker:profiles!clients_responsible_broker_id_fkey(full_name)")
        .eq("organization_id", org)
        .order("updated_at", { ascending: false })
        .limit(LIMIT);
      q = input.free_contacts ? q.is("responsible_broker_id", null) : q.not("responsible_broker_id", "is", null);
      const text = ilike(clean(input.query, 80));
      if (text) {
        const digits = text.replace(/\D/g, "");
        q = q.or([`full_name.ilike.%${text}%`, `email.ilike.%${text}%`, ...(digits.length >= 3 ? [`phone_normalized.ilike.%${digits}%`] : [])].join(","));
      }
      if (isOneOf(CLIENT_STAGES, input.stage)) q = q.eq("stage", input.stage);
      if (input.client_class === "A" || input.client_class === "B" || input.client_class === "C") q = q.eq("client_class", input.client_class);
      if (typeof input.type === "string") q = q.contains("types", [input.type]);
      if (input.follow_up_overdue) q = q.lte("follow_up_at", new Date().toISOString());
      const { data, error } = await q;
      return { result: error ? { error: error.message } : data };
    }

    case "get_client": {
      const id = clean(input.client_id, 60);
      const [{ data: client }, { data: acts }, { data: tasks }, { data: deals }] = await Promise.all([
        supabase
          .from("clients")
          .select("id, full_name, phone, email, types, client_class, source, stage, notes, follow_up_at, created_at, search:client_searches(*)")
          .eq("id", id)
          .maybeSingle(),
        supabase.from("activities").select("type, note, occurred_at").eq("client_id", id).order("occurred_at", { ascending: false }).limit(10),
        supabase.from("tasks").select("id, title, type, due_date, due_time").eq("client_id", id).eq("status", "open").limit(10),
        supabase.from("deals").select("id, stage, status, price, currency, commission, property:properties(title)").eq("client_id", id).limit(10),
      ]);
      if (!client) return { result: { error: "not found or not visible" } };
      return { result: { ...client, recent_history: acts, open_tasks: tasks, deals } };
    }

    case "search_properties": {
      let q = supabase
        .from("properties")
        .select(
          "id, title, status, operation_type, current_price, currency, area, rooms, floor, address, exposures, settlement:geo_settlements(name), neighborhood:geo_neighborhoods(name), broker:profiles!properties_responsible_broker_id_fkey(full_name)"
        )
        .eq("organization_id", org)
        .order("updated_at", { ascending: false })
        .limit(LIMIT);
      const text = ilike(clean(input.query, 80));
      if (text) q = q.or(`title.ilike.%${text}%,address.ilike.%${text}%`);
      if (typeof input.status === "string") q = q.eq("status", input.status);
      if (input.operation === "sale" || input.operation === "rent") q = q.eq("operation_type", input.operation);
      if (typeof input.min_price === "number") q = q.gte("current_price", input.min_price);
      if (typeof input.max_price === "number") q = q.lte("current_price", input.max_price);
      if (typeof input.min_rooms === "number") q = q.gte("rooms", input.min_rooms);
      if (input.mine_only) q = q.eq("responsible_broker_id", session.userId);
      const place = ilike(clean(input.settlement, 60));
      if (place) {
        const { data: towns } = await supabase.from("geo_settlements").select("id").ilike("name", `%${place}%`).limit(20);
        q = q.in("settlement_id", (towns ?? []).map((town) => town.id));
      }
      const { data, error } = await q;
      return { result: error ? { error: error.message } : data };
    }

    case "get_property": {
      const id = clean(input.property_id, 60);
      const [{ data: property }, { data: deals }] = await Promise.all([
        supabase
          .from("properties")
          .select(
            "id, title, status, operation_type, current_price, asking_price, currency, area, rooms, bedrooms, floor, total_floors, construction_type, condition, exposures, furnishing, heating, exclusive_contract, commission_rate, address, description, created_at, settlement:geo_settlements(name), neighborhood:geo_neighborhoods(name), broker:profiles!properties_responsible_broker_id_fkey(full_name), features:property_feature_values(feature:property_features(name))"
          )
          .eq("id", id)
          .maybeSingle(),
        supabase.from("deals").select("id, stage, status, price, commission, client:clients(full_name)").eq("property_id", id).limit(10),
      ]);
      if (!property) return { result: { error: "not found" } };
      return { result: { ...property, description: clean(property.description, 1500), deals } };
    }

    case "properties_for_client": {
      const { data } = await supabase.from("client_searches").select("*").eq("client_id", clean(input.client_id, 60)).maybeSingle();
      const search = searchFromRow(data);
      if (!search) return { result: { error: "this client has no saved search" } };
      const matches = await findMatches(supabase, org, search);
      return {
        result: matches.slice(0, 15).map((m) => ({
          id: m.id,
          title: m.title,
          price: m.price,
          currency: m.currency,
          area: m.area,
          rooms: m.rooms,
          place: [m.settlement?.name, m.neighborhood?.name].filter(Boolean).join(", "),
          broker: m.broker?.full_name,
          score: m.score,
          over_budget_pct: m.overBudgetPct,
        })),
      };
    }

    case "buyers_for_property": {
      const buyers = await findBuyers(supabase, clean(input.property_id, 60));
      return { result: buyers.slice(0, 15) };
    }

    case "my_agenda": {
      const days = Math.max(0, Math.min(14, Number(input.days_ahead) || 0));
      const until = addDays(today, days);
      const [{ data: tasks }, { data: clients }, { data: deals }] = await Promise.all([
        supabase
          .from("tasks")
          .select("id, title, type, due_date, due_time, client:clients(id, full_name, phone)")
          .eq("assigned_to", session.userId)
          .eq("status", "open")
          .lte("due_date", until)
          .order("due_date"),
        supabase
          .from("clients")
          .select("id, full_name, phone, client_class, follow_up_at")
          .eq("responsible_broker_id", session.userId)
          .not("follow_up_at", "is", null)
          .lte("follow_up_at", `${addDays(until, 1)}T00:00:00+03:00`)
          .order("follow_up_at"),
        supabase
          .from("deals")
          .select("id, kind, stage, viewing_on, viewing_time, offer_on, offer_time, deposit_on, deposit_time, preliminary_on, preliminary_time, notary_on, notary_time, property:properties(title), client:clients(full_name)")
          .eq("broker_id", session.userId)
          .eq("status", "open"),
      ]);
      const steps: { deal_id: string; stage: string; day: string; time: string | null; title: string }[] = [];
      for (const deal of (deals ?? []) as unknown as Record<string, unknown>[]) {
        for (const stage of ["viewing", "offer", "deposit", "preliminary", "notary"]) {
          const day = deal[`${stage}_on`] as string | null;
          if (!day || day < today || day > until) continue;
          const property = deal.property as { title: string } | null;
          const client = deal.client as { full_name: string } | null;
          steps.push({ deal_id: deal.id as string, stage, day, time: (deal[`${stage}_time`] as string | null)?.slice(0, 5) ?? null, title: property?.title ?? client?.full_name ?? "" });
        }
      }
      const now = new Date().toISOString();
      return {
        result: {
          today,
          tasks: (tasks ?? []).map((task) => ({ ...task, overdue: task.due_date < today })),
          follow_ups: (clients ?? []).map((c) => ({ ...c, overdue: c.follow_up_at! <= now, due_day: sofiaDay(c.follow_up_at!) })),
          deal_steps: steps.sort((a, b) => a.day.localeCompare(b.day)),
        },
      };
    }

    case "list_deals": {
      let q = supabase
        .from("deals")
        .select("id, kind, stage, status, price, currency, commission, closed_on, confirmed_at, property:properties(title), client:clients(full_name), broker:profiles!deals_broker_id_fkey(full_name)")
        .eq("organization_id", org)
        .order("updated_at", { ascending: false })
        .limit(LIMIT);
      if (input.status === "open" || input.status === "won" || input.status === "lost") q = q.eq("status", input.status);
      if (!session.isManager) q = q.eq("broker_id", session.userId);
      const { data, error } = await q;
      return { result: error ? { error: error.message } : data };
    }

    case "team_ranking": {
      const boards = await getLeaderboards(org);
      const slim = (rows: typeof boards.month) => rows.map((r) => ({ name: r.name, commission: r.commission, deals: r.deals, points: r.points }));
      return { result: { month: slim(boards.month), year: slim(boards.year) } };
    }

    case "create_task": {
      const type = isOneOf(TASK_TYPES, input.type) ? input.type : "other";
      const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(input.due_date)) ? String(input.due_date) : today;
      const dueTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(input.due_time ?? "")) ? String(input.due_time) : null;
      const [client, property] = await Promise.all([clientName(ctx, input.client_id), propertyTitle(ctx, input.property_id)]);
      const proposal: ProposedAction = {
        kind: "task",
        title: clean(input.title, 200) || ctx.t.options.taskType[type],
        type,
        dueDate,
        dueTime,
        clientId: client?.id ?? null,
        clientName: client?.full_name ?? null,
        propertyId: property?.id ?? null,
        propertyTitle: property?.title ?? null,
        description: clean(input.description, 2000),
      };
      return { result: { status: "shown to the user to confirm", proposal }, proposal };
    }

    case "log_activity": {
      const type = isOneOf(["call", "email", "message", "meeting", "viewing", "note"] as const, input.type) ? input.type : "note";
      const [client, property] = await Promise.all([clientName(ctx, input.client_id), propertyTitle(ctx, input.property_id)]);
      const proposal: ProposedAction = {
        kind: "activity",
        type,
        note: clean(input.note, 2000),
        clientId: client?.id ?? null,
        clientName: client?.full_name ?? null,
        propertyId: property?.id ?? null,
        propertyTitle: property?.title ?? null,
      };
      return { result: { status: "shown to the user to confirm", proposal }, proposal };
    }

    default:
      return { result: { error: `unknown tool ${name}` } };
  }
}
