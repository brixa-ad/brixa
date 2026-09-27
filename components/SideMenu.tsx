"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { LogOut, Menu, X } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { NAV_HREF, isActive, type NavKey } from "@/lib/nav";
import { Avatar } from "./Avatar";
import { useI18n } from "./I18nProvider";
import { Logo } from "./Logo";
import { NavIcon } from "./NavIcon";

/** ☰ — every section of the app in a panel that slides in from the left. */
export function SideMenu({
  items,
  name,
  subtitle,
  avatarPath,
  unread,
}: {
  items: NavKey[];
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
                <ul className="space-y-0.5">
                  {items.map((key) => {
                    const href = NAV_HREF[key];
                    const active = isActive(href, pathname);
                    return (
                      <li key={key}>
                        <Link
                          href={href}
                          onClick={() => setOpen(false)}
                          aria-current={active ? "page" : undefined}
                          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                            active ? "bg-accent-soft text-accent-fg" : "text-fg-2 hover:bg-raised hover:text-fg"
                          }`}
                        >
                          <NavIcon name={key} className="size-5" />
                          <span className="flex-1">{t.nav[key]}</span>
                          {key === "notifications" && unread > 0 && (
                            <span className="rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">
                              {unread > 9 ? "9+" : unread}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
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
