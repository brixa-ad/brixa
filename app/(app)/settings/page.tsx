import type { Metadata } from "next";
import { LanguageToggle } from "@/components/LanguageToggle";
import { PageHeader } from "@/components/PageHeader";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Card } from "@/components/ui/form";
import { getI18n } from "@/lib/i18n/server";
import { bottomNavFor, navKeysFor } from "@/lib/nav";
import { getSession } from "@/lib/session";
import { getTheme } from "@/lib/theme-server";
import { BottomBarSettings } from "./BottomBarSettings";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.settings.title };
}

export default async function SettingsPage() {
  const [session, { t }, theme] = await Promise.all([getSession(), getI18n(), getTheme()]);

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
    </>
  );
}
