"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_HREF, pageFor, type MenuSection, type NavKey } from "@/lib/nav";
import { useI18n } from "./I18nProvider";
import { NavIcon } from "./NavIcon";

/**
 * The tabs of a section on top of its pages (Tasks | Calendar | Follow-up…). Only on the pages
 * themselves — not on a task, a client or a form inside them.
 */
export function SectionTabs({ sections }: { sections: MenuSection[] }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const section = sections.find((s) => s.pages.length > 1 && s.pages.some((page) => NAV_HREF[page] === pathname));
  if (!section) return null;
  const current = pageFor(pathname, section.pages);
  const label = (page: NavKey) => (t.menu.tabs as Partial<Record<NavKey, string>>)[page] ?? t.nav[page];

  return (
    <nav className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1 print:hidden" aria-label={t.menu.sections[section.key]}>
      {section.pages.map((page) => {
        const active = page === current;
        return (
          <Link
            key={page}
            href={NAV_HREF[page]}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
              active ? "bg-accent text-on-accent" : "text-muted hover:text-fg"
            }`}
          >
            <NavIcon name={page} className="size-4 shrink-0" />
            {label(page)}
          </Link>
        );
      })}
    </nav>
  );
}
