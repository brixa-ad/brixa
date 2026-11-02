/**
 * A listing's videos: up to 5 links to where they're posted (YouTube, TikTok, Instagram, Facebook,
 * Vimeo) and one short video of its own, kept like the photos (a private bucket, signed links).
 */
export const VIDEO_BUCKET = "property-videos";
export const MAX_VIDEO_LINKS = 5;
export const MAX_VIDEO_MB = 50;
export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/3gpp", "video/x-m4v"];

export type VideoPlatform = "youtube" | "tiktok" | "instagram" | "facebook" | "vimeo" | "other";

export type VideoLink = {
  url: string;
  platform: VideoPlatform;
  /** the player to load in the page (only when tapped — nothing is loaded from them before) */
  embed: string | null;
  /** upright (phones' formats: TikTok, Reels, Shorts) or wide */
  tall: boolean;
};

/** A link as it was pasted → https, trimmed; null when it isn't a web address. */
export function cleanVideoUrl(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    url.protocol = "https:";
    return url.toString().slice(0, 500);
  } catch {
    return null;
  }
}

/** What a link is and how to play it in the page. */
export function videoLink(raw: string): VideoLink | null {
  const clean = cleanVideoUrl(raw);
  if (!clean) return null;
  const url = new URL(clean);
  const host = url.hostname.replace(/^(www|m|mobile|vm|vt)\./, "");
  const path = url.pathname;

  if (host === "youtu.be" || host.endsWith("youtube.com")) {
    const id =
      host === "youtu.be"
        ? path.split("/")[1]
        : (url.searchParams.get("v") ?? path.match(/^\/(?:shorts|embed|live)\/([\w-]+)/)?.[1] ?? null);
    const ok = id && /^[\w-]{6,20}$/.test(id);
    return { url: clean, platform: "youtube", embed: ok ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0` : null, tall: path.startsWith("/shorts/") };
  }
  if (host.endsWith("tiktok.com")) {
    const id = path.match(/\/video\/(\d+)/)?.[1];
    return { url: clean, platform: "tiktok", embed: id ? `https://www.tiktok.com/embed/v2/${id}` : null, tall: true };
  }
  if (host.endsWith("instagram.com")) {
    const m = path.match(/^\/(p|reel|reels|tv)\/([\w-]+)/);
    const kind = m?.[1] === "reels" ? "reel" : m?.[1];
    return { url: clean, platform: "instagram", embed: m ? `https://www.instagram.com/${kind}/${m[2]}/embed` : null, tall: true };
  }
  if (host.endsWith("facebook.com") || host === "fb.watch") {
    return {
      url: clean,
      platform: "facebook",
      embed: host === "fb.watch" ? null : `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(clean)}&show_text=false`,
      tall: path.includes("/reel"),
    };
  }
  if (host.endsWith("vimeo.com")) {
    const id = path.match(/\/(\d+)/)?.[1];
    return { url: clean, platform: "vimeo", embed: id ? `https://player.vimeo.com/video/${id}?autoplay=1&dnt=1` : null, tall: false };
  }
  return { url: clean, platform: "other", embed: null, tall: false };
}

export const PLATFORM_NAMES: Record<VideoPlatform, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  vimeo: "Vimeo",
  other: "",
};

/** The links as the database keeps them: clean, no repeats, at most 5. */
export function cleanVideoLinks(raw: string[]): string[] {
  return [...new Set(raw.map(cleanVideoUrl).filter((u): u is string => Boolean(u)))].slice(0, MAX_VIDEO_LINKS);
}
