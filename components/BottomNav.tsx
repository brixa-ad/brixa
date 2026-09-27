"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_HREF, isActive, type NavKey } from "@/lib/nav";
import { useI18n } from "./I18nProvider";
import { NavIcon } from "./NavIcon";

/**
 * App-style tab bar on phones, with the sections the user picked in Settings.
 * Hidden on screens with their own fixed save bar at the bottom.
 */
export function BottomNav({ items }: { items: NavKey[] }) {
  const { t } = useI18n();
  const pathname = usePathname();

  if (/\/(new|edit)$/.test(pathname) || pathname.startsWith("/team/goals")) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((key) => {
          const href = NAV_HREF[key];
          const active = isActive(href, pathname);
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 pb-2 pt-2.5 text-[11px] font-medium transition ${
                  active ? "text-accent-fg" : "text-muted"
                }`}
              >
                <NavIcon name={key} className="size-5" strokeWidth={active ? 2.4 : 2} />
                <span className="max-w-full truncate px-1">{t.nav[key]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
