import type { SupabaseClient } from "@supabase/supabase-js";

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

/**
 * Upload photos for a property and register them in property_photos.
 * Returns how many failed.
 */
export async function uploadPhotos(
  supabase: SupabaseClient,
  opts: {
    organizationId: string;
    propertyId: string;
    userId: string;
    files: File[];
    startPosition: number;
  }
) {
  let failed = 0;

  for (const [index, file] of opts.files.entries()) {
    const blob = await compressImage(file);
    const extension = blob.type === "image/jpeg" ? "jpg" : (file.name.split(".").pop() ?? "jpg");
    const path = `${opts.organizationId}/${opts.propertyId}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, blob, { contentType: blob.type || file.type, cacheControl: "31536000" });

    if (uploadError) {
      console.error("Photo upload failed:", uploadError);
      failed++;
      continue;
    }

    const { error: rowError } = await supabase.from("property_photos").insert({
      property_id: opts.propertyId,
      storage_path: path,
      position: opts.startPosition + index,
      created_by: opts.userId,
    });

    if (rowError) {
      console.error("Saving photo failed:", rowError);
      await supabase.storage.from(PHOTO_BUCKET).remove([path]);
      failed++;
    }
  }

  return failed;
}
