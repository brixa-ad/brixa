"use client";

import { useState, useTransition } from "react";
import { FileSearch, Loader2 } from "lucide-react";
import { createSearchShare } from "@/app/(app)/clients/share-actions";
import { useI18n } from "@/components/I18nProvider";
import { SendLink, linkUrl } from "@/components/property/LinkDialog";
import { NoteArea } from "@/components/ui/Dictate";
import { buttonClass } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";

/** "Share the search": a page with the criteria and my contact for colleagues — saved as a PDF by them if they like. */
export function ShareSearchDialog({ clientId }: { clientId: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  function start() {
    setComment("");
    setUrl(null);
    setFailed(false);
    setOpen(true);
  }

  function create() {
    setFailed(false);
    startTransition(async () => {
      const result = await createSearchShare(clientId, comment);
      if (result.ok) setUrl(linkUrl("search", result.token));
      else setFailed(true);
    });
  }

  return (
    <>
      <button type="button" onClick={start} className={buttonClass.secondary}>
        <FileSearch className="size-4" />
        {t.clients.shareSearch}
      </button>
      {open && (
        <Modal title={t.clients.shareSearchTitle} onClose={() => setOpen(false)}>
          <p className="mb-4 text-sm text-muted">{t.clients.shareSearchHint}</p>
          {!url ? (
            <>
              <label className="mb-1.5 block text-sm font-medium text-fg-2" htmlFor="search-share-comment">
                {t.clients.shareSearchComment}
              </label>
              <NoteArea
                id="search-share-comment"
                rows={3}
                maxLength={1000}
                value={comment}
                onChange={setComment}
                placeholder={t.clients.shareSearchCommentPlaceholder}
              />
              {failed && <p className="mt-3 text-sm text-danger">{t.errors.generic}</p>}
              <button type="button" onClick={create} disabled={pending} className={`${buttonClass.primary} mt-5 w-full`}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                {t.share.create}
              </button>
            </>
          ) : (
            <SendLink url={url} subject={t.searchShare.pageTitle} text={t.clients.shareSearchMessage} phone={null} email={null} />
          )}
        </Modal>
      )}
    </>
  );
}
