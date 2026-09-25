"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { Card } from "@/components/ui/form";
import { MAX_PHOTOS, PHOTO_BUCKET, uploadPhotos } from "@/lib/photos";
import { createClient } from "@/lib/supabase/client";
import type { Photo } from "@/lib/types";
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

  const working = busy || refreshing;

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

    run(async () => {
      const failed = await uploadPhotos(supabase, {
        organizationId,
        propertyId,
        userId,
        files,
        startPosition: lastPosition + 1,
      });
      return failed === 0;
    });
  }

  function remove(id: string) {
    const photo = photos.find((p) => p.id === id);
    if (!photo || !window.confirm(t.photos.removeConfirm)) return;
    const supabase = createClient();

    run(async () => {
      const { error: rowError } = await supabase.from("property_photos").delete().eq("id", id);
      if (rowError) return false;
      await supabase.storage.from(PHOTO_BUCKET).remove([photo.storage_path]);
      return true;
    });
  }

  function makeCover(id: string) {
    const firstPosition = photos.reduce((min, photo) => Math.min(min, photo.position), 0);
    const supabase = createClient();

    run(async () => {
      const { error: updateError } = await supabase
        .from("property_photos")
        .update({ position: firstPosition - 1 })
        .eq("id", id);
      return !updateError;
    });
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
          photos={photos.map((photo) => ({ key: photo.id, url: photo.url }))}
          onMakeCover={makeCover}
          onRemove={remove}
          disabled={working}
        />
        <PhotoDropzone onFiles={add} remaining={MAX_PHOTOS - photos.length} disabled={working} />
        {error && <p className="text-sm font-medium text-danger">{error}</p>}
      </div>
    </Card>
  );
}
