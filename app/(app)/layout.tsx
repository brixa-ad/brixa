import Link from "next/link";
import { LogOut } from "lucide-react";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Logo } from "@/components/Logo";
import { NavLinks } from "@/components/NavLinks";
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
  const initials = displayName
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

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
              { href: "/team", label: t.nav.team },
            ]}
          />

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <ThemeToggle initialTheme={theme} />
            <LanguageToggle />

            <div className="hidden items-center gap-2 md:flex">
              <span className="grid size-8 place-items-center rounded-full bg-raised text-xs font-semibold text-fg-2">
                {initials}
              </span>
              <div className="leading-tight">
                <p className="max-w-40 truncate text-sm font-medium">{displayName}</p>
                <p className="max-w-40 truncate text-xs text-muted">{session.organizationName}</p>
              </div>
            </div>

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

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
