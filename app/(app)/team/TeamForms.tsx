"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { UserMinus } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui/form";
import { fmt } from "@/lib/i18n/dictionaries";
import type { Role } from "@/lib/types";
import {
  inviteMember,
  removeMember,
  renameOrganization,
  revokeInvitation,
  setMemberRole,
  type TeamState,
} from "./actions";

function useErrorText(state: TeamState) {
  const { t } = useI18n();
  if (!state.error) return null;
  if (state.error === "invalidEmail") return t.errors.invalidEmail;
  if (state.error === "generic") return t.errors.generic;
  if (state.error === "forbidden") return t.errors.forbidden;
  return t.team[state.error];
}

export function InviteForm({ canInviteManagers }: { canInviteManagers: boolean }) {
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
      {canInviteManagers && (
        <select name="role" defaultValue="broker" aria-label={t.team.role} className={inputClass}>
          <option value="broker">{t.roles.broker}</option>
          <option value="manager">{t.roles.manager}</option>
        </select>
      )}
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

/** Owner-only: switch a colleague between manager and broker. */
export function RoleSelect({ profileId, role }: { profileId: string; role: Role }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  return (
    <div className="flex flex-col items-end">
      <select
        aria-label={t.team.role}
        value={role}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value;
          setError(false);
          startTransition(async () => {
            const result = await setMemberRole(profileId, next);
            if (!result.ok) setError(true);
          });
        }}
        className={`${inputClass} w-auto py-1.5 text-xs font-semibold`}
      >
        <option value="manager">{t.roles.manager}</option>
        <option value="broker">{t.roles.broker}</option>
      </select>
      {error && <span className="mt-1 text-xs text-danger">{t.errors.generic}</span>}
    </div>
  );
}

/** Remove a colleague after choosing who takes over their properties. */
export function RemoveMemberButton({
  profileId,
  name,
  colleagues,
  defaultReassign,
}: {
  profileId: string;
  name: string;
  colleagues: { id: string; name: string }[];
  defaultReassign: string;
}) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reassignTo, setReassignTo] = useState(defaultReassign);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(false);
    startTransition(async () => {
      const result = await removeMember(profileId, reassignTo);
      if (result.ok) dialogRef.current?.close();
      else setError(true);
    });
  }

  return (
    <>
      <button
        type="button"
        title={t.team.remove}
        aria-label={t.team.remove}
        onClick={() => dialogRef.current?.showModal()}
        className="grid size-9 place-items-center rounded-lg text-subtle transition hover:bg-danger/10 hover:text-danger"
      >
        <UserMinus className="size-4" />
      </button>

      <dialog
        ref={dialogRef}
        className="m-auto w-[min(92vw,420px)] rounded-2xl border border-line bg-surface p-6 text-fg shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      >
        <h2 className="text-lg font-semibold">{fmt(t.team.removeTitle, { name })}</h2>
        <p className="mt-1 text-sm text-muted">{fmt(t.team.reassignHint, { name })}</p>

        <label className="mt-5 block text-sm font-medium text-fg-2">
          {t.team.reassignTo}
          <select
            value={reassignTo}
            onChange={(event) => setReassignTo(event.target.value)}
            className={`${inputClass} mt-1.5`}
          >
            {colleagues.map((colleague) => (
              <option key={colleague.id} value={colleague.id}>
                {colleague.name}
              </option>
            ))}
          </select>
        </label>

        {error && <p className="mt-3 text-sm font-medium text-danger">{t.errors.generic}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={() => dialogRef.current?.close()} className={buttonClass.secondary}>
            {t.common.cancel}
          </button>
          <button type="button" disabled={pending} onClick={confirm} className={buttonClass.danger}>
            <UserMinus className="size-4" />
            {pending ? t.common.loading : t.team.removeButton}
          </button>
        </div>
      </dialog>
    </>
  );
}
