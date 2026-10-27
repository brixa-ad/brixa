"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass } from "@/components/ui/form";
import { fileThumbnail } from "@/lib/photos";

/** "Write it with Brix": a listing's description (and a title when there's none) from its details and photos. */
export function BrixDescribe({
  facts,
  neighborhoodId,
  propertyId,
  photos,
  draft,
  onWritten,
}: {
  facts: () => string;
  neighborhoodId: string | null;
  propertyId: string | null;
  /** photos picked but not yet uploaded (a new listing); a saved listing's own are read by the server */
  photos: File[];
  /** what's in the box now: Brix keeps its facts */
  draft: string;
  onWritten: (text: { title: string; description: string }) => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function write() {
    if (draft.trim().length > 200 && !window.confirm(t.form.brixReplace)) return;
    setBusy(true);
    setError(null);
    try {
      const images = (await Promise.all(photos.slice(0, 4).map(fileThumbnail))).filter((x): x is string => Boolean(x));
      const response = await fetch("/api/brix/describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facts: facts(), neighborhoodId, propertyId, images, draft }),
      });
      const data = (await response.json().catch(() => ({}))) as { title?: string; description?: string; error?: string };
      if (!response.ok || !data.description) {
        setError(data.error === "limit" ? t.brix.limit : data.error === "not_configured" ? t.brix.notConfigured : t.brix.failed);
      } else {
        onWritten({ title: data.title ?? "", description: data.description });
      }
    } catch {
      setError(t.brix.failed);
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/30 bg-accent-soft/30 p-3">
      <button type="button" onClick={write} disabled={busy} className={`${buttonClass.primary} px-3! py-1.5!`}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {busy ? t.form.brixWriting : t.form.brixWrite}
      </button>
      <span className="min-w-0 flex-1 text-xs text-muted">{error ?? t.form.brixWriteHint}</span>
    </div>
  );
}
