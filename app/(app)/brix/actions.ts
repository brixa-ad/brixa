"use server";

import type { ProposedAction } from "@/lib/brix/tools";
import { getSession } from "@/lib/session";
import { logActivity, saveTask } from "../tasks/actions";

/** The user pressed "Confirm" on something Brix proposed. */
export async function confirmBrixAction(action: ProposedAction): Promise<{ ok: boolean; href?: string }> {
  const session = await getSession();
  if (!session) return { ok: false };

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
