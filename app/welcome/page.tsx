import type { Metadata } from "next";
import Link from "next/link";
import {
  BellRing,
  CalendarCheck,
  Check,
  Eye,
  FileUp,
  Globe,
  Handshake,
  Home,
  Phone,
  Star,
  Trophy,
  Users,
  UsersRound,
} from "lucide-react";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { formatPrice } from "@/lib/format";
import { fmt } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { anonymous } from "@/lib/share";
import { toPlan, type Plan, type PlatformDetails } from "@/lib/subscription";
import { getTheme } from "@/lib/theme-server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: { absolute: t.landing.metaTitle },
    description: t.landing.metaDescription,
    openGraph: { title: t.landing.metaTitle, description: t.landing.metaDescription },
  };
}

const FEATURE_ICONS = [Users, Home, Handshake, CalendarCheck, Star, Globe, UsersRound, Trophy, FileUp];

/** What BRIXA is, for a visitor: what it does, how to start, the packages, and "try it free". */
export default async function WelcomePage() {
  const supabase = anonymous();
  const [{ t, lang }, theme, { data: planRows }, { data: details }] = await Promise.all([
    getI18n(),
    getTheme(),
    supabase.from("plans").select("code, name, max_people, price_month, position, active").eq("active", true).order("position"),
    supabase.from("platform_settings").select("company_name, eik, address, email, phone, website, trial_days").maybeSingle(),
  ]);
  const L = t.landing;
  const plans = ((planRows ?? []) as Plan[]).map(toPlan);
  const brixa = details as PlatformDetails | null;
  const tryHref = "/login?signup=1";

  return (
    <div className="min-h-screen overflow-x-clip">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/80 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Logo />
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle initialTheme={theme} />
            <div className="hidden sm:block">
              <LanguageToggle />
            </div>
            <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-semibold text-fg-2 transition hover:bg-raised hover:text-fg">
              {L.signIn}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        {/* ---- what it is ---- */}
        <section className="grid grid-cols-1 items-center gap-10 py-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:py-20">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-accent-fg">{L.kicker}</p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-6xl">
              {L.titleA}
              <br />
              <span className="bg-gradient-to-r from-accent to-brand-cyan bg-clip-text text-transparent">{L.titleB}</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-fg-2">{L.text}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href={tryHref} className="rounded-xl bg-accent px-6 py-3.5 text-base font-semibold text-on-accent shadow-sm transition hover:bg-accent-hover">
                {L.try}
              </Link>
              <Link href="/login" className="rounded-xl border border-line-strong bg-surface px-6 py-3.5 text-base font-semibold text-fg-2 transition hover:bg-raised">
                {L.signIn}
              </Link>
            </div>
            <p className="mt-3 text-sm text-muted">{L.note}</p>
          </div>

          {/* an illustration of a broker's day (made-up people) */}
          <div aria-hidden className="relative mx-auto w-full max-w-sm">
            <div className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-br from-accent/25 via-transparent to-brand-cyan/20 blur-2xl" />
            <div className="relative space-y-3 rounded-3xl border border-line bg-surface p-4 shadow-xl">
              <p className="px-1 text-sm font-semibold">{L.mockDay}</p>
              {[
                { icon: Phone, text: L.mockCall, tone: "text-accent-fg" },
                { icon: CalendarCheck, text: L.mockViewing, tone: "text-success" },
                { icon: Eye, text: L.mockOpened, tone: "text-brand-cyan" },
              ].map((item) => (
                <div key={item.text} className="flex items-center gap-3 rounded-xl border border-line-soft bg-raised/60 px-3 py-2.5">
                  <item.icon className={`size-4 shrink-0 ${item.tone}`} />
                  <span className="min-w-0 text-sm">{item.text}</span>
                </div>
              ))}
              <div className="rounded-2xl border border-line-soft bg-raised/60 p-4">
                <p className="text-2xl font-bold">{formatPrice(145000, "EUR", lang)}</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm">
                  <span className="flex text-amber-400">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <Star key={i} className="size-4 fill-current" />
                    ))}
                  </span>
                  <span className="font-medium text-success">{L.mockGood}</span>
                </p>
                <p className="mt-2 text-sm font-semibold">{L.mockListing}</p>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-sm font-medium text-on-accent">
                <BellRing className="size-4" />
                {L.mockOpened}
              </div>
            </div>
          </div>
        </section>

        {/* ---- what it does ---- */}
        <section className="py-10">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{L.featuresTitle}</h2>
          <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {L.features.map((f, i) => {
              const Icon = FEATURE_ICONS[i] ?? Check;
              return (
                <li key={f.title} className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
                  <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent-fg">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-4 font-semibold">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-fg-2">{f.text}</p>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ---- how to start ---- */}
        <section className="py-10">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{L.stepsTitle}</h2>
          <ol className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            {L.steps.map((step, i) => (
              <li key={step} className="flex gap-4 rounded-2xl border border-line bg-surface p-5 shadow-xs">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-on-accent">{i + 1}</span>
                <p className="pt-1.5 text-fg-2">{step}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ---- the packages ---- */}
        {plans.length > 0 && (
          <section id="prices" className="scroll-mt-20 py-10">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{L.pricesTitle}</h2>
            <p className="mt-2 text-fg-2">{L.pricesText}</p>
            <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {plans.map((p) => (
                <li key={p.code} className="flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-xs">
                  <h3 className="text-lg font-bold">{p.name}</h3>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                    <Users className="size-4" />
                    {p.max_people === null ? t.billing.unlimited : p.max_people === 1 ? t.billing.upToOne : fmt(t.billing.upTo, { n: p.max_people })}
                  </p>
                  <p className="mt-4">
                    <span className="text-3xl font-bold tracking-tight">{formatPrice(p.price_month, "EUR", lang)}</span>
                    <span className="ml-1 text-sm text-muted">{t.billing.perMonth}</span>
                  </p>
                  <Link href={tryHref} className="mt-5 rounded-lg border border-line-strong px-4 py-2 text-center text-sm font-semibold text-fg-2 transition hover:border-accent hover:text-accent-fg">
                    {L.try}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ---- questions ---- */}
        <section className="py-10">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{L.faqTitle}</h2>
          <div className="mt-6 divide-y divide-line rounded-2xl border border-line bg-surface shadow-xs">
            {L.faq.map((item) => (
              <details key={item.q} className="group px-5 py-4">
                <summary className="cursor-pointer list-none font-semibold marker:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {item.q}
                    <span className="text-xl leading-none text-muted transition group-open:rotate-45">+</span>
                  </span>
                </summary>
                <p className="mt-2 text-fg-2">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-line bg-gradient-to-br from-accent/15 via-surface to-brand-cyan/10 px-6 py-10 text-center sm:px-10">
          <h2 className="text-2xl font-bold tracking-tight sm:text-4xl">
            {L.titleA} <span className="text-accent-fg">{L.titleB}</span>
          </h2>
          <Link href={tryHref} className="mt-6 inline-block rounded-xl bg-accent px-6 py-3.5 text-base font-semibold text-on-accent shadow-sm transition hover:bg-accent-hover">
            {L.try}
          </Link>
          <p className="mt-3 text-sm text-muted">{L.note}</p>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            © {new Date().getFullYear()} {brixa?.company_name || "BRIXA"}. {L.rights}
            {brixa?.email && (
              <>
                {" "}
                <a href={`mailto:${brixa.email}`} className="break-all text-fg-2 hover:text-fg">
                  {brixa.email}
                </a>
              </>
            )}
          </p>
          <nav className="flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/terms" className="hover:text-fg">
              {L.terms}
            </Link>
            <Link href="/privacy" className="hover:text-fg">
              {L.privacy}
            </Link>
            <Link href="/dpa" className="hover:text-fg">
              {L.dpa}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
