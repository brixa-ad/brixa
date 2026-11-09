import type { CommissionDefaults } from "./commission";

export type Category = { id: string; code: string; name: string; name_en: string | null };

export type Subtype = {
  id: string;
  category_id: string;
  code: string;
  name: string;
  name_en: string | null;
};

export type Feature = { id: string; code: string; name: string; name_en: string | null };

export type Region = { id: string; code: string | null; name: string };

export type Settlement = {
  id: string;
  region_id: string;
  name: string;
  settlement_type: string;
};

export type Neighborhood = { id: string; settlement_id: string; name: string };

export type Role = "owner" | "office_manager" | "manager" | "broker";

export type Member = {
  profile_id: string;
  role: Role;
  office_id: string | null;
  team_id: string | null;
  full_name: string | null;
  email: string;
  avatar_path: string | null;
  job_title: string | null;
  phone: string | null;
};

/** Everything the property form needs to render. */
export type FormLookups = {
  categories: Category[];
  subtypes: Subtype[];
  /** feature list per subtype id */
  subtypeFeatures: Record<string, Feature[]>;
  regions: Region[];
  settlements: Settlement[];
  members: Member[];
  /** the clients a listing's owner can be (the form shows the listing's broker's), sellers and landlords first */
  ownerClients: { id: string; full_name: string; phone: string | null; broker_id: string | null }[];
  commissionDefaults: CommissionDefaults;
};

export type Photo = { id: string; storage_path: string; position: number; url: string | null };
