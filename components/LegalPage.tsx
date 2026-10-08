import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { formatDate } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { LEGAL, LEGAL_UPDATED, providerLine, type LegalKind } from "@/lib/legal";
import { anonymous } from "@/lib/share";
import { getTheme } from "@/lib/theme-server";

/** One of BRIXA's legal documents, with BRIXA's company details from its panel. */
export async function LegalPage({ kind }: { kind: LegalKind }) {
  const [{ t }, theme, { data: details }] = await Promise.all([
    getI18n(),
    getTheme(),
    anonymous().from("platform_settings").select("company_name, eik, address, email").maybeSingle(),
  ]);
  const doc = LEGAL[kind];
  const provider = providerLine(details);
  const L = t.landing;

  return (
    <div className="min-h-screen">
      <header className="border-b border-line pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link href="/welcome" aria-label="BRIXA">
            <Logo />
          </Link>
          <ThemeToggle initialTheme={theme} />
        </div>
      </header>
      <main lang="bg" className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight">{doc.title}</h1>
        <p className="mt-2 text-sm text-muted">Последна промяна: {formatDate(LEGAL_UPDATED, "bg")}</p>
        <p className="mt-6 leading-relaxed text-fg-2">{doc.intro.split("{provider}").join(provider)}</p>
        {doc.sections.map((section) => (
          <section key={section.title} className="mt-8">
            <h2 className="text-lg font-semibold">{section.title}</h2>
            {section.paragraphs.map((p) => (
              <p key={p.slice(0, 40)} className="mt-3 leading-relaxed text-fg-2">
                {p}
              </p>
            ))}
          </section>
        ))}
        {details?.email && (
          <p className="mt-10 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-fg-2">
            Въпроси: <a href={`mailto:${details.email}`} className="break-all font-medium text-accent-fg">{details.email}</a>
          </p>
        )}
        <nav className="mt-10 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-6 text-sm text-muted">
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
      </main>
    </div>
  );
}
