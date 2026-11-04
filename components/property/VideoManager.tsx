"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { Card, buttonClass } from "@/components/ui/form";
import { createClient } from "@/lib/supabase/client";
import { cleanVideoLinks, cleanVideoUrl } from "@/lib/video";
import { saveVideo } from "@/lib/video-upload";
import { VideoFields, type VideoFile } from "./VideoFields";

/**
 * Edit-mode video, next to the photos: a video chosen is uploaded at once (the one before goes),
 * removing it is saved at once, the links with their button. Give it a key of what is saved, so
 * it starts again from that after the page refreshes.
 */
export function VideoManager({
  propertyId,
  organizationId,
  video,
  links,
}: {
  propertyId: string;
  organizationId: string;
  video: { url: string | null; path: string | null };
  links: string[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const [file, setFile] = useState<VideoFile>({ current: video.url, next: null, remove: false });
  const [draft, setDraft] = useState<string[]>(links);
  const working = busy || refreshing;
  const changed = draft.join("\n") !== links.join("\n");

  async function changeFile(next: VideoFile) {
    if (!next.next && !next.remove) return;
    if (next.remove && !window.confirm(t.video.removeConfirm)) return;
    // the new one shows (from the phone) while it uploads; a removed one is gone at once
    setFile(next);
    setBusy(true);
    setError(null);
    const ok = await saveVideo(createClient(), { organizationId, propertyId, file: next.next, oldPath: video.path });
    setBusy(false);
    if (!ok) {
      setFile({ current: video.url, next: null, remove: false });
      setError(t.video.saveFailed);
    }
    startRefresh(() => router.refresh());
  }

  async function saveLinks() {
    if (draft.some((link) => link.trim() && !cleanVideoUrl(link))) {
      setError(t.video.badLink);
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: failed } = await createClient()
      .from("properties")
      .update({ video_links: cleanVideoLinks(draft) })
      .eq("id", propertyId)
      .select("id");
    setBusy(false);
    if (failed || !data?.length) setError(t.errors.generic);
    startRefresh(() => router.refresh());
  }

  return (
    <Card
      id="video"
      title={
        <span className="flex items-center gap-2">
          {t.video.title}
          {working && <Loader2 className="size-4 animate-spin text-accent-fg" />}
        </span>
      }
      description={busy && file.next ? t.video.uploading : t.video.savedAtOnce}
    >
      <VideoFields links={draft} onLinks={setDraft} file={file} onFile={changeFile} disabled={working} />
      {changed && (
        <button type="button" onClick={saveLinks} disabled={working} className={`${buttonClass.primary} mt-4`}>
          <Save className="size-4" />
          {t.video.saveLinks}
        </button>
      )}
      {error && <p className="mt-3 text-sm font-medium text-danger">{error}</p>}
    </Card>
  );
}
