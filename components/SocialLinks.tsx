import { SOCIAL_COLOR, SOCIAL_KEYS, SOCIAL_LABEL, type Socials } from "@/lib/socials";

/** The broker's social networks as buttons (nothing when there are none). */
export function SocialLinks({ socials, className = "" }: { socials: Socials | null | undefined; className?: string }) {
  const keys = SOCIAL_KEYS.filter((key) => socials?.[key]);
  if (keys.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-2 print:hidden ${className}`}>
      {keys.map((key) => (
        <a
          key={key}
          href={socials![key]}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 py-1.5 text-xs font-semibold text-fg-2 transition hover:text-fg"
        >
          <span className="size-2 rounded-full" style={{ backgroundColor: SOCIAL_COLOR[key] }} aria-hidden />
          {SOCIAL_LABEL[key]}
        </a>
      ))}
    </div>
  );
}
