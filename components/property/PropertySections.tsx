"use client";

import { useEffect, useSyncExternalStore } from "react";
import { FileText, LineChart, Megaphone, Users } from "lucide-react";

export type PropertySection = {
  key: "work" | "market" | "marketing" | "papers";
  label: string;
  /** the places inside it a link may point at (#market, #history…) */
  anchors: string[];
  content: React.ReactNode;
};

const ICONS = { work: Users, market: LineChart, marketing: Megaphone, papers: FileText } as const;

const subscribe = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};
const readHash = () => window.location.hash.slice(1);

/**
 * The listing's working parts under it, one at a time: clients and deals, the market, the marketing,
 * the papers. The open one follows the address (#tab-market, or a link to #history inside it).
 */
export function PropertySections({ sections }: { sections: PropertySection[] }) {
  const hash = useSyncExternalStore(subscribe, readHash, () => "");
  const wanted = hash.startsWith("tab-") ? hash.slice(4) : hash;
  const open = sections.find((s) => s.key === wanted || s.anchors.includes(wanted))?.key ?? sections[0]?.key;

  // a link to a place inside a section: show it, then go there
  useEffect(() => {
    if (!hash || hash.startsWith("tab-")) return;
    document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hash]);

  if (sections.length === 0) return null;
  return (
    <div className="space-y-5">
      <nav className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-20 -mx-1 flex gap-1 overflow-x-auto rounded-2xl border border-line bg-surface/95 p-1 backdrop-blur print:hidden">
        {sections.map((section) => {
          const Icon = ICONS[section.key];
          const active = section.key === open;
          return (
            <a
              key={section.key}
              href={`#tab-${section.key}`}
              aria-current={active ? "true" : undefined}
              className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active ? "bg-accent text-on-accent" : "text-muted hover:text-fg"
              }`}
            >
              <Icon className="size-4 shrink-0" />
              {section.label}
            </a>
          );
        })}
      </nav>
      {sections.map((section) => (
        <div key={section.key} hidden={section.key !== open} className="space-y-5">
          {section.content}
        </div>
      ))}
    </div>
  );
}
