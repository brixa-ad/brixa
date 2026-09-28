import type { SearchInput } from "./client-validation";
import { CURRENCIES, isOneOf } from "./options";
import { isValidEmail, type ErrorCode } from "./validation";

/** A colleague from another agency and what their client is looking for. */
export type PartnerSearchInput = {
  brokerName: string;
  agency: string;
  phone: string;
  email: string;
  note: string;
  search: SearchInput;
};

export type PartnerSearchErrors = Partial<
  Record<keyof Omit<PartnerSearchInput, "search"> | `search.${keyof SearchInput}`, ErrorCode>
>;

export const PARTNER_LIMITS = { name: 120, phone: 40, email: 200, note: 2000 };

export function validatePartnerSearch(input: PartnerSearchInput): PartnerSearchErrors {
  const errors: PartnerSearchErrors = {};
  const name = input.brokerName.trim();
  if (!name) errors.brokerName = "required";
  else if (name.length > PARTNER_LIMITS.name) errors.brokerName = "tooLong";
  if (input.agency.trim().length > PARTNER_LIMITS.name) errors.agency = "tooLong";

  const phone = input.phone.trim();
  if (phone && !/^\+?[\d\s()/-]{5,40}$/.test(phone)) errors.phone = "invalidPhone";
  const email = input.email.trim();
  if (email && (!isValidEmail(email) || email.length > PARTNER_LIMITS.email)) errors.email = "invalidEmail";
  if (!input.note.trim()) errors.note = "required";
  else if (input.note.length > PARTNER_LIMITS.note) errors.note = "tooLong";

  const s = input.search;
  if (s.operation !== "sale" && s.operation !== "rent") errors["search.operation"] = "invalid";
  if (!isOneOf(CURRENCIES, s.currency)) errors["search.currency"] = "invalid";
  const pairs: [keyof SearchInput, keyof SearchInput, boolean][] = [
    ["budgetMin", "budgetMax", false],
    ["areaMin", "areaMax", false],
    ["roomsMin", "roomsMax", true],
  ];
  for (const [minKey, maxKey, integer] of pairs) {
    const min = s[minKey] as number | null;
    const max = s[maxKey] as number | null;
    for (const [key, value] of [[minKey, min], [maxKey, max]] as const) {
      if (value === null) continue;
      if (!Number.isFinite(value) || value < 0) errors[`search.${key}`] = "positive";
      else if (integer && !Number.isInteger(value)) errors[`search.${key}`] = "integer";
    }
    if (min !== null && max !== null && min > max && !errors[`search.${maxKey}`]) errors[`search.${maxKey}`] = "range";
  }
  return errors;
}
