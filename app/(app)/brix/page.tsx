import type { Metadata } from "next";
import { BrixChat } from "@/components/brix/BrixChat";
import { PageHeader } from "@/components/PageHeader";
import { getI18n } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.brix.title };
}

export default async function BrixPage({ searchParams }: PageProps<"/brix">) {
  const { q } = await searchParams;
  const [session, { t }] = await Promise.all([getSession(), getI18n()]);

  return (
    <>
      <PageHeader title={t.brix.title} subtitle={t.brix.subtitle} />
      <BrixChat userId={session!.userId} initialQuestion={typeof q === "string" ? q.slice(0, 500) : undefined} />
      <p className="mt-3 text-center text-[11px] text-subtle">{t.brix.privacy}</p>
    </>
  );
}
