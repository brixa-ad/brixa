"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { sectionActive, sectionHref, type MenuSection } from "@/lib/nav";
import { useI18n } from "./I18nProvider";
import { NavIcon } from "./NavIcon";

/**
 * App-style tab bar on phones, with the sections the user picked in Settings.
 * Hidden on screens with their own fixed save bar at the bottom.
 */
export function BottomNav({ items }: { items: MenuSection[] }) {
  const { t } = useI18n();
  const pathname = usePathname();

  // a conversation keeps the bottom for writing
  if (/\/(new|edit)$/.test(pathname) || pathname.startsWith("/team/goals") || /^\/chat\/[0-9a-f-]{36}$/.test(pathname)) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden print:hidden">
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((section) => {
          const active = sectionActive(section, pathname);
          return (
            <li key={section.key}>
              <Link
                href={sectionHref(section)}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 pb-2 pt-2.5 text-[11px] font-medium transition ${
                  active ? "text-accent-fg" : "text-muted"
                }`}
              >
                <NavIcon name={section.key} className="size-5" strokeWidth={active ? 2.4 : 2} />
                <span className="max-w-full truncate px-1">{t.menu.short[section.key]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
