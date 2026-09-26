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

export type Role = "owner" | "manager" | "broker";

export type Member = {
  profile_id: string;
  role: Role;
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
  /** sellers / landlords this user can see (own clients, or all for managers) */
  ownerClients: { id: string; full_name: string; phone: string | null }[];
};

export type Photo = { id: string; storage_path: string; position: number; url: string | null };
