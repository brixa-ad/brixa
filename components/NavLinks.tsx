"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { sectionActive, sectionHref, type MenuSection } from "@/lib/nav";
import { useI18n } from "./I18nProvider";

/** The main sections across the top bar (computers). */
export function NavLinks({ sections }: { sections: MenuSection[] }) {
  const { t } = useI18n();
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1">
      {sections.map((section) => {
        const active = sectionActive(section, pathname);
        return (
          <Link
            key={section.key}
            href={sectionHref(section)}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
              active ? "bg-raised text-fg" : "text-muted hover:text-fg"
            }`}
          >
            {t.menu.short[section.key]}
          </Link>
        );
      })}
    </nav>
  );
}
