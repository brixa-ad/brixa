import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PHOTO_BUCKET } from "./photos";

const SIGNED_URL_SECONDS = 60 * 60;

/** Map of storage path → temporary signed URL (the bucket is private). */
export async function signPhotoUrls(supabase: SupabaseClient, paths: string[]) {
  const urls = new Map<string, string>();
  if (paths.length === 0) return urls;

  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_SECONDS);

  if (error) {
    console.error("Signing photo URLs failed:", error);
    return urls;
  }

  for (const item of data ?? []) {
    if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
  }
  return urls;
}
