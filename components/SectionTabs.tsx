"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { NAV_HREF, hrefPath, pageFor, type MenuSection, type NavKey } from "@/lib/nav";
import { useI18n } from "./I18nProvider";
import { NavIcon } from "./NavIcon";

/**
 * The tabs of a section on top of its pages (Clients | Follow-up | New contacts | Colleagues), and
 * under them the open tab's quick filters (All | Buyers | Sellers…). Only on the pages themselves —
 * not on a task, a client or a form inside them.
 */
export function SectionTabs({ sections }: { sections: MenuSection[] }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const section = sections.find((s) => s.pages.length > 1 && s.pages.some((page) => hrefPath(page) === pathname));
  if (!section) return null;
  const current = pageFor(pathname, section.pages, searchParams);
  const openTab = section.tabs.find((tab) => current !== null && tab.pages.includes(current));
  const named = (group: Record<string, string>, page: NavKey) =>
    (group as Partial<Record<NavKey, string>>)[page] ?? (t.menu.tabs as Partial<Record<NavKey, string>>)[page] ?? t.nav[page];

  return (
    <div className="mb-5 space-y-2 print:hidden">
      {section.tabs.length > 1 && (
        <nav className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1" aria-label={t.menu.sections[section.key]}>
          {section.tabs.map((tab) => {
            const active = tab === openTab;
            return (
              <Link
                key={tab.key}
                href={NAV_HREF[tab.pages[0]]}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active ? "bg-accent text-on-accent" : "text-muted hover:text-fg"
                }`}
              >
                <NavIcon name={tab.key} className="size-4 shrink-0" />
                {named(t.menu.tabTitles, tab.key)}
              </Link>
            );
          })}
        </nav>
      )}
      {openTab && openTab.pages.length > 1 && (
        <nav className="flex gap-1.5 overflow-x-auto pb-0.5" aria-label={named(t.menu.tabTitles, openTab.key)}>
          {openTab.pages.map((page) => {
            const active = page === current;
            return (
              <Link
                key={page}
                href={NAV_HREF[page]}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                  active ? "border-accent bg-accent-soft text-accent-fg" : "border-line text-muted hover:border-line-strong hover:text-fg"
                }`}
              >
                {named(t.menu.chips, page)}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
