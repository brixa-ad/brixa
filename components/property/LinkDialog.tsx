"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Mail, MessageCircle, Share2 } from "lucide-react";
import { Modal, useMounted } from "@/components/ui/Modal";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui/form";
import { whatsappHref } from "@/lib/phone";

export { Modal };

export type LinkKind = "listing" | "report" | "search" | "analysis";

/** The public page a token opens: /p/… a shared listing, /r/… an owner's report, /s/… a shared search. */
export const linkUrl = (kind: LinkKind, token: string) =>
  `${window.location.origin}/${kind === "report" ? "r" : kind === "search" ? "s" : kind === "analysis" ? "a" : "p"}/${token}`;

/** The link, ready to copy or send by Viber, WhatsApp, email or the phone's own share sheet. */
export function SendLink({
  url,
  subject,
  text,
  phone,
  email,
}: {
  url: string;
  subject: string;
  /** the message before the link */
  text: string;
  phone: string | null;
  email: string | null;
}) {
  const { t } = useI18n();
  const mounted = useMounted();
  const [copied, setCopied] = useState(false);
  const message = `${text}\n${url}`;
  const canShare = mounted && typeof navigator.share === "function";
  const sendButton =
    "inline-flex items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm font-semibold text-fg-2 transition hover:bg-raised";

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(t.share.copy, url);
    }
  }

  return (
    <>
      <div className="flex gap-2">
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className={`${inputClass} min-w-0 flex-1`} />
        <button type="button" onClick={copy} className={`${buttonClass.primary} shrink-0`}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? t.share.copied : t.share.copy}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <a href={`viber://forward?text=${encodeURIComponent(message)}`} className={sendButton}>
          <MessageCircle className="size-4 text-[#7360f2]" />
          {t.share.viber}
        </a>
        <a href={whatsappHref(phone, message)} target="_blank" rel="noopener noreferrer" className={sendButton}>
          <MessageCircle className="size-4 text-[#25d366]" />
          {t.share.whatsapp}
        </a>
        <a
          href={`mailto:${email ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`}
          className={sendButton}
        >
          <Mail className="size-4" />
          {t.share.email}
        </a>
        {canShare ? (
          <button
            type="button"
            onClick={() => navigator.share({ title: subject, text, url }).catch(() => {})}
            className={sendButton}
          >
            <Share2 className="size-4" />
            {t.share.more}
          </button>
        ) : (
          <a href={url} target="_blank" rel="noopener noreferrer" className={sendButton}>
            <ExternalLink className="size-4" />
            {t.share.open}
          </a>
        )}
      </div>
      {canShare && (
        <a href={url} target="_blank" rel="noopener noreferrer" className={`${buttonClass.ghost} mt-3 w-full`}>
          <ExternalLink className="size-4" />
          {t.share.open}
        </a>
      )}
    </>
  );
}
