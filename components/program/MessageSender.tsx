"use client";

import { useState } from "react";
import { Check, Copy, Mail, MessageCircle, MessageSquareText, Send } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui/form";
import { internationalPhone, viberHref, whatsappHref } from "@/lib/phone";

/**
 * A ready message the broker can adjust, then send in one tap: Viber (the text is copied and the
 * chat opens), SMS and WhatsApp (the text is typed in), e-mail, or just copy it.
 */
export function MessageSender({
  text: initial,
  phone,
  email,
  subject,
  compact = false,
  onSend,
}: {
  text: string;
  phone: string | null | undefined;
  email: string | null | undefined;
  subject?: string;
  /** a short line of buttons, no text box (the greetings list) */
  compact?: boolean;
  /** the message went out (with its final words) */
  onSend?: (text: string) => void;
}) {
  const { t } = useI18n();
  const [text, setText] = useState(initial);
  const [note, setNote] = useState<"copied" | "viber" | null>(null);

  async function copy(then?: () => void, mark: "copied" | "viber" = "copied") {
    try {
      await navigator.clipboard.writeText(text);
      setNote(mark);
    } catch {}
    then?.();
  }

  const smsHref = phone ? `sms:${internationalPhone(phone)}?&body=${encodeURIComponent(text)}` : null;
  const mailHref = email
    ? `mailto:${email}?${new URLSearchParams({ ...(subject ? { subject } : {}), body: text }).toString().replace(/\+/g, "%20")}`
    : null;
  const button = compact
    ? "inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-semibold text-fg-2 transition hover:bg-raised"
    : buttonClass.secondary;

  return (
    <div className="space-y-2.5">
      {!compact && (
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={2000} className={`${inputClass} leading-relaxed`} />
      )}
      <div className="flex flex-wrap gap-2">
        {phone && (
          <button
            type="button"
            onClick={() => {
              onSend?.(text);
              void copy(() => (window.location.href = viberHref(phone)), "viber");
            }}
            className={compact ? button : `${buttonClass.primary}`}
          >
            <MessageCircle className="size-4" />
            {t.programs.viber}
          </button>
        )}
        {smsHref && (
          <a href={smsHref} onClick={() => onSend?.(text)} className={button}>
            <MessageSquareText className="size-4" />
            {t.programs.sms}
          </a>
        )}
        {phone && (
          <a href={whatsappHref(phone, text)} target="_blank" rel="noreferrer" onClick={() => onSend?.(text)} className={button}>
            <Send className="size-4" />
            {t.programs.whatsapp}
          </a>
        )}
        {mailHref && (
          <a href={mailHref} onClick={() => onSend?.(text)} className={button}>
            <Mail className="size-4" />
            {t.programs.email}
          </a>
        )}
        <button type="button" onClick={() => copy()} className={button}>
          {note === "copied" ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
          {note === "copied" ? t.programs.copied : t.programs.copy}
        </button>
      </div>
      {note === "viber" && <p className="text-xs font-medium text-success">{t.programs.viberCopied}</p>}
    </div>
  );
}
