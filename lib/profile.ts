import type { ErrorCode } from "./validation";

export type ProfileInput = {
  fullName: string;
  phone: string;
  jobTitle: string;
  bio: string;
  areas: string[];
};

export type ProfileErrors = Partial<Record<keyof ProfileInput, ErrorCode>>;

export const PROFILE_LIMITS = { fullName: 100, phone: 40, jobTitle: 80, bio: 1000, areas: 20, area: 60 };

/** Shared by the profile form and the server action. */
export function validateProfile(input: ProfileInput): ProfileErrors {
  const errors: ProfileErrors = {};

  const name = input.fullName.trim();
  if (!name) errors.fullName = "required";
  else if (name.length < 2) errors.fullName = "tooShort";
  else if (name.length > PROFILE_LIMITS.fullName) errors.fullName = "tooLong";

  const phone = input.phone.trim();
  if (phone && !/^\+?[\d\s()/-]{5,40}$/.test(phone)) errors.phone = "invalidPhone";

  if (input.jobTitle.trim().length > PROFILE_LIMITS.jobTitle) errors.jobTitle = "tooLong";
  if (input.bio.length > PROFILE_LIMITS.bio) errors.bio = "tooLong";
  if (
    input.areas.length > PROFILE_LIMITS.areas ||
    input.areas.some((area) => area.length > PROFILE_LIMITS.area)
  ) {
    errors.areas = "tooLong";
  }

  return errors;
}
