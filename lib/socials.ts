/** A broker's social networks: kept as links; typed in as a link or as @name. */

export const SOCIAL_KEYS = ["facebook", "instagram", "tiktok", "linkedin", "youtube"] as const;
export type SocialKey = (typeof SOCIAL_KEYS)[number];
export type Socials = Partial<Record<SocialKey, string>>;

export const SOCIAL_LABEL: Record<SocialKey, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  youtube: "YouTube",
};

/** The brand's colour, for the dot on the button. */
export const SOCIAL_COLOR: Record<SocialKey, string> = {
  facebook: "#1877f2",
  instagram: "#e1306c",
  tiktok: "#111111",
  linkedin: "#0a66c2",
  youtube: "#ff0000",
};

const BASE: Record<SocialKey, (name: string) => string> = {
  facebook: (n) => `https://www.facebook.com/${n}`,
  instagram: (n) => `https://www.instagram.com/${n}`,
  tiktok: (n) => `https://www.tiktok.com/@${n}`,
  linkedin: (n) => `https://www.linkedin.com/in/${n}`,
  youtube: (n) => `https://www.youtube.com/@${n}`,
};

/** A link as typed: a full link stays (https added when missing); "@name" or "name" becomes the network's link. Null when it isn't one. */
export function socialLink(key: SocialKey, input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (/^https?:\/\/\S+$/i.test(value)) return value.slice(0, 300);
  if (/^(www\.)?[a-z0-9-]+\.[a-z]{2,}\/\S*$/i.test(value)) return `https://${value}`.slice(0, 300);
  const name = value.replace(/^@/, "");
  return /^[\p{L}\p{N}._-]{1,80}$/u.test(name) ? BASE[key](name) : null;
}

/** The networks from the database (anything else is left out). */
export function parseSocials(raw: unknown): Socials {
  if (!raw || typeof raw !== "object") return {};
  const out: Socials = {};
  for (const key of SOCIAL_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === "string" && /^https?:\/\//i.test(value)) out[key] = value;
  }
  return out;
}

/** "instagram.com/anton" — how a link reads in a document. */
export const shortLink = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");

/** The networks as they read in a document, in order. */
export const socialTexts = (socials: Socials) => SOCIAL_KEYS.filter((key) => socials[key]).map((key) => shortLink(socials[key]!));
