import type { Metadata } from "next";
import { LanguageToggle } from "@/components/LanguageToggle";
import { PageHeader } from "@/components/PageHeader";
import { FollowUpRulesForm } from "@/components/followup/FollowUpRulesForm";
import { PushSettings } from "@/components/push/PushSettings";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Card } from "@/components/ui/form";
import { getI18n } from "@/lib/i18n/server";
import { bottomNavFor, navKeysFor } from "@/lib/nav";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getTheme } from "@/lib/theme-server";
import { BottomBarSettings } from "./BottomBarSettings";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.settings.title };
}

export default async function SettingsPage() {
  const [session, { t }, theme] = await Promise.all([getSession(), getI18n(), getTheme()]);
  const supabase = await createClient();
  const { data: rules } = session!.isManager
    ? await supabase
        .from("organizations")
        .select("follow_up_first_hours, follow_up_days_a, follow_up_days_b, follow_up_days_c, release_after_days")
        .eq("id", session!.organizationId)
        .maybeSingle()
    : { data: null };

  return (
    <>
      <PageHeader title={t.settings.title} subtitle={t.settings.subtitle} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card title={t.settings.bottomBar} description={t.settings.bottomBarHint}>
          <BottomBarSettings
            initial={bottomNavFor(session!.bottomNav, session!.isManager)}
            all={navKeysFor(session!.isManager)}
          />
        </Card>

        <div className="space-y-6">
          <Card title={t.push.title} description={t.push.hint} id="push">
            <PushSettings />
          </Card>

          {rules && (
            <Card title={t.followUp.rulesTitle} id="follow-up">
              <FollowUpRulesForm
                initial={{
                  firstHours: rules.follow_up_first_hours,
                  daysA: rules.follow_up_days_a,
                  daysB: rules.follow_up_days_b,
                  daysC: rules.follow_up_days_c,
                  releaseDays: rules.release_after_days,
                }}
              />
            </Card>
          )}

          <Card title={t.settings.appearance}>
            <dl className="space-y-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="font-medium">{t.settings.language}</dt>
                <dd>
                  <LanguageToggle />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="font-medium">{t.settings.theme}</dt>
                <dd>
                  <ThemeToggle initialTheme={theme} />
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
