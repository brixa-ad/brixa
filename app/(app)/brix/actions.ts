"use server";

import type { ProposedAction } from "@/lib/brix/tools";
import { emptyFinancing, emptyOffer, emptySearch } from "@/lib/client-validation";
import { getSession } from "@/lib/session";
import { createClientRecord } from "../clients/actions";
import { logActivity, saveTask } from "../tasks/actions";

/** The user pressed "Confirm" on something Brix proposed. */
export async function confirmBrixAction(action: ProposedAction): Promise<{ ok: boolean; href?: string }> {
  const session = await getSession();
  if (!session) return { ok: false };

  if (action.kind === "client") {
    // a new client, theirs, with what they want; the next step comes along as a task
    const result = await createClientRecord({
      fullName: action.fullName,
      phone: action.phone,
      email: action.email,
      types: action.types,
      clientClass: action.clientClass,
      source: action.source,
      referrer: "",
      stage: "new_contact",
      timeline: null,
      decider: null,
      motive: "",
      notes: action.notes.trim() || "Brix",
      birthDay: null,
      birthMonth: null,
      egn: "",
      idCard: "",
      brokerId: session.userId,
      search: { ...emptySearch(), operation: action.types.includes("tenant") ? "rent" : "sale", budgetMax: action.budgetMax },
      offer: emptyOffer(),
      financing: emptyFinancing(),
    });
    if (!result.ok) return { ok: false, href: result.duplicateOf ? `/clients/${result.duplicateOf}` : undefined };
    if (action.task) {
      await saveTask({
        title: action.task.title,
        type: action.task.type,
        assignedTo: session.userId,
        clientId: result.id,
        propertyId: null,
        dueDate: action.task.dueDate,
        dueTime: action.task.dueTime,
        description: action.task.title,
      });
    }
    return { ok: true, href: `/clients/${result.id}` };
  }

  if (action.kind === "task") {
    const result = await saveTask({
      title: action.title,
      type: action.type,
      assignedTo: session.userId,
      clientId: action.clientId,
      propertyId: action.propertyId,
      dueDate: action.dueDate,
      dueTime: action.dueTime,
      description: action.description?.trim() || action.title,
    });
    if (result.ok && action.partnerId) {
      // with a colleague from another agency: on their card too
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      await supabase.from("tasks").update({ partner_id: action.partnerId }).eq("id", result.id);
    }
    return result.ok ? { ok: true, href: `/tasks/${result.id}` } : { ok: false };
  }

  const result = await logActivity({
    type: action.type,
    clientId: action.clientId,
    propertyId: action.propertyId,
    note: action.note?.trim() || "Brix",
  });
  const href = action.clientId ? `/clients/${action.clientId}` : action.propertyId ? `/properties/${action.propertyId}` : undefined;
  return { ok: result.ok, href };
}
