"use client";

import { useState } from "react";
import { BellRing, Loader2 } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass } from "@/components/ui/form";
import { usePush } from "./usePush";

const DISMISS_KEY = "brixa.pushBannerDismissedAt";
const DISMISS_DAYS = 7;

function dismissedLately() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

/** Home screen nudge to turn on phone notifications (hidden for a week after "Later"). */
export function PushBanner() {
  const { t } = useI18n();
  const { status, busy, failed, enable } = usePush();
  const [hidden, setHidden] = useState(false);

  // Only once we know this device can get them and doesn't yet.
  if (status !== "off" || hidden || dismissedLately()) return null;

  return (
    <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-accent/30 bg-accent-soft/50 p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-on-accent">
        <BellRing className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{t.push.bannerTitle}</p>
        <p className="text-xs text-muted">{failed ? t.push.failed : t.push.bannerText}</p>
      </div>
      <div className="flex w-full gap-2 sm:w-auto">
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.setItem(DISMISS_KEY, String(Date.now()));
            } catch {}
            setHidden(true);
          }}
          className={`${buttonClass.ghost} flex-1 sm:flex-none`}
        >
          {t.push.later}
        </button>
        <button type="button" disabled={busy} onClick={enable} className={`${buttonClass.primary} flex-1 sm:flex-none`}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {t.push.enable}
        </button>
      </div>
    </section>
  );
}
