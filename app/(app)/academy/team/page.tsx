import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Award, CheckCircle2, XCircle } from "lucide-react";
import { LevelSelect, RulesForm } from "@/components/academy/TeamControls";
import { TopicIcon } from "@/components/academy/TopicIcon";
import { Avatar } from "@/components/Avatar";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/form";
import { isAcademyEvery, periodLabel, topicShares, type AcademyMe, type TopicScore } from "@/lib/academy";
import { sofiaToday } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { fmt } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.nav.academyTeam };
}

type Person = {
  profile_id: string;
  full_name: string | null;
  email: string;
  avatar_path: string | null;
  role: Role;
  level: number;
  level_set: boolean;
  auto_level: number;
  expected: boolean;
  best: number | null;
  passed: boolean;
  attempts: number;
  last_at: string | null;
  certificate_level: number | null;
  certificate_until: string | null;
};

type Exam = { id: string; profile_id: string; started_at: string };

/** The leader's people in the academy: their level, this round's exam, their certificate; the owner's rules. */
export default async function AcademyTeamPage() {
  const session = (await getSession())!;
  if (!session.isManager || session.solo) redirect("/academy");
  const supabase = await createClient();
  const [{ t, lang }, { data: teamRows }, { data: topicRows }, { data: meData }, { data: rules }, { data: examRows }] = await Promise.all([
    getI18n(),
    supabase.rpc("academy_team", { target_org: session.organizationId }),
    supabase.rpc("academy_topics", { target_org: session.organizationId }),
    supabase.rpc("academy_me"),
    supabase.from("organizations").select("academy_every, academy_pass").eq("id", session.organizationId).maybeSingle(),
    supabase
      .from("academy_attempts")
      .select("id, profile_id, started_at")
      .eq("organization_id", session.organizationId)
      .eq("mode", "exam")
      .order("started_at", { ascending: false })
      .limit(500),
  ]);
  const A = t.academy;
  const people = (teamRows ?? []) as Person[];
  const me = meData as AcademyMe | null;
  const shares = topicShares((topicRows ?? []) as TopicScore[]);
  const pass = Number(rules?.academy_pass ?? me?.pass ?? 80);
  const every = isAcademyEvery(rules?.academy_every) ? rules.academy_every : "month";
  const today = sofiaToday();

  // each person's last exam, to open it
  const lastExam = new Map<string, string>();
  for (const exam of (examRows ?? []) as Exam[]) if (!lastExam.has(exam.profile_id)) lastExam.set(exam.profile_id, exam.id);

  const expected = people.filter((p) => p.expected);
  const passedCount = expected.filter((p) => p.passed).length;
  const round = me?.period ? fmt(A.examFor, { period: periodLabel(me.period, t, lang) }) : A.examAnytime;

  return (
    <>
      <PageHeader title={A.team} subtitle={A.teamSubtitle} />

      <Card className="p-0! sm:p-0!">
        <div className="flex flex-wrap items-baseline justify-between gap-3 px-5 pt-5 sm:px-6">
          <h2 className="text-base font-semibold">{round}</h2>
          {expected.length > 0 && <p className="text-sm text-muted">{fmt(A.teamPassed, { count: passedCount, total: expected.length })}</p>}
        </div>
        {people.length === 0 ? (
          <p className="px-5 py-5 text-sm text-muted sm:px-6">{A.teamNone}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line-soft text-left text-xs text-muted">
                  <th className="px-5 py-2 font-medium sm:px-6">{t.teamWeek.person}</th>
                  <th className="px-2 py-2 font-medium">{A.form.level}</th>
                  <th className="px-2 py-2 font-medium">{A.lastExam}</th>
                  <th className="px-2 py-2 font-medium">{A.certificateShort}</th>
                  <th className="px-5 py-2 sm:px-6" />
                </tr>
              </thead>
              <tbody>
                {people.map((p) => {
                  const name = p.full_name || p.email;
                  const exam = lastExam.get(p.profile_id);
                  const validCertificate = p.certificate_until && p.certificate_until >= today;
                  return (
                    <tr key={p.profile_id} className="border-b border-line-soft last:border-0">
                      <td className="px-5 py-3 sm:px-6">
                        <div className="flex items-center gap-3">
                          <Avatar path={p.avatar_path} name={name} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{name}</p>
                            <p className="text-xs text-muted">{t.roles[p.role]}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        <LevelSelect profileId={p.profile_id} level={p.level} levelSet={p.level_set} autoLevel={p.auto_level} name={name} />
                      </td>
                      <td className="px-2 py-3">
                        {p.passed ? (
                          <span className="inline-flex items-center gap-1.5 font-medium text-success">
                            <CheckCircle2 className="size-4" />
                            {A.passed} · {p.best ?? 0}%
                          </span>
                        ) : p.attempts > 0 ? (
                          <span className="inline-flex items-center gap-1.5 font-medium text-danger">
                            <XCircle className="size-4" />
                            {A.failed} · {p.best ?? 0}%<span className="font-normal text-muted"> · {fmt(A.attempts, { count: p.attempts })}</span>
                          </span>
                        ) : (
                          <span className="text-muted">{p.expected ? A.notStarted : A.notExpected}</span>
                        )}
                      </td>
                      <td className="px-2 py-3">
                        {p.certificate_level ? (
                          <span className={`inline-flex items-center gap-1.5 ${validCertificate ? "text-fg" : "text-muted"}`}>
                            <Award className={`size-4 ${validCertificate ? "text-success" : "text-subtle"}`} />
                            {A.levelShort[p.certificate_level - 1]}
                            <span className="text-xs text-muted">
                              · {validCertificate ? fmt(A.validUntil, { date: formatDate(p.certificate_until!, lang) }) : A.expired}
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right sm:px-6">
                        {exam && (
                          <Link href={`/academy/test/${exam}`} className="font-medium text-accent-fg hover:underline">
                            {A.open}
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title={A.weakTopics} description={A.weakTopicsHint}>
          {shares.length === 0 ? (
            <p className="text-sm text-muted">{A.strengthsNone}</p>
          ) : (
            <ul className="space-y-3">
              {[...shares].reverse().map((row) => (
                <li key={row.topic}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 font-medium">
                      <TopicIcon topic={row.topic} className="size-4 text-muted" />
                      {A.topics[row.topic]}
                    </span>
                    <span className="tabular-nums text-fg-2">
                      {Math.round(row.share * 100)}% <span className="text-xs text-muted">· {fmt(A.questionsCount, { count: row.answered })}</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-raised">
                    <div
                      className={`h-full rounded-full ${row.share * 100 >= pass ? "bg-success" : row.share >= 0.6 ? "bg-warning" : "bg-danger"}`}
                      style={{ width: `${Math.max(3, Math.round(row.share * 100))}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={A.rulesTitle} description={session.isOwner ? A.rulesHint : undefined}>
          {session.isOwner ? (
            <RulesForm every={every} pass={pass} />
          ) : (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">{A.every}</dt>
                <dd className="font-medium">{A.everyOptions[every]}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">{A.passMark}</dt>
                <dd className="font-medium">{pass}%</dd>
              </div>
              <p className="pt-2 text-xs text-muted">{A.rulesHint}</p>
            </dl>
          )}
          <p className="mt-4 border-t border-line-soft pt-4 text-sm text-fg-2">{A.levelRule}</p>
        </Card>
      </div>
    </>
  );
}
