"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Loader2, RefreshCw } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui/form";
import { resetCalendarToken } from "./actions";

/** The private address to paste into Google Calendar → Other calendars → From URL. */
export function GoogleCalendarLink({ url }: { url: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-fg-2">
        <li>{t.calendar.step1}</li>
        <li>{t.calendar.step2}</li>
        <li>{t.calendar.step3}</li>
      </ol>
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        aria-label={t.calendar.googleTitle}
        className={`${inputClass} font-mono sm:text-xs!`}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2500);
            } catch {}
          }}
          className={buttonClass.primary}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? t.calendar.copied : t.calendar.copy}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(t.calendar.resetConfirm)) return;
            startTransition(async () => {
              await resetCalendarToken();
            });
          }}
          className={buttonClass.ghost}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {t.calendar.reset}
        </button>
      </div>
      <p className="text-xs text-muted">{t.calendar.private}</p>
    </div>
  );
}
