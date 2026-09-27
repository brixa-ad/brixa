"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, ExternalLink, Mail, MessageCircle, Share2, X } from "lucide-react";
import { createShare } from "@/app/(app)/properties/share-actions";
import { useI18n } from "@/components/I18nProvider";
import { Combobox } from "@/components/ui/Combobox";
import { buttonClass, inputClass } from "@/components/ui/form";
import { fmt } from "@/lib/i18n/dictionaries";
import { whatsappHref } from "@/lib/phone";

export type ShareClient = { id: string; full_name: string; phone: string | null; email: string | null };

export const shareUrl = (token: string) => `${window.location.origin}/p/${token}`;

/** "Share": a private link to the listing's page, ready to send by Viber, WhatsApp or email. */
export function ShareDialog({
  propertyId,
  title,
  clients,
}: {
  propertyId: string;
  title: string;
  clients: ShareClient[];
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  const client = clients.find((c) => c.id === clientId) ?? null;
  const message = url ? `${fmt(t.share.message, { title })}\n${url}` : "";
  const canShare = mounted && typeof navigator.share === "function";

  function start() {
    setClientId(null);
    setUrl(null);
    setCopied(false);
    setFailed(false);
    setOpen(true);
  }

  function create() {
    setFailed(false);
    startTransition(async () => {
      const result = await createShare(propertyId, clientId);
      if (result.ok) setUrl(shareUrl(result.token));
      else setFailed(true);
    });
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(t.share.copy, url);
    }
  }

  const sendButton = "inline-flex items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm font-semibold text-fg-2 transition hover:bg-raised";

  return (
    <>
      <button type="button" onClick={start} className={buttonClass.secondary}>
        <Share2 className="size-4" />
        {t.share.button}
      </button>

      {mounted &&
        open &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={t.share.title}>
            <div onClick={() => setOpen(false)} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <div className="relative w-full max-w-md rounded-t-2xl border border-line bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:pb-5">
              <div className="mb-1 flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold">{t.share.title}</h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={t.common.cancel}
                  className="-mr-2 -mt-1 grid size-9 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-raised hover:text-fg"
                >
                  <X className="size-5" />
                </button>
              </div>
              <p className="mb-4 text-sm text-muted">{t.share.hint}</p>

              {!url ? (
                <>
                  <label className="mb-1.5 block text-sm font-medium text-fg-2">{t.share.forClient}</label>
                  <Combobox
                    options={clients.map((c) => ({ value: c.id, label: c.full_name, hint: c.phone ?? c.email ?? undefined }))}
                    value={clientId}
                    onChange={setClientId}
                    placeholder={t.share.noClient}
                    emptyText={t.location.noMatches}
                  />
                  {failed && <p className="mt-3 text-sm text-danger">{t.errors.generic}</p>}
                  <button type="button" onClick={create} disabled={pending} className={`${buttonClass.primary} mt-5 w-full`}>
                    {pending ? t.common.saving : t.share.create}
                  </button>
                </>
              ) : (
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
                    <a href={whatsappHref(client?.phone ?? null, message)} target="_blank" rel="noopener noreferrer" className={sendButton}>
                      <MessageCircle className="size-4 text-[#25d366]" />
                      {t.share.whatsapp}
                    </a>
                    <a
                      href={`mailto:${client?.email ?? ""}?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(message)}`}
                      className={sendButton}
                    >
                      <Mail className="size-4" />
                      {t.share.email}
                    </a>
                    {canShare ? (
                      <button
                        type="button"
                        onClick={() => navigator.share({ title, text: fmt(t.share.message, { title }), url }).catch(() => {})}
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
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
