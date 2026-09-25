import type { Metadata } from "next";
import Link from "next/link";
import { Mail, Phone, ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/form";
import { formatDate } from "@/lib/format";
import { fmt } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getMembers } from "@/lib/lookups";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";
import { InviteForm, RemoveMemberButton, RenameForm, RevokeButton, RoleSelect } from "./TeamForms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.team.title };
}

const ROLE_STYLES: Record<Role, string> = {
  owner: "bg-accent-soft text-accent-fg",
  manager: "bg-sky-500/10 text-sky-500",
  broker: "bg-raised text-fg-2",
};

export default async function TeamPage() {
  const session = (await getSession())!;
  const supabase = await createClient();
  const isOwner = session.role === "owner";

  const [{ t, lang }, members, { data: invitations }] = await Promise.all([
    getI18n(),
    getMembers(supabase, session.organizationId),
    session.isManager
      ? supabase
          .from("organization_invitations")
          .select("id, email, role, created_at")
          .eq("organization_id", session.organizationId)
          .is("accepted_at", null)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { id: string; email: string; role: Role; created_at: string }[] }),
  ]);

  const nameOf = (m: { full_name: string | null; email: string }) => m.full_name || m.email;

  return (
    <>
      <PageHeader
        title={t.team.title}
        subtitle={fmt(t.team.subtitle, { agency: session.organizationName })}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="p-0! sm:p-0!">
          <h2 className="px-5 pt-5 text-base font-semibold text-fg sm:px-6 sm:pt-6">
            {t.team.members} <span className="font-normal text-subtle">{members.length}</span>
          </h2>
          <ul className="mt-2 divide-y divide-line-soft">
            {members.map((member) => {
              const name = nameOf(member);
              const isYou = member.profile_id === session.userId;
              const canChangeRole = isOwner && member.role !== "owner";
              const canRemove =
                !isYou &&
                member.role !== "owner" &&
                (isOwner || (session.role === "manager" && member.role === "broker"));

              return (
                <li key={member.profile_id} className="flex items-center gap-3 px-5 py-4 sm:px-6">
                  <Link
                    href={`/team/${member.profile_id}`}
                    className="group flex min-w-0 flex-1 items-center gap-3"
                  >
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
                      className="hidden items-center gap-1.5 text-sm text-muted hover:text-fg sm:flex"
                    >
                      <Phone className="size-3.5" />
                      {member.phone}
                    </a>
                  )}

                  {canChangeRole ? (
                    <RoleSelect profileId={member.profile_id} role={member.role} />
                  ) : (
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ROLE_STYLES[member.role]}`}>
                      {t.roles[member.role]}
                    </span>
                  )}

                  {canRemove && (
                    <RemoveMemberButton
                      profileId={member.profile_id}
                      name={name}
                      defaultReassign={session.userId}
                      colleagues={members
                        .filter((m) => m.profile_id !== member.profile_id)
                        .map((m) => ({ id: m.profile_id, name: nameOf(m) }))}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="space-y-6">
          <Card>
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-fg">
                <ShieldCheck className="size-4.5" />
              </span>
              <div>
                <p className="font-semibold">{t.roles[session.role]}</p>
                <p className="mt-0.5 text-sm text-muted">{t.team.roleHint}</p>
              </div>
            </div>
          </Card>

          {session.isManager && (
            <>
              <Card title={isOwner ? t.team.inviteColleague : t.team.inviteTitle} description={t.team.inviteHint}>
                <InviteForm canInviteManagers={isOwner} />
              </Card>

              <Card title={t.team.invites}>
                {!invitations || invitations.length === 0 ? (
                  <p className="text-sm text-muted">{t.team.noInvites}</p>
                ) : (
                  <ul className="space-y-3">
                    {invitations.map((invite) => (
                      <li key={invite.id} className="flex items-center gap-3 text-sm">
                        <Mail className="size-4 shrink-0 text-subtle" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{invite.email}</p>
                          <p className="text-xs text-muted">
                            {t.roles[invite.role as Role]} · {formatDate(invite.created_at, lang)}
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
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
