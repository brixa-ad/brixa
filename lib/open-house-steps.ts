import { addDays } from "./dates";
import type { TaskType } from "./options";
import { isWorkingDay } from "./workdays";

/**
 * The Open House Playbook, day by day: materials midweek, invitations, the neighbours, the signs
 * the evening before, hosting (30 minutes early), and the calls the next working day.
 */
export const PREP_STEPS: { key: "materials" | "invite_db" | "social" | "neighbors" | "signs" | "host" | "call_visitors" | "call_neighbors"; offset: number; type: TaskType }[] = [
  { key: "materials", offset: -4, type: "other" },
  { key: "invite_db", offset: -3, type: "message" },
  { key: "social", offset: -3, type: "other" },
  { key: "neighbors", offset: -2, type: "other" },
  { key: "signs", offset: -1, type: "other" },
  { key: "host", offset: 0, type: "meeting" },
  { key: "call_visitors", offset: 1, type: "call" },
  { key: "call_neighbors", offset: 1, type: "call" },
];

export type PrepKey = (typeof PREP_STEPS)[number]["key"];

/** Ticked when an open house is planned: the ones that matter most (the rest only when picked). */
export const DEFAULT_PREP: PrepKey[] = ["invite_db", "host", "call_visitors"];

/** The day a step is due: before the event as planned (never in the past); after it, the next working day. */
export function prepDay(eventDay: string, offset: number, today: string) {
  if (offset > 0) {
    let day = addDays(eventDay, 1);
    while (!isWorkingDay(day)) day = addDays(day, 1);
    return day;
  }
  const day = addDays(eventDay, offset);
  return day < today ? today : day;
}
