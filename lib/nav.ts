/** Every section of the app, in menu order. */
export const NAV_KEYS = [
  "home",
  "plan",
  "business",
  "territory",
  "brix",
  "tasks",
  "calendar",
  "deals",
  "properties",
  "openHouses",
  "clients",
  "followup",
  "contacts",
  "stats",
  "market",
  "partnerSearches",
  "closedDeals",
  "team",
  "goals",
  "notifications",
  "profile",
  "settings",
] as const;

export type NavKey = (typeof NAV_KEYS)[number];

export const NAV_HREF: Record<NavKey, string> = {
  home: "/",
  plan: "/plan",
  business: "/business",
  territory: "/territory",
  brix: "/brix",
  tasks: "/tasks",
  calendar: "/calendar",
  deals: "/deals",
  properties: "/properties",
  openHouses: "/open-houses",
  clients: "/clients",
  followup: "/follow-up",
  contacts: "/contacts",
  stats: "/stats",
  market: "/market",
  partnerSearches: "/partner-searches",
  closedDeals: "/closed-deals",
  team: "/team",
  goals: "/team/goals",
  notifications: "/notifications",
  profile: "/profile",
  settings: "/settings",
};

export const BOTTOM_NAV_MAX = 5;
export const DEFAULT_BOTTOM_NAV: NavKey[] = ["home", "tasks", "deals", "properties", "clients"];

/** Sections this person may open (goals are the managers'; Brix only once the AI is connected). */
export function navKeysFor(isManager: boolean, brix = false): NavKey[] {
  return NAV_KEYS.filter((key) => (key !== "goals" || isManager) && (key !== "brix" || brix));
}

/** The saved bottom bar, cleaned up; the default when nothing (valid) is saved. */
export function bottomNavFor(saved: readonly string[] | null | undefined, isManager: boolean, brix = false): NavKey[] {
  const allowed = navKeysFor(isManager, brix);
  const keys = [...new Set(saved ?? [])].filter((key): key is NavKey => (allowed as string[]).includes(key));
  return keys.length > 0 ? keys.slice(0, BOTTOM_NAV_MAX) : DEFAULT_BOTTOM_NAV;
}

export function isActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  // "Team" shouldn't light up on its goals page, which is a section of its own.
  if (href === "/team" && pathname.startsWith("/team/goals")) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
