import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/form";
import { formatDate } from "@/lib/format";
import { fmt } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getMembers } from "@/lib/lookups";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { InviteForm, RemoveMemberButton, RenameForm, RevokeButton } from "./TeamForms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.team.title };
}

export default async function TeamPage() {
  const session = (await getSession())!;
  const supabase = await createClient();
  const isOwner = session.role === "owner";

  const [{ t, lang }, members, { data: invitations }] = await Promise.all([
    getI18n(),
    getMembers(supabase, session.organizationId),
    isOwner
      ? supabase
          .from("organization_invitations")
          .select("id, email, created_at")
          .eq("organization_id", session.organizationId)
          .is("accepted_at", null)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { id: string; email: string; created_at: string }[] }),
  ]);

  return (
    <>
      <PageHeader
        title={t.team.title}
        subtitle={fmt(t.team.subtitle, { agency: session.organizationName })}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card title={t.team.members} className="p-0! sm:p-0!">
          <ul className="divide-y divide-slate-100">
            {members.map((member) => {
              const name = member.full_name || member.email;
              const isYou = member.profile_id === session.userId;
              return (
                <li key={member.profile_id} className="flex items-center gap-3 px-5 py-4 sm:px-6">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-indigo-50 text-sm font-semibold text-indigo-700">
                    {name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {name}
                      {isYou && <span className="ml-1.5 text-xs font-normal text-slate-400">({t.team.you})</span>}
                    </p>
                    <p className="truncate text-sm text-slate-500">{member.email}</p>
                  </div>
                  <div className="hidden text-right text-xs text-slate-500 sm:block">
                    <p className="font-semibold text-slate-700">
                      {member.role === "owner" ? t.team.owner : t.team.broker}
                    </p>
                    <p>{formatDate(member.created_at, lang)}</p>
                  </div>
                  {isOwner && member.role !== "owner" && (
                    <RemoveMemberButton profileId={member.profile_id} name={name} />
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="space-y-6">
          {isOwner ? (
            <>
              <Card title={t.team.inviteTitle} description={t.team.inviteHint}>
                <InviteForm />
              </Card>

              <Card title={t.team.invites}>
                {!invitations || invitations.length === 0 ? (
                  <p className="text-sm text-slate-500">{t.team.noInvites}</p>
                ) : (
                  <ul className="space-y-3">
                    {invitations.map((invite) => (
                      <li key={invite.id} className="flex items-center gap-3 text-sm">
                        <Mail className="size-4 shrink-0 text-slate-400" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{invite.email}</p>
                          <p className="text-xs text-slate-500">{formatDate(invite.created_at, lang)}</p>
                        </div>
                        <RevokeButton id={invite.id} />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card title={t.team.agencyName}>
                <RenameForm name={session.organizationName} />
              </Card>
            </>
          ) : (
            <Card>
              <p className="text-sm text-slate-500">{t.team.onlyOwner}</p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
