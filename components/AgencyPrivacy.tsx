import { agencyNotice, type AgencyContact } from "@/lib/legal";

/** Where a form points to: the notice at the bottom of the page. */
export const PRIVACY_ANCHOR = "lichni-danni";

/**
 * How the agency handles the personal data of the people it reaches through BRIXA (чл. 13 ОРЗД),
 * in its name — folded at the bottom of its public pages; a form links to it.
 */
export function AgencyPrivacy({ agency, className = "" }: { agency: AgencyContact; className?: string }) {
  const doc = agencyNotice(agency);
  return (
    <details id={PRIVACY_ANCHOR} lang="bg" className={`group text-left print:hidden ${className}`}>
      <summary className="cursor-pointer list-none text-center text-xs font-medium text-muted underline-offset-2 hover:text-fg hover:underline">
        {doc.title}
      </summary>
      <div className="mt-4 space-y-4 rounded-2xl border border-line bg-surface p-4 text-sm leading-relaxed text-fg-2 sm:p-5">
        <p>{doc.intro}</p>
        {doc.sections.map((section) => (
          <section key={section.title}>
            <h3 className="font-semibold text-fg">{section.title}</h3>
            {section.body.map((block, i) =>
              typeof block === "string" ? (
                <p key={i} className="mt-1.5">
                  {block}
                </p>
              ) : (
                <ul key={i} className="mt-1.5 list-disc space-y-1 pl-5 marker:text-faint">
                  {block.map((item) => (
                    <li key={item.slice(0, 50)}>{item}</li>
                  ))}
                </ul>
              )
            )}
          </section>
        ))}
        <p className="text-xs text-muted">
          BRIXA обработва данните от името на агенцията —{" "}
          <a href="/subprocessors" className="underline underline-offset-2 hover:text-fg">
            подизпълнители
          </a>{" "}
          и{" "}
          <a href="/security" className="underline underline-offset-2 hover:text-fg">
            мерки за сигурност
          </a>
          .
        </p>
      </div>
    </details>
  );
}

/** The line under a form's button: the agency's notice, below on the same page. */
export function FormPrivacyLink({ agency }: { agency: string }) {
  return (
    <p lang="bg" className="text-center text-xs text-muted">
      <a href={`#${PRIVACY_ANCHOR}`} className="underline underline-offset-2 hover:text-fg">
        Как {agency || "агенцията"} обработва личните ви данни
      </a>
    </p>
  );
}
