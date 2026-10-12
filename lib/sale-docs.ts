/**
 * The documents a sale needs (migration 062): the list, the cases that add more, and the offices
 * in the district cities. The content lives in the database (BRIXA's owner keeps it up to date).
 */

export const SALE_CASES = ["inheritance", "new_build", "house_land", "mortgage", "buyer_loan", "spouse", "proxy"] as const;
export type SaleCase = (typeof SALE_CASES)[number];
export const isSaleCase = (value: unknown): value is SaleCase => (SALE_CASES as readonly unknown[]).includes(value);

/** Who issues a document — the groups on the page, in this order. */
export const SALE_ISSUERS = ["owner", "municipality", "cadastre", "registry", "bank", "notary", "other"] as const;
export type SaleIssuer = (typeof SALE_ISSUERS)[number];

/** The offices BRIXA knows the address of, per city. */
export type OfficeKind = "cadastre" | "registry" | "municipality";
export const isOfficeKind = (value: string): value is OfficeKind => value === "cadastre" || value === "registry" || value === "municipality";

export type SaleDoc = {
  code: string;
  sort: number;
  cases: string[];
  issuer: SaleIssuer;
  title: string;
  about: string | null;
  fee: string | null;
  term: string | null;
  validity: string | null;
  online: string | null;
  updated_at: string;
};

export type SaleOffice = {
  id: string;
  city: string;
  kind: OfficeKind;
  name: string;
  address: string | null;
  phone: string | null;
  fee: string | null;
  term: string | null;
  updated_at: string;
};

/** The documents for these cases ("always" ones, and each case's own), in order. */
export const docsFor = (docs: SaleDoc[], cases: SaleCase[]) =>
  docs.filter((d) => d.cases.includes("always") || d.cases.some((c) => (cases as string[]).includes(c))).sort((a, b) => a.sort - b.sort);

/** A map link for an address. */
export const mapHref = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
