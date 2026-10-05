import type { Metadata } from "next";
import { LanguageToggle } from "@/components/LanguageToggle";
import { PageHeader } from "@/components/PageHeader";
import { FollowUpRulesForm } from "@/components/followup/FollowUpRulesForm";
import { AgencySettingsForm } from "@/components/settings/AgencySettingsForm";
import { SiteSettingsForm } from "@/components/settings/SiteSettingsForm";
import { PushSettings } from "@/components/push/PushSettings";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Card } from "@/components/ui/form";
import { getAgency } from "@/lib/agency";
import { TemplateEditor } from "@/components/marketing/TemplateEditor";
import { cleanTemplate } from "@/lib/marketing";
import { getI18n } from "@/lib/i18n/server";
import { bottomNavFor, menuFor } from "@/lib/nav";
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
  const agency = session!.isOwner ? await getAgency(session!.organizationId) : null;
  const { data: rules } = session!.isLeader
    ? await supabase
        .from("organizations")
        .select("follow_up_first_hours, follow_up_days_a, follow_up_days_b, follow_up_days_c, release_after_days, marketing_template")
        .eq("id", session!.organizationId)
        .maybeSingle()
    : { data: null };

  return (
    <>
      <PageHeader title={t.settings.title} subtitle={t.settings.subtitle} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card title={t.settings.bottomBar} description={t.settings.bottomBarHint}>
          <BottomBarSettings
            initial={bottomNavFor(session!.bottomNav, session!.isManager, Boolean(process.env.ANTHROPIC_API_KEY), session!.solo)}
            all={menuFor(session!.isManager, Boolean(process.env.ANTHROPIC_API_KEY), session!.solo).map((s) => s.key)}
          />
        </Card>

        <div className="space-y-6">
          <Card title={t.push.title} description={t.push.hint} id="push">
            <PushSettings />
          </Card>

          {agency && (
            <Card title={t.agency.title} description={t.agency.hint} id="agency">
              <AgencySettingsForm
                organizationId={agency.id}
                logoUrl={agency.logoUrl}
                initial={{
                  name: agency.name,
                  phone: agency.phone ?? "",
                  email: agency.email ?? "",
                  website: agency.website ?? "",
                  address: agency.address ?? "",
                  kind: agency.kind,
                  legalName: agency.legalName ?? "",
                  eik: agency.eik ?? "",
                  city: agency.city ?? "",
                  defaultCurrency: agency.defaultCurrency,
                  commissionSalePercent: agency.commissionSalePercent,
                  commissionRentMonths: agency.commissionRentMonths,
                  referralPercent: agency.referralPercent,
                  points: agency.points,
                }}
              />
            </Card>
          )}

          {agency && (
            <Card title={t.site.settingsTitle} description={t.site.settingsHint} id="site">
              <SiteSettingsForm
                initial={{
                  enabled: agency.site.enabled,
                  slug: agency.site.slug ?? "",
                  headline: agency.site.headline ?? "",
                  about: agency.site.about ?? "",
                }}
              />
            </Card>
          )}

          {rules && (
            <Card title={t.marketing.templateTitle} description={t.marketing.templateHint} id="marketing">
              <TemplateEditor initial={cleanTemplate(rules.marketing_template)} />
            </Card>
          )}

          {rules && session!.isOwner && (
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
