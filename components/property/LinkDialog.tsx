"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, ExternalLink, Mail, MessageCircle, Share2, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui/form";
import { whatsappHref } from "@/lib/phone";

export type LinkKind = "listing" | "report";

/** The public page a token opens: /p/… for a shared listing, /r/… for an owner's report. */
export const linkUrl = (kind: LinkKind, token: string) =>
  `${window.location.origin}/${kind === "report" ? "r" : "p"}/${token}`;

const useMounted = () =>
  useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

/** A sheet from the bottom on phones, a centred dialog on computers. Rendered on <body>. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const { t } = useI18n();
  const mounted = useMounted();
  // the latest onClose, without re-running the setup below on every keystroke
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && close.current();
    document.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, []);

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div onClick={onClose} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-line bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:pb-5">
        <div className="mb-1 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.cancel}
            className="-mr-2 -mt-1 grid size-9 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-raised hover:text-fg"
          >
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

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
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className={`${inputClass} min-w-0 flex-1 text-sm`} />
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
