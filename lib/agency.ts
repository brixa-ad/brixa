import "server-only";
import { cache } from "react";
import { createClient } from "./supabase/server";

export const LOGO_BUCKET = "agency-logos";

export type AgencyPoints = {
  dealDouble: number;
  deal: number;
  listing: number;
  exclusive: number;
  viewing: number;
  meeting: number;
  client: number;
  call: number;
};

export type Agency = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  kind: "agency" | "solo";
  legalName: string | null;
  eik: string | null;
  city: string | null;
  logoPath: string | null;
  logoUrl: string | null;
  defaultCurrency: "EUR" | "BGN" | "USD";
  commissionSalePercent: number;
  commissionRentMonths: number;
  /** an external broker's usual share, % of the commission */
  referralPercent: number;
  points: AgencyPoints;
  /** the website at /w/<slug> */
  site: { enabled: boolean; slug: string | null; headline: string | null; about: string | null };
};

export const DEFAULT_POINTS: AgencyPoints = {
  dealDouble: 50,
  deal: 30,
  listing: 10,
  exclusive: 10,
  viewing: 5,
  meeting: 3,
  client: 2,
  call: 1,
};

export const logoUrl = (path: string | null | undefined) =>
  path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${LOGO_BUCKET}/${path}` : null;

/** The agency's details and settings (cached per request). */
export const getAgency = cache(async (organizationId: string): Promise<Agency | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("organizations").select("*").eq("id", organizationId).maybeSingle();
  if (!data) return null;
  const n = (value: unknown, fallback: number) => (value === null || value === undefined ? fallback : Number(value));
  return {
    id: data.id,
    name: data.name,
    phone: data.phone ?? null,
    email: data.email ?? null,
    website: data.website ?? null,
    address: data.address ?? null,
    kind: data.kind === "solo" ? "solo" : "agency",
    legalName: data.legal_name ?? null,
    eik: data.eik ?? null,
    city: data.city ?? null,
    logoPath: data.logo_path ?? null,
    logoUrl: logoUrl(data.logo_path),
    defaultCurrency: data.default_currency === "BGN" || data.default_currency === "USD" ? data.default_currency : "EUR",
    commissionSalePercent: n(data.commission_sale_percent, 3),
    commissionRentMonths: n(data.commission_rent_months, 1),
    referralPercent: n(data.referral_percent, 10),
    site: {
      enabled: Boolean(data.site_enabled),
      slug: data.site_slug ?? null,
      headline: data.site_headline ?? null,
      about: data.site_about ?? null,
    },
    points: {
      dealDouble: n(data.points_deal_double, DEFAULT_POINTS.dealDouble),
      deal: n(data.points_deal, DEFAULT_POINTS.deal),
      listing: n(data.points_listing, DEFAULT_POINTS.listing),
      exclusive: n(data.points_exclusive, DEFAULT_POINTS.exclusive),
      viewing: n(data.points_viewing, DEFAULT_POINTS.viewing),
      meeting: n(data.points_meeting, DEFAULT_POINTS.meeting),
      client: n(data.points_client, DEFAULT_POINTS.client),
      call: n(data.points_call, DEFAULT_POINTS.call),
    },
  };
});
