import "server-only";
import { cache } from "react";
import { logoUrl } from "./agency";
import { avatarUrl } from "./avatar";
import { UUID, anonymous } from "./share";

export type SharedSearch = {
  search: {
    operation: "sale" | "rent";
    subtypes: { name: string; name_en: string | null }[];
    settlements: string[];
    neighborhoods: string[];
    budget_min: number | null;
    budget_max: number | null;
    currency: string;
    area_min: number | null;
    area_max: number | null;
    rooms_min: number | null;
    rooms_max: number | null;
    features: { name: string; name_en: string | null }[];
    updated_at: string;
  };
  comment: string | null;
  shared_at: string;
  broker: { name: string; email: string; phone: string | null; job_title: string | null; avatarUrl: string | null } | null;
  agency: { name: string; phone: string | null; email: string | null; website: string | null; logoUrl: string | null } | null;
};

const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));

/** A shared search's public page data (null: unknown or stopped link, or no search saved). Once per request. */
export const getSharedSearch = cache(async (token: string): Promise<SharedSearch | null> => {
  if (!UUID.test(token)) return null;
  const { data, error } = await anonymous().rpc("shared_search", { share_token: token });
  if (error || !data) return null;
  const raw = data as Omit<SharedSearch, "broker" | "agency"> & {
    broker: (Omit<NonNullable<SharedSearch["broker"]>, "avatarUrl"> & { avatar_path: string | null }) | null;
    agency: (Omit<NonNullable<SharedSearch["agency"]>, "logoUrl"> & { logo_path: string | null }) | null;
  };
  return {
    ...raw,
    search: {
      ...raw.search,
      operation: raw.search.operation === "rent" ? "rent" : "sale",
      budget_min: num(raw.search.budget_min),
      budget_max: num(raw.search.budget_max),
      area_min: num(raw.search.area_min),
      area_max: num(raw.search.area_max),
    },
    broker: raw.broker ? { ...raw.broker, avatarUrl: avatarUrl(raw.broker.avatar_path) } : null,
    agency: raw.agency ? { ...raw.agency, logoUrl: logoUrl(raw.agency.logo_path) } : null,
  };
});
