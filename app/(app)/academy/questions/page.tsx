import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { QuestionManager } from "@/components/academy/QuestionManager";
import { TopicIcon } from "@/components/academy/TopicIcon";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/form";
import { ACADEMY_LEVELS, ACADEMY_TOPICS, type AcademyMe, type AcademyQuestion } from "@/lib/academy";
import { fmt } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.nav.academyQuestions };
}

type BankRow = { topic: string; level: number; builtin: number; own: number };

const COLUMNS = "id, code, organization_id, topic, level, city, question, options, correct, explanation, active";

/**
 * The questions: how many BRIXA's bank holds by topic and level, and the agency's own (its leaders
 * add them — their city, their way). The platform admin keeps BRIXA's own for every agency.
 */
export default async function AcademyQuestionsPage({ searchParams }: PageProps<"/academy/questions">) {
  const session = (await getSession())!;
  if (!session.isManager && !session.platformAdmin) redirect("/academy");
  const params = await searchParams;
  const brixa = session.platformAdmin && params.bank === "brixa";

  const supabase = await createClient();
  const list = supabase.from("academy_questions").select(COLUMNS).order("topic").order("level").order("created_at", { ascending: false });
  const [{ t }, { data: bankRows }, { data: questionRows }, { data: meData }] = await Promise.all([
    getI18n(),
    supabase.rpc("academy_bank", { target_org: session.organizationId }),
    brixa ? list.is("organization_id", null) : list.eq("organization_id", session.organizationId),
    supabase.rpc("academy_me"),
  ]);
  const A = t.academy;
  const bank = (bankRows ?? []) as BankRow[];
  const questions = (questionRows ?? []) as AcademyQuestion[];
  const me = meData as AcademyMe | null;
  const builtin = bank.reduce((sum, r) => sum + r.builtin, 0);
  const cell = (topic: string, level: number) => bank.find((r) => r.topic === topic && r.level === level);

  return (
    <>
      <PageHeader title={A.questions} subtitle={A.questionsSubtitle} />

      {session.platformAdmin && (
        <nav className="mb-5 flex flex-wrap gap-2 text-sm">
          {[
            { href: "/academy/questions", label: A.showOwn, active: !brixa },
            { href: "/academy/questions?bank=brixa", label: A.showBrixa, active: brixa },
          ].map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={tab.active ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 font-medium transition ${tab.active ? "bg-accent text-on-accent" : "border border-line text-fg-2 hover:bg-raised"}`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      )}

      {/* what the tests draw from */}
      <Card title={A.bankTitle} description={fmt(A.bankHint, { count: builtin })}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-line-soft text-left text-xs text-muted">
                <th className="py-2 pr-2 font-medium">{A.form.topic}</th>
                {ACADEMY_LEVELS.map((level) => (
                  <th key={level} className="px-2 py-2 text-right font-medium">
                    {A.levelShort[level - 1]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ACADEMY_TOPICS.map((topic) => (
                <tr key={topic} className="border-b border-line-soft last:border-0">
                  <td className="py-2 pr-2">
                    <span className="flex items-center gap-2 font-medium">
                      <TopicIcon topic={topic} className="size-4 text-muted" />
                      {A.topics[topic]}
                    </span>
                  </td>
                  {ACADEMY_LEVELS.map((level) => {
                    const row = cell(topic, level);
                    return (
                      <td key={level} className="px-2 py-2 text-right tabular-nums">
                        {row?.builtin ?? 0}
                        {row && row.own > 0 && <span className="ml-1 text-xs font-semibold text-accent-fg">+{row.own}</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">{brixa ? A.brixaTitle : A.ownTitle}</h2>
        <p className="mb-4 mt-1 text-sm text-muted">{brixa ? A.brixaHint : A.ownHint}</p>
        <QuestionManager questions={questions} brixa={brixa} city={brixa ? null : (me?.city ?? null)} />
      </section>
    </>
  );
}
