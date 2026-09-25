"use client";

import { useActionState, useTransition } from "react";
import { UserMinus } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui/form";
import { fmt } from "@/lib/i18n/dictionaries";
import {
  inviteMember,
  removeMember,
  renameOrganization,
  revokeInvitation,
  type TeamState,
} from "./actions";

function useErrorText(state: TeamState) {
  const { t } = useI18n();
  if (!state.error) return null;
  if (state.error === "invalidEmail") return t.errors.invalidEmail;
  if (state.error === "generic") return t.errors.generic;
  return t.team[state.error];
}

export function InviteForm() {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<TeamState, FormData>(inviteMember, {});
  const error = useErrorText(state);

  return (
    <form action={action} className="space-y-3">
      <input
        name="email"
        type="email"
        required
        placeholder={t.team.inviteEmail}
        aria-label={t.team.inviteEmail}
        className={inputClass}
      />
      {error && <p className="text-sm font-medium text-danger">{error}</p>}
      {state.success && <p className="text-sm font-medium text-success">{t.team.inviteSent}</p>}
      <button type="submit" disabled={pending} className={`${buttonClass.primary} w-full`}>
        {pending ? t.common.loading : t.team.inviteButton}
      </button>
    </form>
  );
}

export function RenameForm({ name }: { name: string }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<TeamState, FormData>(renameOrganization, {});
  const error = useErrorText(state);

  return (
    <form action={action} className="space-y-3">
      <input
        name="name"
        defaultValue={name}
        required
        maxLength={120}
        aria-label={t.team.agencyName}
        className={inputClass}
      />
      {error && <p className="text-sm font-medium text-danger">{error}</p>}
      <button type="submit" disabled={pending} className={`${buttonClass.secondary} w-full`}>
        {pending ? t.common.saving : t.team.rename}
      </button>
    </form>
  );
}

export function RevokeButton({ id }: { id: string }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => revokeInvitation(id))}
      className="text-xs font-semibold text-muted hover:text-danger disabled:opacity-50"
    >
      {t.team.revoke}
    </button>
  );
}

export function RemoveMemberButton({ profileId, name }: { profileId: string; name: string }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      title={t.team.remove}
      aria-label={t.team.remove}
      onClick={() => {
        if (!window.confirm(fmt(t.team.removeConfirm, { name }))) return;
        startTransition(() => removeMember(profileId));
      }}
      className="grid size-9 place-items-center rounded-lg text-subtle transition hover:bg-danger/10 hover:text-danger disabled:opacity-50"
    >
      <UserMinus className="size-4" />
    </button>
  );
}
