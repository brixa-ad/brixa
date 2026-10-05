import type { Role } from "./types";

export type Office = { id: string; name: string; city: string | null; address: string | null; phone: string | null };
export type Team = { id: string; office_id: string | null; name: string; manager_id: string | null };

type Viewer = { userId: string; role: Role; officeId: string | null };
type Person = { profile_id: string; office_id: string | null; team_id: string | null };

/**
 * Does the viewer lead this person — the same rule as the database's oversees_as: the owner
 * everyone; an office manager the people of their office; a team manager the people of their team
 * (no team yet: their office; no office either: the whole agency). Never oneself, except the owner.
 */
export function leads(viewer: Viewer, person: Person, teams: readonly Team[]): boolean {
  if (viewer.role === "owner") return true;
  if (person.profile_id === viewer.userId) return false;
  if (viewer.role === "office_manager") return viewer.officeId === null || person.office_id === viewer.officeId;
  if (viewer.role === "manager") {
    const mine = teams.find((team) => team.manager_id === viewer.userId);
    if (mine) return person.team_id === mine.id;
    return viewer.officeId === null || person.office_id === viewer.officeId;
  }
  return false;
}

/** The team this person runs, if any. */
export const teamLedBy = (userId: string, teams: readonly Team[]) => teams.find((team) => team.manager_id === userId) ?? null;
