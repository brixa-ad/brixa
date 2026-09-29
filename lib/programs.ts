/**
 * Contact programs (The Millionaire Real Estate Agent's "8 x 8" and "33 touch"): a client follows
 * a series of steps — a message, a call — and BRIXA opens the next step's task when one is done.
 * The steps' titles and ready texts are in the dictionary (programs.<key>.steps).
 */
import type { TaskType } from "./options";

export const PROGRAM_KEYS = ["new_contact", "after_deal", "sphere", "owner_updates"] as const;
export type ProgramKey = (typeof PROGRAM_KEYS)[number];

type Step = { day: number; type: TaskType };

export const PROGRAMS: Record<ProgramKey, { steps: Step[]; /** days per round, for the ones that repeat */ cycle: number | null }> = {
  // 8 touches in 8 weeks, so a new acquaintance remembers you
  new_contact: {
    cycle: null,
    steps: [
      { day: 0, type: "message" },
      { day: 7, type: "message" },
      { day: 14, type: "message" },
      { day: 21, type: "call" },
      { day: 28, type: "message" },
      { day: 35, type: "message" },
      { day: 42, type: "message" },
      { day: 49, type: "call" },
    ],
  },
  // after the deal: a client for life
  after_deal: {
    cycle: null,
    steps: [
      { day: 2, type: "message" },
      { day: 14, type: "call" },
      { day: 45, type: "message" },
      { day: 90, type: "call" },
      { day: 180, type: "message" },
      { day: 365, type: "message" },
    ],
  },
  // the people you know and past clients: something every month, every year
  sphere: {
    cycle: 365,
    steps: [
      { day: 0, type: "message" },
      { day: 30, type: "call" },
      { day: 60, type: "message" },
      { day: 90, type: "message" },
      { day: 120, type: "call" },
      { day: 150, type: "message" },
      { day: 180, type: "message" },
      { day: 210, type: "call" },
      { day: 240, type: "message" },
      { day: 270, type: "message" },
      { day: 300, type: "call" },
      { day: 330, type: "message" },
    ],
  },
  // a seller whose listing we have: a report every week
  owner_updates: {
    cycle: 7,
    steps: [{ day: 0, type: "message" }],
  },
};

export const isProgram = (value: unknown): value is ProgramKey => (PROGRAM_KEYS as readonly unknown[]).includes(value);

/** Days from a step to the next one (going round for the repeating ones); null = the program ends. */
export function daysToNext(key: ProgramKey, step: number): { step: number; days: number; newRound: boolean } | null {
  const { steps, cycle } = PROGRAMS[key];
  if (step + 1 < steps.length) return { step: step + 1, days: Math.max(1, steps[step + 1].day - steps[step].day), newRound: false };
  if (cycle === null) return null;
  return { step: 0, days: Math.max(1, cycle - steps[step].day + steps[0].day), newRound: true };
}

/** "Иван Петров" → "Иван" — texts greet by the first name. */
export const firstName = (fullName: string) => fullName.trim().split(/\s+/)[0] ?? fullName;

/** {name}, {broker}, {agency} in a ready text. */
export const fillText = (text: string, vars: { name: string; broker: string; agency: string }) =>
  text.replace(/\{(name|broker|agency)\}/g, (_, key: "name" | "broker" | "agency") => vars[key]);

/** The program that fits a client best right now. */
export function suggestProgram(client: { stage: string; types: readonly string[] }, has: { wonDeal: boolean; activeListing: boolean }): ProgramKey {
  if (has.activeListing) return "owner_updates";
  if (has.wonDeal || client.stage === "deal") return "after_deal";
  if (["new_contact", "called", "presentation"].includes(client.stage)) return "new_contact";
  return "sphere";
}
