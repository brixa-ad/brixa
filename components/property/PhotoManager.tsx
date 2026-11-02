"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { Card } from "@/components/ui/form";
import { fmt } from "@/lib/i18n/dictionaries";
import { MAX_PHOTOS, PHOTO_BUCKET, originalPathOf, preparePhoto, storePhoto, uploadPhotos } from "@/lib/photos";
import { createClient } from "@/lib/supabase/client";
import type { Photo } from "@/lib/types";
import { EnhanceSwitch, useEnhancePhotos } from "./EnhanceSwitch";
import { PhotoCompare } from "./PhotoCompare";
import { PhotoDropzone } from "./PhotoDropzone";
import { PhotoGrid } from "./PhotoGrid";

/** Edit-mode photo management — every change is saved immediately. */
export function PhotoManager({
  propertyId,
  organizationId,
  userId,
  photos,
}: {
  propertyId: string;
  organizationId: string;
  userId: string;
  photos: Photo[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const [enhance, setEnhance] = useEnhancePhotos();
  const [tips, setTips] = useState<string[]>([]);
  // the files in the listing's folder: which photos have their original kept
  const [files, setFiles] = useState<Set<string> | null>(null);
  const folder = `${organizationId}/${propertyId}`;
  const [open, setOpen] = useState<number | null>(null);
  const closeOpen = useCallback(() => setOpen(null), []);
  const originalUrl = useCallback(
    async (id: string) => {
      const photo = photos.find((p) => p.id === id);
      if (!photo) return null;
      const { data } = await createClient().storage.from(PHOTO_BUCKET).createSignedUrl(originalPathOf(photo.storage_path), 3600);
      return data?.signedUrl ?? null;
    },
    [photos]
  );

  // the order just chosen — shown at once, before the page reloads with it (photos added later go last)
  const [order, setOrder] = useState<string[] | null>(null);

  const working = busy || refreshing;
  const paths = photos.map((photo) => photo.storage_path).join("|");
  const rank = (photo: Photo) => {
    const index = order?.indexOf(photo.id) ?? -1;
    return index >= 0 ? index : 1_000_000 + photo.position;
  };
  const shown = order ? [...photos].sort((a, b) => rank(a) - rank(b)) : photos;

  useEffect(() => {
    let live = true;
    createClient()
      .storage.from(PHOTO_BUCKET)
      .list(folder, { limit: 200 })
      .then(({ data }) => {
        if (live) setFiles(new Set((data ?? []).map((file) => `${folder}/${file.name}`)));
      });
    return () => {
      live = false;
    };
  }, [folder, paths]);

  const editOf = (photo: Photo): "edited" | "original" | undefined => {
    if (!files) return undefined;
    if (/\.orig\.[a-z0-9]+$/i.test(photo.storage_path)) return "original";
    return files.has(originalPathOf(photo.storage_path)) ? "edited" : "original";
  };

  async function run(task: () => Promise<boolean>) {
    setBusy(true);
    setError(null);
    const ok = await task();
    setBusy(false);
    if (!ok) setError(t.errors.generic);
    startRefresh(() => router.refresh());
  }

  function add(files: File[]) {
    const supabase = createClient();
    const lastPosition = photos.reduce((max, photo) => Math.max(max, photo.position), -1);
    setTips([]);

    run(async () => {
      const result = await uploadPhotos(supabase, {
        organizationId,
        propertyId,
        userId,
        files,
        startPosition: lastPosition + 1,
        enhance,
      });
      setTips(result.tips.map(({ index, tip }) => fmt(t.photos.tipPhoto, { n: photos.length + index + 1, tip })));
      return result.failed === 0;
    });
  }

  function remove(id: string) {
    const photo = photos.find((p) => p.id === id);
    if (!photo || !window.confirm(t.photos.removeConfirm)) return;
    const supabase = createClient();

    run(async () => {
      const { error: rowError } = await supabase.from("property_photos").delete().eq("id", id);
      if (rowError) return false;
      await supabase.storage.from(PHOTO_BUCKET).remove([photo.storage_path, originalPathOf(photo.storage_path)]);
      return true;
    });
  }

  /** An edited photo goes back to its original; an original is edited by Brix (and kept). */
  function toggleEdit(id: string) {
    const photo = photos.find((p) => p.id === id);
    const state = photo && editOf(photo);
    if (!photo || !state) return;
    const supabase = createClient();
    setTips([]);

    run(async () => {
      if (state === "edited") {
        const original = originalPathOf(photo.storage_path);
        const { error: rowError } = await supabase.from("property_photos").update({ storage_path: original }).eq("id", id);
        if (rowError) return false;
        await supabase.storage.from(PHOTO_BUCKET).remove([photo.storage_path]);
        return true;
      }

      const { data: source } = await supabase.storage.from(PHOTO_BUCKET).download(photo.storage_path);
      if (!source) return false;
      const prepared = await preparePhoto(source, true);
      const path = await storePhoto(supabase, folder, { main: prepared.main, original: source });
      if (!path) return false;
      const { error: rowError } = await supabase.from("property_photos").update({ storage_path: path }).eq("id", id);
      if (rowError) {
        await supabase.storage.from(PHOTO_BUCKET).remove([path, originalPathOf(path)]);
        return false;
      }
      await supabase.storage.from(PHOTO_BUCKET).remove([photo.storage_path]);
      if (prepared.tip) setTips([prepared.tip]);
      return true;
    });
  }

  /** Saves the new order: each photo whose place changed gets its position (0 = the cover). */
  function reorder(ids: string[]) {
    const before = new Map(shown.map((photo, index) => [photo.id, { index, position: photo.position }]));
    setOrder(ids);
    const supabase = createClient();

    run(async () => {
      const results = await Promise.all(
        ids
          .map((id, index) => ({ id, index }))
          .filter(({ id, index }) => before.get(id)?.index !== index || before.get(id)?.position !== index)
          .map(({ id, index }) => supabase.from("property_photos").update({ position: index }).eq("id", id))
      );
      return results.every((result) => !result.error);
    });
  }

  function makeCover(id: string) {
    reorder([id, ...shown.map((photo) => photo.id).filter((key) => key !== id)]);
  }

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          {t.form.sectionPhotos}
          <span className="text-sm font-normal text-subtle">
            {photos.length}/{MAX_PHOTOS}
          </span>
          {working && <Loader2 className="size-4 animate-spin text-accent-fg" />}
        </span>
      }
      description={t.photos.manageHint}
    >
      <div className="space-y-4">
        <PhotoGrid
          photos={shown.map((photo) => ({ key: photo.id, url: photo.url, edit: editOf(photo) }))}
          onMakeCover={makeCover}
          onRemove={remove}
          onReorder={reorder}
          onEdit={toggleEdit}
          onOpen={(id) => setOpen(shown.findIndex((p) => p.id === id))}
          disabled={working}
        />
        {open !== null && open >= 0 && (
          <PhotoCompare
            photos={shown.map((photo) => ({ key: photo.id, url: photo.url, edited: editOf(photo) === "edited" }))}
            startAt={open}
            originalUrl={originalUrl}
            onClose={closeOpen}
          />
        )}
        <EnhanceSwitch on={enhance} onChange={setEnhance} disabled={working} />
        <PhotoDropzone onFiles={add} remaining={MAX_PHOTOS - photos.length} disabled={working} />
        {busy && enhance && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Sparkles className="size-4 animate-pulse text-brand-cyan" />
            {t.photos.enhancing}
          </p>
        )}
        {tips.length > 0 && (
          <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm">
            <p className="font-semibold text-warning">{t.photos.tipsTitle}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-fg-2">
              {tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>
        )}
        {error && <p className="text-sm font-medium text-danger">{error}</p>}
      </div>
    </Card>
  );
}
