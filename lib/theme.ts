export const THEMES = ["dark", "light"] as const;
export type Theme = (typeof THEMES)[number];
export const DEFAULT_THEME: Theme = "dark";
export const THEME_COOKIE = "theme";

export function isTheme(value: unknown): value is Theme {
  return value === "dark" || value === "light";
}
