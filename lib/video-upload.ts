import type { SupabaseClient } from "@supabase/supabase-js";
import { VIDEO_BUCKET } from "./video";

/**
 * The listing's own video, from the browser: the new file goes to <agency>/<listing>/video-….ext,
 * the listing points to it, and the one before is removed (or only removed, with no new file).
 */
export async function saveVideo(
  supabase: SupabaseClient,
  opts: { organizationId: string; propertyId: string; file: File | null; oldPath: string | null }
) {
  let path: string | null = null;
  if (opts.file) {
    const extension = (opts.file.name.split(".").pop() ?? "mp4").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "mp4";
    path = `${opts.organizationId}/${opts.propertyId}/video-${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage
      .from(VIDEO_BUCKET)
      .upload(path, opts.file, { contentType: opts.file.type || "video/mp4", cacheControl: "31536000" });
    if (error) {
      console.error("Video upload failed:", error.message);
      return false;
    }
  }

  const { data, error } = await supabase.from("properties").update({ video_path: path }).eq("id", opts.propertyId).select("id");
  if (error || !data?.length) {
    if (path) await supabase.storage.from(VIDEO_BUCKET).remove([path]);
    return false;
  }
  if (opts.oldPath && opts.oldPath !== path) await supabase.storage.from(VIDEO_BUCKET).remove([opts.oldPath]);
  return true;
}
