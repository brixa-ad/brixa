"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { LogOut, Menu, X } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { MENU_EXTRAS, NAV_HREF, pageFor, sectionActive, sectionHref, type MenuSection } from "@/lib/nav";
import { Avatar } from "./Avatar";
import { useI18n } from "./I18nProvider";
import { Logo } from "./Logo";
import { NavIcon } from "./NavIcon";

/** ☰ — the eight sections (with their pages underneath) in a panel that slides in from the left. */
export function SideMenu({
  sections,
  name,
  subtitle,
  avatarPath,
  unread,
}: {
  sections: MenuSection[];
  name: string;
  subtitle: string;
  avatarPath: string | null;
  unread: number;
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // The panel is rendered on <body>: the blurred top bar would otherwise trap a fixed panel inside it.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    // Keep the page behind still while the menu is open.
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t.nav.menu}
        aria-expanded={open}
        className="-ml-1.5 grid size-9 shrink-0 place-items-center rounded-lg text-fg-2 transition hover:bg-raised hover:text-fg"
      >
        <Menu className="size-5" />
      </button>

      {mounted &&
        createPortal(
          <div
            className={`fixed inset-0 z-50 transition ${open ? "visible" : "invisible"}`}
            aria-hidden={!open}
            role="dialog"
            aria-modal="true"
            aria-label={t.nav.menu}
          >
            <div
              onClick={() => setOpen(false)}
              className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
            />
            <aside
              className={`absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col border-r border-line bg-surface pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-2xl transition-transform duration-200 ease-out ${
                open ? "translate-x-0" : "-translate-x-full"
              }`}
            >
              <div className="flex h-16 items-center justify-between px-4">
                <Logo />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={t.common.cancel}
                  className="grid size-9 place-items-center rounded-lg text-muted transition hover:bg-raised hover:text-fg"
                >
                  <X className="size-5" />
                </button>
              </div>

              <Link
                href="/profile"
                onClick={() => setOpen(false)}
                className="mx-3 mb-2 flex items-center gap-3 rounded-xl border border-line bg-raised/50 p-3"
              >
                <Avatar path={avatarPath} name={name} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{name}</p>
                  <p className="truncate text-xs text-muted">{subtitle}</p>
                </div>
              </Link>

              <nav className="flex-1 overflow-y-auto px-3 py-2">
                {[sections.filter((s) => !MENU_EXTRAS.includes(s.key)), sections.filter((s) => MENU_EXTRAS.includes(s.key))].map((group, g) => (
                  <ul key={g} className={g === 1 ? "mt-2 space-y-0.5 border-t border-line pt-2" : "space-y-0.5"}>
                    {group.map((section) => {
                      const active = sectionActive(section, pathname);
                      const page = pageFor(pathname, section.pages);
                      return (
                        <li key={section.key}>
                          <Link
                            href={sectionHref(section)}
                            onClick={() => setOpen(false)}
                            aria-current={active ? "page" : undefined}
                            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                              active ? "bg-accent-soft text-accent-fg" : "text-fg-2 hover:bg-raised hover:text-fg"
                            }`}
                          >
                            <NavIcon name={section.key} className="size-5" />
                            <span className="flex-1">{t.menu.sections[section.key]}</span>
                            {section.key === "notifications" && unread > 0 && (
                              <span className="rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">
                                {unread > 9 ? "9+" : unread}
                              </span>
                            )}
                          </Link>
                          {/* the section's pages, one tap away */}
                          {section.pages.length > 1 && (
                            <div className="mb-1 ml-11 flex flex-wrap gap-x-3 gap-y-1 pb-1">
                              {section.pages.map((p) => (
                                <Link
                                  key={p}
                                  href={NAV_HREF[p]}
                                  onClick={() => setOpen(false)}
                                  className={`text-xs transition ${p === page ? "font-semibold text-accent-fg" : "text-muted hover:text-fg"}`}
                                >
                                  {(t.menu.tabs as Partial<Record<string, string>>)[p] ?? t.nav[p]}
                                </Link>
                              ))}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ))}
              </nav>

              <form action={signOut} className="border-t border-line p-3">
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted transition hover:bg-raised hover:text-fg"
                >
                  <LogOut className="size-5" />
                  {t.common.signOut}
                </button>
              </form>
            </aside>
          </div>,
          document.body,
        )}
    </>
  );
}
