"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, House, ListChecks, UserRound, Users } from "lucide-react";
import { useI18n } from "./I18nProvider";

/**
 * App-style tab bar on phones. Hidden on create/edit screens, which have their own
 * fixed save bar at the bottom.
 */
export function BottomNav() {
  const { t } = useI18n();
  const pathname = usePathname();

  if (/\/(new|edit)$/.test(pathname)) return null;

  const tabs = [
    { href: "/", label: t.nav.home, icon: House },
    { href: "/tasks", label: t.nav.tasks, icon: ListChecks },
    { href: "/properties", label: t.nav.properties, icon: Building2 },
    { href: "/clients", label: t.nav.clients, icon: Users },
    { href: "/profile", label: t.nav.profile, icon: UserRound },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="grid grid-cols-5">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 pb-2 pt-2.5 text-[11px] font-medium transition ${
                  active ? "text-accent-fg" : "text-muted"
                }`}
              >
                <Icon className="size-5" strokeWidth={active ? 2.4 : 2} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
