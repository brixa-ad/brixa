import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Mail, Phone, ShieldCheck, Target, Users } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { PageHeader } from "@/components/PageHeader";
import { Card, buttonClass } from "@/components/ui/form";
import { formatDate } from "@/lib/format";
import { leads, teamLedBy, type Office, type Team } from "@/lib/hierarchy";
import { fmt } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getHierarchy, getMembers } from "@/lib/lookups";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";
import {
  InviteForm,
  MoveButton,
  OfficeButton,
  RemoveMemberButton,
  RenameForm,
  RevokeButton,
  RoleSelect,
  TeamButton,
} from "./TeamForms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.team.title };
}

const ROLE_STYLES: Record<Role, string> = {
  owner: "bg-accent-soft text-accent-fg",
  office_manager: "bg-violet-500/10 text-violet-500",
  manager: "bg-sky-500/10 text-sky-500",
  broker: "bg-raised text-fg-2",
};

type Invitation = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  office_id: string | null;
  team_id: string | null;
  created_at: string;
};

export default async function TeamPage() {
  const session = (await getSession())!;
  const supabase = await createClient();
  const { isOwner } = session;
  const isOfficeManager = session.role === "office_manager";

  const [{ t, lang }, members, { offices, teams }, { data: invitations }] = await Promise.all([
    getI18n(),
    getMembers(supabase, session.organizationId),
    getHierarchy(supabase, session.organizationId),
    session.isManager
      ? supabase
          .from("organization_invitations")
          .select("id, email, full_name, role, office_id, team_id, created_at")
          .eq("organization_id", session.organizationId)
          .is("accepted_at", null)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as Invitation[] }),
  ]);

  type MemberRow = (typeof members)[number];
  const nameOf = (m: { full_name: string | null; email: string }) => m.full_name || m.email;
  const nameById = new Map(members.map((m) => [m.profile_id, nameOf(m)]));
  const officeById = new Map(offices.map((o) => [o.id, o]));
  const teamById = new Map(teams.map((tm) => [tm.id, tm]));
  const iLead = (m: MemberRow) => leads(session, m, teams);
  const myTeam = teamLedBy(session.userId, teams);
  const myOffice = session.officeId ? officeById.get(session.officeId) ?? null : null;

  // what this person may do with each colleague (the same rules the database keeps)
  const roleOptions = (m: MemberRow): Role[] | null => {
    if (m.role === "owner" || m.profile_id === session.userId) return null;
    if (isOwner) return ["office_manager", "manager", "broker"];
    if (isOfficeManager && (m.role === "manager" || m.role === "broker") && iLead(m)) return ["manager", "broker"];
    return null;
  };
  const canMove = (m: MemberRow) => isOwner || (isOfficeManager && Boolean(session.officeId) && (iLead(m) || m.office_id === null));
  const canRemove = (m: MemberRow) =>
    m.profile_id !== session.userId &&
    m.role !== "owner" &&
    (isOwner ||
      (isOfficeManager && (m.role === "manager" || m.role === "broker") && iLead(m)) ||
      (session.role === "manager" && m.role === "broker" && iLead(m)));
  const canEditTeam = (team: Team) => isOwner || (isOfficeManager && Boolean(session.officeId) && team.office_id === session.officeId);
  const canAddTeam = (officeId: string | null) => isOwner || (isOfficeManager && Boolean(officeId) && officeId === session.officeId);
  const moveOffices = isOwner ? offices : offices.filter((o) => o.id === session.officeId);
  const moveTeams = isOwner ? teams : teams.filter((tm) => tm.office_id === session.officeId);
  const managerCandidates = members
    .filter((m) => (m.role === "manager" || m.role === "broker") && (isOwner || iLead(m)))
    .map((m) => ({ id: m.profile_id, name: nameOf(m), officeId: m.office_id }));
  const colleagues = members.map((m) => ({ id: m.profile_id, name: nameOf(m) }));

  // where each person sits: their team's office, else their own
  const placeOf = (m: MemberRow) => {
    const team = m.team_id ? teamById.get(m.team_id) : undefined;
    return { officeId: team ? team.office_id : m.office_id, teamId: team ? team.id : null };
  };
  const groups: { office: Office | null; teams: Team[]; loose: MemberRow[]; count: number }[] = [
    ...offices.map((office) => ({ office })),
    { office: null },
  ]
    .map(({ office }) => {
      const id = office?.id ?? null;
      const inOffice = members.filter((m) => placeOf(m).officeId === id);
      return {
        office,
        teams: teams.filter((tm) => tm.office_id === id),
        loose: inOffice.filter((m) => placeOf(m).teamId === null),
        count: inOffice.length,
      };
    })
    .filter((g) => g.office || g.count > 0 || g.teams.length > 0);

  const memberItem = (member: MemberRow) => {
    const name = nameOf(member);
    const isYou = member.profile_id === session.userId;
    const options = roleOptions(member);
    return (
      <li key={member.profile_id} className="flex items-center gap-2 px-5 py-3.5 sm:gap-3 sm:px-6">
        <Link href={`/team/${member.profile_id}`} className="group flex min-w-0 flex-1 items-center gap-3">
          <Avatar path={member.avatar_path} name={name} />
          <div className="min-w-0">
            <p className="truncate font-medium group-hover:text-accent-fg">
              {name}
              {isYou && <span className="ml-1.5 text-xs font-normal text-subtle">({t.team.you})</span>}
            </p>
            <p className="truncate text-sm text-muted">{member.job_title || member.email}</p>
            {member.phone && (
              <p className="flex items-center gap-1 truncate text-xs text-subtle sm:hidden">
                <Phone className="size-3" />
                {member.phone}
              </p>
            )}
          </div>
        </Link>

        {member.phone && (
          <a
            href={`tel:${member.phone.replace(/[^\d+]/g, "")}`}
            className="hidden items-center gap-1.5 text-sm whitespace-nowrap text-muted hover:text-fg lg:flex"
          >
            <Phone className="size-3.5" />
            {member.phone}
          </a>
        )}

        {options ? (
          <RoleSelect profileId={member.profile_id} role={member.role} options={options} />
        ) : (
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${ROLE_STYLES[member.role]}`}>
            {t.roles[member.role]}
          </span>
        )}

        {canMove(member) && moveOffices.length > 0 && (
          <MoveButton
            profileId={member.profile_id}
            name={name}
            officeId={placeOf(member).officeId}
            teamId={placeOf(member).teamId}
            offices={moveOffices}
            teams={moveTeams}
            allowNoOffice={isOwner}
          />
        )}

        {canRemove(member) && (
          <RemoveMemberButton
            profileId={member.profile_id}
            name={name}
            defaultReassign={session.userId}
            colleagues={colleagues.filter((c) => c.id !== member.profile_id)}
          />
        )}
      </li>
    );
  };

  // the invite form: which roles, and where to (fixed for an office or a team manager)
  const invite = isOwner
    ? { roles: ["broker", "manager", "office_manager"] as Role[], offices: offices as Office[] | null, teams, note: undefined as string | undefined }
    : isOfficeManager
      ? {
          roles: ["broker", "manager"] as Role[],
          offices: null,
          teams: teams.filter((tm) => tm.office_id === session.officeId),
          note: myOffice ? fmt(t.team.inviteOfficeFixed, { office: myOffice.name }) : t.team.noOfficeYet,
        }
      : {
          roles: ["broker"] as Role[],
          offices: null,
          teams: [],
          note: myTeam
            ? fmt(t.team.inviteTeamFixed, { team: myTeam.name })
            : myOffice
              ? fmt(t.team.inviteOfficeFixed, { office: myOffice.name })
              : undefined,
        };

  const placeLabel = (officeId: string | null, teamId: string | null) =>
    [officeId && officeById.get(officeId)?.name, teamId && teamById.get(teamId)?.name].filter(Boolean).join(" · ");

  return (
    <>
      <PageHeader
        title={t.team.title}
        subtitle={fmt(t.team.subtitle, { agency: session.organizationName })}
        actions={
          <>
            {isOwner && <OfficeButton />}
            {session.isManager && (
              <Link href="/team/goals" className={buttonClass.secondary}>
                <Target className="size-4" />
                {t.goals.link}
              </Link>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          {isOwner && teams.length === 0 && <p className="text-sm text-muted">{t.team.structureHint}</p>}

          {groups.map(({ office, teams: officeTeams, loose, count }) => (
            <Card key={office?.id ?? "none"} className="p-0! sm:p-0!">
              <div className="flex items-start gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-fg">
                  <Building2 className="size-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold text-fg">
                    {office?.name ?? t.team.noOffice}{" "}
                    <span className="font-normal text-subtle">{fmt(t.team.people, { count })}</span>
                  </h2>
                  {office && (office.city || office.address || office.phone) && (
                    <p className="mt-0.5 truncate text-sm text-muted">
                      {[office.city, office.address, office.phone].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                {office && isOwner && <OfficeButton office={office} />}
              </div>

              {officeTeams.map((team) => {
                const people = members.filter((m) => placeOf(m).teamId === team.id);
                return (
                  <section key={team.id} className="mt-4">
                    <div className="flex items-center gap-2 border-y border-line-soft bg-raised/50 px-5 py-2 sm:px-6">
                      <Users className="size-4 shrink-0 text-subtle" />
                      <p className="min-w-0 flex-1 truncate text-sm">
                        <span className="font-semibold">{team.name}</span>
                        <span className="text-muted">
                          {" · "}
                          {team.manager_id ? fmt(t.team.ledBy, { name: nameById.get(team.manager_id) ?? "—" }) : t.team.noManager}
                          {" · "}
                          {fmt(t.team.people, { count: people.length })}
                        </span>
                      </p>
                      {canEditTeam(team) && (
                        <TeamButton team={team} officeId={team.office_id} offices={isOwner ? offices : null} candidates={managerCandidates} />
                      )}
                    </div>
                    <ul className="divide-y divide-line-soft">{people.map(memberItem)}</ul>
                  </section>
                );
              })}

              {loose.length > 0 && (
                <section className={officeTeams.length > 0 ? "mt-4" : "mt-2"}>
                  {officeTeams.length > 0 && (
                    <p className="border-y border-line-soft bg-raised/50 px-5 py-2 text-sm font-semibold text-muted sm:px-6">{t.team.noTeam}</p>
                  )}
                  <ul className="divide-y divide-line-soft">{loose.map(memberItem)}</ul>
                </section>
              )}

              {canAddTeam(office?.id ?? null) ? (
                <div className="px-5 py-4 sm:px-6">
                  <TeamButton officeId={office?.id ?? null} offices={isOwner ? offices : null} candidates={managerCandidates} compact />
                </div>
              ) : (
                <div className="h-2" />
              )}
            </Card>
          ))}
        </div>

        <div className="space-y-6">
          <Card>
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-fg">
                <ShieldCheck className="size-4.5" />
              </span>
              <div>
                <p className="font-semibold">{t.roles[session.role]}</p>
                {(myOffice || myTeam) && (
                  <p className="text-sm text-fg-2">{placeLabel(session.officeId, myTeam?.id ?? session.teamId)}</p>
                )}
                <p className="mt-0.5 text-sm text-muted">{t.team.roleHints[session.role]}</p>
              </div>
            </div>
          </Card>

          {session.isManager && (
            <>
              <Card title={isOwner ? t.team.inviteColleague : t.team.inviteTitle} description={t.team.inviteHint}>
                <InviteForm roles={invite.roles} offices={invite.offices} teams={invite.teams} note={invite.note} />
              </Card>

              <Card title={t.team.invites}>
                {!invitations || invitations.length === 0 ? (
                  <p className="text-sm text-muted">{t.team.noInvites}</p>
                ) : (
                  <ul className="space-y-3">
                    {(invitations as Invitation[]).map((invite) => (
                      <li key={invite.id} className="flex items-center gap-3 text-sm">
                        <Mail className="size-4 shrink-0 text-subtle" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{invite.full_name || invite.email}</p>
                          {invite.full_name && <p className="truncate text-xs text-muted">{invite.email}</p>}
                          <p className="text-xs text-muted">
                            {[t.roles[invite.role], placeLabel(invite.office_id, invite.team_id), formatDate(invite.created_at, lang)]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        <RevokeButton id={invite.id} />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </>
          )}

          {isOwner && (
            <Card title={t.team.agencyName}>
              <RenameForm name={session.organizationName} />
              <Link href="/settings#agency" className="mt-3 inline-block text-sm font-medium text-accent-fg hover:underline">
                {t.agency.title} →
              </Link>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
