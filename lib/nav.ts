/** Every page of the app that the menus lead to. */
export const NAV_KEYS = [
  "home",
  "plan",
  "business",
  "territory",
  "brix",
  "tasks",
  "calendar",
  "deals",
  "chat",
  "properties",
  "myProperties",
  "soldProperties",
  "withdrawnProperties",
  "colleaguesProperties",
  "offMarketProperties",
  "openHouses",
  "clients",
  "buyers",
  "sellers",
  "tenants",
  "landlords",
  "coldContacts",
  "partners",
  "signals",
  "followup",
  "contacts",
  "stats",
  "statsBroker",
  "statsMarket",
  "market",
  "partnerSearches",
  "closedDeals",
  "team",
  "goals",
  "teamReport",
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
  chat: "/chat",
  properties: "/properties",
  // the listings by whose and where they are (one list, filtered)
  myProperties: "/properties?view=mine",
  soldProperties: "/properties?view=sold",
  withdrawnProperties: "/properties?view=withdrawn",
  colleaguesProperties: "/properties?view=colleagues",
  offMarketProperties: "/properties?view=offmarket",
  openHouses: "/open-houses",
  clients: "/clients",
  // the clients by what they do (one list, filtered)
  buyers: "/clients?type=buyer",
  sellers: "/clients?type=seller",
  tenants: "/clients?type=tenant",
  landlords: "/clients?type=landlord",
  coldContacts: "/cold-contacts",
  partners: "/partners",
  signals: "/follow-up?view=signals",
  followup: "/follow-up",
  contacts: "/contacts",
  stats: "/stats",
  statsBroker: "/stats/broker",
  statsMarket: "/stats/market",
  market: "/market",
  partnerSearches: "/partner-searches",
  closedDeals: "/closed-deals",
  team: "/team",
  goals: "/team/goals",
  teamReport: "/team/report",
  notifications: "/notifications",
  profile: "/profile",
  settings: "/settings",
};

/**
 * The menu: eight sections (each with its pages, shown as tabs on top) and a few single places.
 * A section leads to the first of its pages the person may open.
 */
export const MENU_KEYS = ["home", "day", "clients", "properties", "deals", "chat", "insights", "path", "team", "brix", "notifications", "profile", "settings"] as const;
export type MenuKey = (typeof MENU_KEYS)[number];

/**
 * Each section's tabs; a tab with several pages shows them as quick filters inside it (Clients:
 * All | Buyers | Sellers | Tenants | Landlords). The tab is named after its first page and leads to
 * the first of them the person may open.
 */
export const MENU_TABS: Record<MenuKey, NavKey[][]> = {
  home: [["home"]],
  day: [["tasks"], ["calendar"]],
  clients: [["clients", "buyers", "sellers", "tenants", "landlords"], ["followup"], ["coldContacts", "contacts"], ["partners", "partnerSearches"]],
  properties: [["myProperties", "offMarketProperties", "soldProperties", "withdrawnProperties"], ["colleaguesProperties"], ["openHouses"]],
  deals: [["deals"], ["closedDeals"]],
  chat: [["chat"]],
  insights: [["stats", "statsBroker"], ["statsMarket", "market"]],
  path: [["plan"], ["business"], ["territory"]],
  team: [["team"], ["teamReport"], ["goals"]],
  brix: [["brix"]],
  notifications: [["notifications"]],
  profile: [["profile"]],
  settings: [["settings"]],
};

/** Every page of each section. */
export const MENU_PAGES = Object.fromEntries(MENU_KEYS.map((key) => [key, MENU_TABS[key].flat()])) as Record<MenuKey, NavKey[]>;

/** The places at the bottom of the side menu (not sections). */
export const MENU_EXTRAS: readonly MenuKey[] = ["notifications", "profile", "settings"];

export const BOTTOM_NAV_MAX = 5;
export const DEFAULT_BOTTOM_NAV: MenuKey[] = ["home", "day", "clients", "properties", "deals"];

/**
 * Pages this person may open: goals and the agency's statistics are the managers'; Brix only once
 * the AI is connected; working alone there's no team and no free contacts.
 */
export function navKeysFor(isManager: boolean, brix = false, solo = false): NavKey[] {
  return NAV_KEYS.filter(
    (key) =>
      ((key !== "goals" && key !== "stats" && key !== "teamReport") || isManager) &&
      (key !== "brix" || brix) &&
      // working alone: no team (own targets are set in My plan), no free contacts, no colleagues
      !(solo && (key === "team" || key === "goals" || key === "contacts" || key === "colleaguesProperties"))
  );
}

/** A tab: named after `key`, it leads to its first page; its pages (those this person may open) are its filters. */
export type MenuTab = { key: NavKey; pages: NavKey[] };
export type MenuSection = { key: MenuKey; pages: NavKey[]; tabs: MenuTab[] };

/** The menu for this person: each section with the tabs and pages they may open (empty ones left out). */
export function menuFor(isManager: boolean, brix = false, solo = false): MenuSection[] {
  const allowed = new Set(navKeysFor(isManager, brix, solo));
  return MENU_KEYS.map((key) => {
    const tabs = MENU_TABS[key]
      .map((pages) => ({ key: pages[0], pages: pages.filter((page) => allowed.has(page)) }))
      .filter((tab) => tab.pages.length > 0);
    return { key, tabs, pages: tabs.flatMap((tab) => tab.pages) };
  }).filter((s) => s.pages.length > 0);
}

export const sectionHref = (section: MenuSection) => NAV_HREF[section.pages[0]];

/**
 * The page (of a list) the address belongs to — the longest matching address wins (/stats vs
 * /stats/market). A page with a query (/clients?type=seller) needs it too, when the query is given.
 */
export function pageFor(pathname: string, pages: readonly NavKey[], search?: URLSearchParams | null): NavKey | null {
  let best: NavKey | null = null;
  let bestScore = -1;
  for (const page of pages) {
    const [path, query] = NAV_HREF[page].split("?");
    const match = path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`);
    if (!match) continue;
    let score = path.length * 2;
    if (search && query) {
      if (![...new URLSearchParams(query)].every(([key, value]) => search.get(key) === value)) continue;
      score += 1;
    }
    if (score > bestScore) {
      best = page;
      bestScore = score;
    }
  }
  return best;
}

/** The address of a page without its query. */
export const hrefPath = (page: NavKey) => NAV_HREF[page].split("?")[0];

/** Is a section open: the address is one of its pages (or below one). */
export const sectionActive = (section: MenuSection, pathname: string) => pageFor(pathname, section.pages) !== null;

/** The phone's bottom bar as saved in Settings, cleaned up (older saves named pages: they map to their section). */
export function bottomNavFor(saved: readonly string[] | null | undefined, isManager: boolean, brix = false, solo = false): MenuKey[] {
  const allowed = new Set(menuFor(isManager, brix, solo).map((s) => s.key));
  const keys: MenuKey[] = [];
  for (const raw of saved ?? []) {
    const key = (MENU_KEYS as readonly string[]).includes(raw)
      ? (raw as MenuKey)
      : MENU_KEYS.find((k) => (MENU_PAGES[k] as readonly string[]).includes(raw));
    if (key && allowed.has(key) && !keys.includes(key)) keys.push(key);
  }
  return keys.length > 0 ? keys.slice(0, BOTTOM_NAV_MAX) : DEFAULT_BOTTOM_NAV.filter((k) => allowed.has(k));
}
