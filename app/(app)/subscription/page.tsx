import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { SubscriptionView } from "@/components/subscription/SubscriptionView";
import { getI18n } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.billing.title };
}

/** The agency's trial or package, the packages, and BRIXA's contacts. */
export default async function SubscriptionPage() {
  const [session, { t, lang }] = await Promise.all([getSession(), getI18n()]);
  if (!session) return null;
  return (
    <div className="space-y-6">
      <PageHeader title={t.billing.title} backHref="/settings" backLabel={t.nav.settings} />
      <SubscriptionView session={session} t={t} lang={lang} />
    </div>
  );
}
