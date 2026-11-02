import { fmt, locale, type Dictionary, type Lang } from "./i18n/dictionaries";

/**
 * The Academy (069): tests on 8 topics at 3 levels, the exam each round, the certificate.
 * The questions and the right answers stay in the database; it checks every test.
 */
export const ACADEMY_TOPICS = ["zut", "law", "buyers", "sellers", "banks", "sales", "market", "city"] as const;
export type AcademyTopic = (typeof ACADEMY_TOPICS)[number];
export const isAcademyTopic = (value: unknown): value is AcademyTopic => (ACADEMY_TOPICS as readonly unknown[]).includes(value);

export type AcademyLevel = 1 | 2 | 3;
export const ACADEMY_LEVELS: AcademyLevel[] = [1, 2, 3];
export const isAcademyLevel = (value: unknown): value is AcademyLevel => value === 1 || value === 2 || value === 3;

export const ACADEMY_EVERY = ["month", "quarter", "half", "year", "off"] as const;
export type AcademyEvery = (typeof ACADEMY_EVERY)[number];
export const isAcademyEvery = (value: unknown): value is AcademyEvery => (ACADEMY_EVERY as readonly unknown[]).includes(value);

/** As the database sets them (academy_start). */
export const EXAM_QUESTIONS = 20;
export const EXAM_MINUTES = 30;
export const PRACTICE_QUESTIONS = 10;

/** The answers' letters, as on a paper test. */
export const ANSWER_LETTERS: Record<Lang, string[]> = { bg: ["А", "Б", "В", "Г", "Д"], en: ["A", "B", "C", "D", "E"] };

/** The BRIXA level (experience) a level of the academy follows from, when no manager set one. */
export const ACADEMY_LEVEL_XP: Record<AcademyLevel, number> = { 1: 0, 2: 1000, 3: 10000 };

export type AcademyMe = {
  level: AcademyLevel;
  auto_level: AcademyLevel;
  level_set: boolean;
  every: AcademyEvery;
  pass: number;
  /** '2026-11', '2026-Q4', '2026-H2', '2026' — none when the agency has no rounds */
  period: string | null;
  period_ends: string | null;
  passed: boolean;
  passed_level: AcademyLevel | null;
  wait_until: string | null;
  city: string | null;
};

export type ReviewQuestion = {
  position: number;
  topic: AcademyTopic;
  question: string;
  options: string[];
  chosen: number | null;
  /** once the test is finished (practice: once answered) */
  right: number | null;
  explanation: string | null;
};

export type AcademyReview = {
  id: string;
  mode: "exam" | "practice";
  level: AcademyLevel;
  topic: AcademyTopic | null;
  period: string | null;
  total: number;
  correct: number | null;
  score: number | null;
  passed: boolean | null;
  started_at: string;
  deadline_at: string | null;
  finished_at: string | null;
  /** the database's clock, for the time left */
  now: string;
  name: string;
  mine: boolean;
  pass: number;
  certificate: string | null;
  questions: ReviewQuestion[];
};

export type AcademyAttempt = {
  id: string;
  profile_id: string;
  mode: "exam" | "practice";
  level: AcademyLevel;
  topic: AcademyTopic | null;
  period: string | null;
  total: number;
  correct: number | null;
  score: number | null;
  passed: boolean | null;
  started_at: string;
  deadline_at: string | null;
  finished_at: string | null;
};

export type AcademyCertificate = {
  id: string;
  number: number;
  code: string;
  profile_id: string;
  level: AcademyLevel;
  score: number;
  holder_name: string;
  agency_name: string;
  signer_name: string | null;
  issued_on: string;
  valid_until: string;
};

export type TopicScore = { topic: AcademyTopic; answered: number; right_answers: number };

export type AcademyQuestion = {
  id: string;
  code: string | null;
  organization_id: string | null;
  topic: AcademyTopic;
  level: AcademyLevel;
  city: string | null;
  question: string;
  options: string[];
  correct: number;
  explanation: string | null;
  active: boolean;
};

/** The test is still running: not finished, and an exam's time isn't up. */
export const isOpen = (r: Pick<AcademyReview, "finished_at" | "deadline_at" | "now">) =>
  !r.finished_at && (!r.deadline_at || new Date(r.deadline_at).getTime() > new Date(r.now).getTime());

/** Right answers of the topics, best first; topics with no answers are left out. */
export function topicShares(rows: TopicScore[]) {
  return rows
    .filter((r) => r.answered > 0)
    .map((r) => ({ topic: r.topic, answered: r.answered, share: r.right_answers / r.answered }))
    .sort((a, b) => b.share - a.share);
}

/** "2026-11" → "ноември 2026 г."; "2026-Q4" → "четвъртото тримесечие на 2026 г."; "2026-H2"; "2026". */
export function periodLabel(period: string | null | undefined, t: Dictionary, lang: Lang) {
  if (!period) return "";
  const A = t.academy.periods;
  const year = period.slice(0, 4);
  const month = /^\d{4}-(\d{2})$/.exec(period);
  if (month) {
    return new Intl.DateTimeFormat(locale(lang), { month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(Date.UTC(Number(year), Number(month[1]) - 1, 1))
    );
  }
  const quarter = /-Q([1-4])$/.exec(period);
  if (quarter) return fmt(A.quarter, { which: A.quarters[Number(quarter[1]) - 1], year });
  const half = /-H([12])$/.exec(period);
  if (half) return fmt(A.half, { which: A.halves[Number(half[1]) - 1], year });
  return fmt(A.year, { year });
}

/** The words of a level ("Напреднало ниво"). */
export const levelName = (level: number, t: Dictionary) => t.academy.levels[Math.min(3, Math.max(1, level)) - 1];
