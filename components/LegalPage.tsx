import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LEGAL, LEGAL_ORDER, LEGAL_PATH, fillLegal, legalDate, LEGAL_UPDATED, providerLine, providerRows, type LegalBlock, type LegalKind } from "@/lib/legal";
import { anonymous } from "@/lib/share";
import { getTheme } from "@/lib/theme-server";

/** BRIXA's company details from its panel (the legal pages and the landing page). */
export async function getProviderDetails() {
  const { data } = await anonymous()
    .from("platform_settings")
    .select("company_name, eik, vat_number, address, representative, email, phone, website, trial_days")
    .maybeSingle();
  return data;
}

/** One block of a legal text: a paragraph, a list, or BRIXA's details. */
export function LegalBlocks({ blocks, fill, provider }: { blocks: LegalBlock[]; fill: (text: string) => string; provider: [string, string][] }) {
  return (
    <>
      {blocks.map((block, i) =>
        block === "@provider" ? (
          <dl key={i} className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 rounded-xl border border-line bg-surface p-4 text-sm sm:grid-cols-[auto_1fr]">
            {provider.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted">{label}</dt>
                <dd className="font-medium text-fg-2">{value}</dd>
              </div>
            ))}
          </dl>
        ) : typeof block === "string" ? (
          <p key={i} className="mt-3 leading-relaxed text-fg-2">
            {fill(block)}
          </p>
        ) : (
          <ul key={i} className="mt-3 list-disc space-y-1.5 pl-5 leading-relaxed text-fg-2 marker:text-faint">
            {block.map((item) => (
              <li key={item.slice(0, 50)}>{fill(item)}</li>
            ))}
          </ul>
        )
      )}
    </>
  );
}

/** The links to every legal document (the footer of the legal pages and the landing). */
export function LegalNav({ current }: { current?: LegalKind }) {
  return (
    <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
      {LEGAL_ORDER.map((kind) => (
        <Link key={kind} href={LEGAL_PATH[kind]} aria-current={kind === current ? "page" : undefined} className={kind === current ? "font-medium text-fg" : "hover:text-fg"}>
          {LEGAL[kind].short}
        </Link>
      ))}
    </nav>
  );
}

/** One of BRIXA's legal documents, with BRIXA's company details from its panel. */
export async function LegalPage({ kind }: { kind: LegalKind }) {
  const [theme, details] = await Promise.all([getTheme(), getProviderDetails()]);
  const doc = LEGAL[kind];
  const fill = (text: string) => fillLegal(text, { provider: providerLine(details), trialDays: details?.trial_days ?? 30 });
  const provider = providerRows(details);

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
        <p className="mt-2 text-sm text-muted">Последна промяна: {legalDate(LEGAL_UPDATED)}</p>
        <p className="mt-6 leading-relaxed text-fg-2">{fill(doc.intro)}</p>
        {doc.sections.map((section) => (
          <section key={section.title} className="mt-8">
            <h2 className="text-lg font-semibold">{section.title}</h2>
            <LegalBlocks blocks={section.body} fill={fill} provider={provider} />
          </section>
        ))}
        {details?.email && (
          <p className="mt-10 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-fg-2">
            Въпроси: <a href={`mailto:${details.email}`} className="break-all font-medium text-accent-fg">{details.email}</a>
          </p>
        )}
        <div className="mt-10 border-t border-line pt-6">
          <LegalNav current={kind} />
        </div>
      </main>
    </div>
  );
}
