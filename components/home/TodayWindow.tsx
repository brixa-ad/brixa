"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { buttonClass } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";

/** The day at a glance — what the morning notification opens: today's tasks, the clients to contact, the deal steps. */
export function TodayWindow({
  title,
  subtitle,
  closeLabel,
  allLabel,
  children,
}: {
  title: string;
  subtitle?: string;
  closeLabel: string;
  allLabel: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  // opened: the badge the morning notification left on the app's icon goes
  useEffect(() => {
    const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
    nav.clearAppBadge?.().catch(() => {});
  }, []);

  if (!open) return null;
  const close = () => {
    setOpen(false);
    // without ?today=1, so a reload doesn't open it again
    router.replace("/", { scroll: false });
  };

  return (
    <Modal title={title} onClose={close} wide>
      {subtitle && <p className="-mt-0.5 mb-4 text-sm capitalize text-muted">{subtitle}</p>}
      <div className="space-y-5">{children}</div>
      <div className="mt-5 flex gap-2 border-t border-line-soft pt-4">
        <Link href="/tasks" replace className={`${buttonClass.secondary} flex-1`}>
          {allLabel}
          <ArrowRight className="size-4" />
        </Link>
        <button type="button" onClick={close} className={`${buttonClass.primary} flex-1`}>
          {closeLabel}
        </button>
      </div>
    </Modal>
  );
}
