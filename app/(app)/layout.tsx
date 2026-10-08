import Link from "next/link";
import { Suspense } from "react";
import { Bell, Clock, LogOut } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { BottomNav } from "@/components/BottomNav";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Logo } from "@/components/Logo";
import { NavLinks } from "@/components/NavLinks";
import { PasskeyPrompt } from "@/components/passkey/PasskeyPrompt";
import { ServiceWorker } from "@/components/push/ServiceWorker";
import { PendingLogo } from "@/components/settings/PendingLogo";
import { SideMenu } from "@/components/SideMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DictationProvider } from "@/components/ui/Dictate";
import { getI18n } from "@/lib/i18n/server";
import { bottomNavFor, menuFor } from "@/lib/nav";
import { SectionTabs } from "@/components/SectionTabs";
import { SubscriptionView } from "@/components/subscription/SubscriptionView";
import { fmt } from "@/lib/i18n/dictionaries";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getTheme } from "@/lib/theme-server";
import { signOut } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [session, { t, lang }, theme] = await Promise.all([getSession(), getI18n(), getTheme()]);

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
  // the trial is over and nothing is paid: the data stays, the work waits (BRIXA itself is never locked)
  const sub = session.subscription;
  const locked = sub.status === "expired" && !session.platformAdmin;
  // the owner sees the days left of the trial, and the last week of a paid time
  const daysLeft =
    session.isOwner && (sub.status === "trial" || (sub.status === "active" && (sub.daysLeft ?? 99) <= 7)) ? sub.daysLeft : null;
  const brixOn = Boolean(process.env.ANTHROPIC_API_KEY);
  // the eight sections (and their pages) this person may open
  const menu = menuFor(session.isManager, brixOn, session.solo);
  const supabase = await createClient();
  const { count: unread } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", session.userId)
    .is("read_at", null);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/75 pt-[env(safe-area-inset-top)] backdrop-blur print:hidden">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
          <SideMenu
            sections={menu}
            name={displayName}
            subtitle={`${session.organizationName} · ${t.roles[session.role]}`}
            avatarPath={session.avatarPath}
            unread={unread ?? 0}
            platformAdmin={session.platformAdmin}
          />
          <Link href="/" className="shrink-0">
            <Logo />
          </Link>

          {/* Phones use the bottom tab bar instead. */}
          <div className="hidden md:block">
            <NavLinks sections={menu.filter((m) => ["home", "day", "clients", "properties", "deals", "insights"].includes(m.key))} />
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <Link
              href="/notifications"
              title={t.nav.notifications}
              aria-label={t.nav.notifications}
              className="relative grid size-9 place-items-center rounded-lg border border-line bg-surface text-muted transition hover:bg-raised hover:text-fg"
            >
              <Bell className="size-4" />
              {(unread ?? 0) > 0 && (
                <span className="absolute -right-1 -top-1 grid min-w-4.5 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-4.5 text-white">
                  {unread! > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
            <ThemeToggle initialTheme={theme} />
            {/* On phones the language switch lives on the profile page. */}
            <div className="hidden sm:block">
              <LanguageToggle />
            </div>

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

            <form action={signOut} className="hidden md:block">
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

      <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8 md:pb-8">
        {daysLeft !== null && (
          <Link
            href="/subscription"
            className={`mb-5 flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition print:hidden ${
              daysLeft <= 5 ? "border-warning/40 bg-warning/10 text-fg hover:bg-warning/15" : "border-line bg-surface text-fg-2 hover:bg-raised"
            }`}
          >
            <Clock className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">
              {sub.status === "trial" ? (daysLeft <= 1 ? t.billing.trialLastDay : fmt(t.billing.trialLeft, { n: daysLeft })) : fmt(t.billing.paidLeft, { n: daysLeft })}
            </span>
            <span className="shrink-0 font-semibold text-accent-fg">{t.billing.seePlans} →</span>
          </Link>
        )}
        <PasskeyPrompt />
        <ServiceWorker />
        {/* dictation: the server writes recordings when a speech service key is set */}
        {/* the tabs read the address's query (/clients?type=seller) */}
        <Suspense>
          <SectionTabs sections={menu} />
        </Suspense>
        {locked ? (
          <SubscriptionView session={session} t={t} lang={lang} locked />
        ) : (
          <DictationProvider server={Boolean(process.env.OPENAI_API_KEY)}>{children}</DictationProvider>
        )}
      </main>

      {session.isOwner && session.kind === "agency" && <PendingLogo organizationId={session.organizationId} />}
      <BottomNav items={bottomNavFor(session.bottomNav, session.isManager, brixOn, session.solo).map((key) => menu.find((s) => s.key === key)!).filter(Boolean)} />
    </div>
  );
}
