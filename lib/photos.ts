import type { SupabaseClient } from "@supabase/supabase-js";
import { enhanceCanvas, lookFrom, NEUTRAL_LOOK, thumbnailBase64 } from "./photo-enhance";

export const PHOTO_BUCKET = "property-photos";
export const MAX_PHOTOS = 30;
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_EDGE = 2000;

/** Resize to at most 2000px on the long edge and re-encode as JPEG. Falls back to the original. */
export async function compressImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85)
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

/** Where a photo's untouched original is kept, next to the edited one: <id>.jpg → <id>.orig.jpg */
export const originalPathOf = (path: string) => path.replace(/(\.[a-z0-9]+)?$/i, (ext) => `.orig${ext || ".jpg"}`);

/** Brix's look for a photo (null: Brix isn't connected or didn't answer — the automatic correction alone). */
async function brixLook(canvas: HTMLCanvasElement) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    const response = await fetch("/api/brix/photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: thumbnailBase64(canvas) }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) return null;
    return (await response.json()) as { look?: unknown; tip?: string };
  } catch {
    return null;
  }
}

const toJpeg = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));

/**
 * A photo ready to upload: at most 2000px, as JPEG — and, when asked, edited like a magazine's
 * (Brix chooses how much of each correction; the original comes along to be kept).
 */
export async function preparePhoto(file: Blob, enhance: boolean): Promise<{ main: Blob; original: Blob | null; tip: string }> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const original = (await toJpeg(canvas, 0.85)) ?? file;
    if (!enhance) return { main: original, original: null, tip: "" };

    const answer = await brixLook(canvas);
    enhanceCanvas(canvas, answer?.look ? lookFrom(answer.look) : NEUTRAL_LOOK);
    const main = (await toJpeg(canvas, 0.88)) ?? original;
    return { main, original, tip: answer?.tip?.trim() ?? "" };
  } catch {
    return { main: file, original: null, tip: "" };
  }
}

/** A small JPEG of a photo file (for Brix to look at), as base64 — null when it can't be read. */
export async function fileThumbnail(file: Blob): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    bitmap.close();
    return thumbnailBase64(canvas, 768);
  } catch {
    return null;
  }
}

/** Runs the jobs a few at a time, in order of the list. */
async function inTurns<T>(items: T[], at: number, job: (item: T, index: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(at, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        await job(items[index], index);
      }
    })
  );
}

/** One photo into storage (and its original next to it). Null when it didn't go. */
export async function storePhoto(supabase: SupabaseClient, folder: string, prepared: { main: Blob; original: Blob | null }) {
  const path = `${folder}/${crypto.randomUUID()}.jpg`;
  const options = { contentType: "image/jpeg", cacheControl: "31536000" };
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, prepared.main, options);
  if (error) {
    console.error("Photo upload failed:", error);
    return null;
  }
  if (prepared.original) {
    const { error: originalError } = await supabase.storage.from(PHOTO_BUCKET).upload(originalPathOf(path), prepared.original, options);
    // the edited photo still counts; only "back to the original" won't be offered for it
    if (originalError) console.error("Keeping the original failed:", originalError);
  }
  return path;
}

/**
 * Upload photos for a property and register them in property_photos (edited by Brix when
 * `enhance` is on). Returns how many failed, and Brix's word on photos editing can't save.
 */
export async function uploadPhotos(
  supabase: SupabaseClient,
  opts: {
    organizationId: string;
    propertyId: string;
    userId: string;
    files: File[];
    startPosition: number;
    enhance?: boolean;
  }
) {
  let failed = 0;
  const tips: { index: number; tip: string }[] = [];
  const folder = `${opts.organizationId}/${opts.propertyId}`;

  await inTurns(opts.files, opts.enhance ? 3 : 2, async (file, index) => {
    const prepared = await preparePhoto(file, Boolean(opts.enhance));
    if (prepared.tip) tips.push({ index, tip: prepared.tip });
    const path = await storePhoto(supabase, folder, prepared);
    if (!path) {
      failed++;
      return;
    }

    const { error: rowError } = await supabase.from("property_photos").insert({
      property_id: opts.propertyId,
      storage_path: path,
      position: opts.startPosition + index,
      created_by: opts.userId,
    });

    if (rowError) {
      console.error("Saving photo failed:", rowError);
      await supabase.storage.from(PHOTO_BUCKET).remove([path, originalPathOf(path)]);
      failed++;
    }
  });

  return { failed, tips: tips.sort((a, b) => a.index - b.index) };
}
