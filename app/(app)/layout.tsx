import Link from "next/link";
import { LogOut } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Logo } from "@/components/Logo";
import { NavLinks } from "@/components/NavLinks";
import { PasskeyPrompt } from "@/components/passkey/PasskeyPrompt";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getI18n } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";
import { getTheme } from "@/lib/theme-server";
import { signOut } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [session, { t }, theme] = await Promise.all([getSession(), getI18n(), getTheme()]);

  if (!session) {
    return (
      <main className="mx-auto max-w-md px-4 py-24 text-center">
        <p className="text-fg-2">{t.errors.noOrg}</p>
        <form action={signOut} className="mt-6">
          <button className="text-sm font-semibold text-accent-fg">{t.common.signOut}</button>
        </form>
      </main>
    );
  }

  const displayName = session.fullName || session.email;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/75 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:gap-8 sm:px-6">
          <Link href="/properties" className="shrink-0">
            <Logo />
          </Link>

          <NavLinks
            links={[
              { href: "/properties", label: t.nav.properties },
              { href: "/clients", label: t.nav.clients },
              { href: "/team", label: t.nav.team },
            ]}
          />

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <ThemeToggle initialTheme={theme} />
            <LanguageToggle />

            <Link
              href="/profile"
              title={t.profile.title}
              className="flex items-center gap-2 rounded-lg p-1 transition hover:bg-raised md:pr-2"
            >
              <Avatar path={session.avatarPath} name={displayName} size="sm" />
              <div className="hidden leading-tight md:block">
                <p className="max-w-40 truncate text-sm font-medium">{displayName}</p>
                <p className="max-w-48 truncate text-xs text-muted">
                  {session.organizationName} · {t.roles[session.role]}
                </p>
              </div>
            </Link>

            <form action={signOut}>
              <button
                type="submit"
                title={t.common.signOut}
                aria-label={t.common.signOut}
                className="grid size-9 place-items-center rounded-lg text-muted transition hover:bg-raised hover:text-fg"
              >
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <PasskeyPrompt />
        {children}
      </main>
    </div>
  );
}
