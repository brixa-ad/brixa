"use client";

import { useActionState, useRef, useState, useTransition, type ReactNode, type RefObject } from "react";
import { ArrowRightLeft, Forward, Pencil, Plus, Trash2, UserMinus } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui/form";
import type { Office, Team } from "@/lib/hierarchy";
import { fmt } from "@/lib/i18n/dictionaries";
import type { Role } from "@/lib/types";
import {
  deleteOffice,
  deleteTeam,
  handOverWork,
  inviteMember,
  moveMember,
  removeMember,
  renameOrganization,
  revokeInvitation,
  saveOffice,
  saveTeam,
  setMemberRole,
  type HandOverPart,
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

const labelClass = "block text-sm font-medium text-fg-2";

/** A modal with a title, its body and a footer of buttons. */
function Dialog({
  dialogRef,
  title,
  children,
  footer,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  title: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <dialog
      ref={dialogRef}
      className="m-auto w-[min(92vw,440px)] rounded-2xl border border-line bg-surface p-6 text-fg shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
      <div className="mt-6 flex flex-wrap items-center justify-end gap-2">{footer}</div>
    </dialog>
  );
}

const iconButton =
  "grid size-9 shrink-0 place-items-center rounded-lg text-subtle transition hover:bg-raised hover:text-fg";

/**
 * Invite a colleague: their email and name, the role this leader may give, and where they'll work.
 * `offices` / `teams` are left out when the place is fixed (an office manager's office, a team manager's team).
 */
export function InviteForm({
  roles,
  offices,
  teams,
  note,
}: {
  roles: Role[];
  offices: Office[] | null;
  teams: Team[];
  note?: string;
}) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<TeamState, FormData>(inviteMember, {});
  const error = useErrorText(state);
  const [role, setRole] = useState<Role>("broker");
  const [officeId, setOfficeId] = useState(offices?.[0]?.id ?? "");
  const officeTeams = offices ? teams.filter((team) => team.office_id === (officeId || null)) : teams;

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
      <input name="full_name" maxLength={120} placeholder={t.team.inviteName} aria-label={t.team.inviteName} className={inputClass} />
      {roles.length > 1 && (
        <select
          name="role"
          value={role}
          onChange={(event) => setRole(event.target.value as Role)}
          aria-label={t.team.role}
          className={inputClass}
        >
          {roles.map((r) => (
            <option key={r} value={r}>
              {t.roles[r]}
            </option>
          ))}
        </select>
      )}
      {offices && offices.length > 0 && (
        <select
          name="office_id"
          value={officeId}
          onChange={(event) => setOfficeId(event.target.value)}
          aria-label={t.team.office}
          className={inputClass}
        >
          {offices.map((office) => (
            <option key={office.id} value={office.id}>
              {t.team.office}: {office.name}
            </option>
          ))}
          <option value="">{t.team.noOffice}</option>
        </select>
      )}
      {role !== "office_manager" && officeTeams.length > 0 && (
        <select name="team_id" key={officeId} defaultValue="" aria-label={t.team.team} className={inputClass}>
          <option value="">{t.team.noTeam}</option>
          {officeTeams.map((team) => (
            <option key={team.id} value={team.id}>
              {t.team.team}: {team.name}
            </option>
          ))}
        </select>
      )}
      {note && <p className="text-xs text-muted">{note}</p>}
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

/** A leader changes a colleague's role (among the roles they may give). */
export function RoleSelect({ profileId, role, options }: { profileId: string; role: Role; options: Role[] }) {
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
        className={`${inputClass} w-auto py-1.5 font-semibold sm:text-xs`}
      >
        {options.map((r) => (
          <option key={r} value={r}>
            {t.roles[r]}
          </option>
        ))}
      </select>
      {error && <span className="mt-1 text-xs text-danger">{t.errors.generic}</span>}
    </div>
  );
}

/** Put a colleague into an office and a team. */
export function MoveButton({
  profileId,
  name,
  officeId,
  teamId,
  offices,
  teams,
  allowNoOffice,
}: {
  profileId: string;
  name: string;
  officeId: string | null;
  teamId: string | null;
  offices: Office[];
  teams: Team[];
  allowNoOffice: boolean;
}) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [office, setOffice] = useState(officeId ?? "");
  const [team, setTeam] = useState(teamId ?? "");
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const officeTeams = teams.filter((tm) => tm.office_id === (office || null));

  function save() {
    setError(false);
    startTransition(async () => {
      const result = await moveMember(profileId, office || null, team || null);
      if (result.ok) dialogRef.current?.close();
      else setError(true);
    });
  }

  return (
    <>
      <button type="button" title={t.team.move} aria-label={t.team.move} onClick={() => dialogRef.current?.showModal()} className={iconButton}>
        <ArrowRightLeft className="size-4" />
      </button>
      <Dialog
        dialogRef={dialogRef}
        title={fmt(t.team.moveTitle, { name })}
        footer={
          <>
            <button type="button" onClick={() => dialogRef.current?.close()} className={buttonClass.secondary}>
              {t.common.cancel}
            </button>
            <button type="button" disabled={pending} onClick={save} className={buttonClass.primary}>
              {pending ? t.common.saving : t.common.save}
            </button>
          </>
        }
      >
        <label className={labelClass}>
          {t.team.office}
          <select
            value={office}
            onChange={(event) => {
              setOffice(event.target.value);
              setTeam("");
            }}
            className={`${inputClass} mt-1.5`}
          >
            {offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
            {allowNoOffice && <option value="">{t.team.noOffice}</option>}
          </select>
        </label>
        <label className={labelClass}>
          {t.team.team}
          <select value={team} onChange={(event) => setTeam(event.target.value)} className={`${inputClass} mt-1.5`}>
            <option value="">{t.team.noTeam}</option>
            {officeTeams.map((tm) => (
              <option key={tm.id} value={tm.id}>
                {tm.name}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="text-sm font-medium text-danger">{t.errors.generic}</p>}
      </Dialog>
    </>
  );
}

/** The owner opens a new office, or changes / closes one. */
export function OfficeButton({ office }: { office?: Office }) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  function save(formData: FormData) {
    setError(false);
    startTransition(async () => {
      const result = await saveOffice({
        id: office?.id ?? null,
        name: String(formData.get("name") ?? ""),
        city: String(formData.get("city") ?? ""),
        address: String(formData.get("address") ?? ""),
        phone: String(formData.get("phone") ?? ""),
      });
      if (result.ok) dialogRef.current?.close();
      else setError(true);
    });
  }

  function remove() {
    if (!office || !window.confirm(`${t.team.deleteOffice}? ${t.team.deleteOfficeHint}`)) return;
    startTransition(async () => {
      const result = await deleteOffice(office.id);
      if (result.ok) dialogRef.current?.close();
      else setError(true);
    });
  }

  return (
    <>
      {office ? (
        <button type="button" title={t.common.edit} aria-label={t.common.edit} onClick={() => dialogRef.current?.showModal()} className={iconButton}>
          <Pencil className="size-4" />
        </button>
      ) : (
        <button type="button" onClick={() => dialogRef.current?.showModal()} className={buttonClass.secondary}>
          <Plus className="size-4" />
          {t.team.addOffice}
        </button>
      )}
      <dialog
        ref={dialogRef}
        className="m-auto w-[min(92vw,440px)] rounded-2xl border border-line bg-surface p-6 text-fg shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      >
        <form action={save}>
          <h2 className="text-lg font-semibold">{office ? t.team.editOffice : t.team.addOffice}</h2>
          <div className="mt-4 space-y-4">
            <label className={labelClass}>
              {t.team.officeName}
              <input name="name" required minLength={2} maxLength={80} defaultValue={office?.name ?? ""} className={`${inputClass} mt-1.5`} />
            </label>
            <label className={labelClass}>
              {t.team.officeCity}
              <input name="city" maxLength={80} defaultValue={office?.city ?? ""} className={`${inputClass} mt-1.5`} />
            </label>
            <label className={labelClass}>
              {t.team.officeAddress}
              <input name="address" maxLength={200} defaultValue={office?.address ?? ""} className={`${inputClass} mt-1.5`} />
            </label>
            <label className={labelClass}>
              {t.team.officePhone}
              <input name="phone" type="tel" maxLength={40} defaultValue={office?.phone ?? ""} className={`${inputClass} mt-1.5`} />
            </label>
            {error && <p className="text-sm font-medium text-danger">{t.errors.generic}</p>}
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
            {office && (
              <button type="button" disabled={pending} onClick={remove} className={`${buttonClass.secondary} mr-auto text-danger`}>
                <Trash2 className="size-4" />
                {t.team.deleteOffice}
              </button>
            )}
            <button type="button" onClick={() => dialogRef.current?.close()} className={buttonClass.secondary}>
              {t.common.cancel}
            </button>
            <button type="submit" disabled={pending} className={buttonClass.primary}>
              {pending ? t.common.saving : t.common.save}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

/**
 * Make a team or change one: its name, its office (the owner) and who leads it. `offices` is
 * left out when the office is fixed (an office manager's own).
 */
export function TeamButton({
  team,
  officeId,
  offices,
  candidates,
  compact = false,
}: {
  team?: Team;
  officeId: string | null;
  offices: Office[] | null;
  candidates: { id: string; name: string; officeId: string | null }[];
  compact?: boolean;
}) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [office, setOffice] = useState(team?.office_id ?? officeId ?? "");
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  // the manager comes from the team's office (or anyone, for a team with no office)
  const people = candidates.filter((c) => !office || c.officeId === office || c.id === team?.manager_id);

  function save(formData: FormData) {
    setError(false);
    startTransition(async () => {
      const result = await saveTeam({
        id: team?.id ?? null,
        officeId: office || null,
        name: String(formData.get("name") ?? ""),
        managerId: String(formData.get("manager_id") ?? "") || null,
      });
      if (result.ok) dialogRef.current?.close();
      else setError(true);
    });
  }

  function remove() {
    if (!team || !window.confirm(`${t.team.deleteTeam}? ${t.team.deleteTeamHint}`)) return;
    startTransition(async () => {
      const result = await deleteTeam(team.id);
      if (result.ok) dialogRef.current?.close();
      else setError(true);
    });
  }

  return (
    <>
      {team ? (
        <button type="button" title={t.common.edit} aria-label={t.common.edit} onClick={() => dialogRef.current?.showModal()} className={iconButton}>
          <Pencil className="size-3.5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          className={compact ? "inline-flex items-center gap-1 text-sm font-medium text-accent-fg hover:underline" : buttonClass.secondary}
        >
          <Plus className="size-4" />
          {t.team.addTeam}
        </button>
      )}
      <dialog
        ref={dialogRef}
        className="m-auto w-[min(92vw,440px)] rounded-2xl border border-line bg-surface p-6 text-fg shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      >
        <form action={save}>
          <h2 className="text-lg font-semibold">{team ? t.team.editTeam : t.team.addTeam}</h2>
          <div className="mt-4 space-y-4">
            <label className={labelClass}>
              {t.team.teamName}
              <input name="name" required minLength={2} maxLength={80} defaultValue={team?.name ?? ""} className={`${inputClass} mt-1.5`} />
            </label>
            {offices && (
              <label className={labelClass}>
                {t.team.office}
                <select value={office} onChange={(event) => setOffice(event.target.value)} className={`${inputClass} mt-1.5`}>
                  {offices.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                  <option value="">{t.team.noOffice}</option>
                </select>
              </label>
            )}
            <label className={labelClass}>
              {t.team.teamManager}
              <select name="manager_id" defaultValue={team?.manager_id ?? ""} key={office} className={`${inputClass} mt-1.5`}>
                <option value="">{t.team.noManager}</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs font-normal text-muted">{t.team.teamManagerHint}</span>
            </label>
            {error && <p className="text-sm font-medium text-danger">{t.errors.generic}</p>}
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
            {team && (
              <button type="button" disabled={pending} onClick={remove} className={`${buttonClass.secondary} mr-auto text-danger`}>
                <Trash2 className="size-4" />
                {t.team.deleteTeam}
              </button>
            )}
            <button type="button" onClick={() => dialogRef.current?.close()} className={buttonClass.secondary}>
              {t.common.cancel}
            </button>
            <button type="submit" disabled={pending} className={buttonClass.primary}>
              {pending ? t.common.saving : t.common.save}
            </button>
          </div>
        </form>
      </dialog>
    </>
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
        className="grid size-9 shrink-0 place-items-center rounded-lg text-subtle transition hover:bg-danger/10 hover:text-danger"
      >
        <UserMinus className="size-4" />
      </button>

      <Dialog
        dialogRef={dialogRef}
        title={fmt(t.team.removeTitle, { name })}
        footer={
          <>
            <button type="button" onClick={() => dialogRef.current?.close()} className={buttonClass.secondary}>
              {t.common.cancel}
            </button>
            <button type="button" disabled={pending} onClick={confirm} className={buttonClass.danger}>
              <UserMinus className="size-4" />
              {pending ? t.common.loading : t.team.removeButton}
            </button>
          </>
        }
      >
        <p className="text-sm text-muted">{fmt(t.team.reassignHint, { name })}</p>
        <label className={labelClass}>
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
        {error && <p className="text-sm font-medium text-danger">{t.errors.generic}</p>}
      </Dialog>
    </>
  );
}

/** Hand a broker's work (the parts ticked) to a colleague; the broker stays in the agency. */
export function HandOverButton({
  profileId,
  name,
  colleagues,
}: {
  profileId: string;
  name: string;
  /** whom the work may go to (the one handing over first) */
  colleagues: { id: string; name: string }[];
}) {
  const { t } = useI18n();
  const H = t.handover;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [to, setTo] = useState(colleagues[0]?.id ?? "");
  const [parts, setParts] = useState<Set<HandOverPart>>(new Set(["clients", "properties", "deals", "tasks"]));
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const ALL: HandOverPart[] = ["clients", "properties", "deals", "tasks"];

  function run() {
    setError(false);
    setDone(null);
    startTransition(async () => {
      const result = await handOverWork(profileId, to, [...parts]);
      if (!result.ok || !result.counts) return setError(true);
      const c = result.counts;
      const list = ALL.filter((p) => c[p] > 0).map((p) => `${H[p]}: ${c[p]}`);
      setDone(list.length > 0 ? fmt(H.done, { parts: list.join(", ") }) : H.nothing);
    });
  }

  return (
    <>
      <button type="button" title={H.button} aria-label={H.button} onClick={() => dialogRef.current?.showModal()} className={iconButton}>
        <Forward className="size-4" />
      </button>
      <Dialog
        dialogRef={dialogRef}
        title={fmt(H.title, { name })}
        footer={
          <>
            <button type="button" onClick={() => dialogRef.current?.close()} className={buttonClass.secondary}>
              {done ? t.common.back : t.common.cancel}
            </button>
            {!done && (
              <button type="button" disabled={pending || parts.size === 0 || !to} onClick={run} className={buttonClass.primary}>
                <Forward className="size-4" />
                {pending ? t.common.loading : H.run}
              </button>
            )}
          </>
        }
      >
        <p className="text-sm text-muted">{fmt(H.hint, { name })}</p>
        <div className="space-y-2">
          {ALL.map((p) => (
            <label key={p} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={parts.has(p)}
                onChange={() =>
                  setParts((current) => {
                    const next = new Set(current);
                    if (next.has(p)) next.delete(p);
                    else next.add(p);
                    return next;
                  })
                }
                className="size-4 accent-[var(--accent)]"
              />
              {H[p]}
            </label>
          ))}
        </div>
        <label className={labelClass}>
          {H.to}
          <select value={to} onChange={(e) => setTo(e.target.value)} className={`${inputClass} mt-1.5`}>
            {colleagues.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {done && <p className="text-sm font-medium text-success">{done}</p>}
        {error && <p className="text-sm font-medium text-danger">{t.errors.generic}</p>}
      </Dialog>
    </>
  );
}
