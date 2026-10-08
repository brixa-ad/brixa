"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, LogOut, UserPlus } from "lucide-react";
import { addChatPeople, inviteToChat, leaveChat, renameChat, setChatMuted } from "@/app/(app)/chat/actions";
import { Avatar } from "@/components/Avatar";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import type { ChatKind } from "@/lib/chat";
import { PeoplePicker, type Colleague } from "./NewChat";

export type RoomPerson = { id: string; name: string; avatar_path: string | null; agency: string | null; status: "active" | "invited" | "left" };

/** A conversation's people and its settings: mute, rename, more colleagues, another agency's broker, leave. */
export function RoomMenu({
  room,
  kind,
  title,
  muted,
  shared,
  people,
  colleagues,
  onClose,
}: {
  room: string;
  kind: ChatKind;
  title: string | null;
  muted: boolean;
  shared: boolean;
  people: RoomPerson[];
  /** the agency's colleagues not in it yet */
  colleagues: Colleague[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const C = t.chat;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(title ?? "");
  const [adding, setAdding] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const group = kind === "group";
  const run = (work: () => Promise<unknown>, after?: () => void) =>
    startTransition(async () => {
      await work();
      router.refresh();
      after?.();
    });

  return (
    <Modal title={C.people} onClose={onClose}>
      {shared && <p className="mb-3 rounded-xl bg-brand-cyan/10 px-3 py-2 text-sm text-fg-2">{C.sharedNote}</p>}
      <ul className="max-h-60 space-y-1 overflow-y-auto">
        {people
          .filter((p) => p.status !== "left")
          .map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-1 py-1.5">
              <Avatar path={p.avatar_path} name={p.name} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{p.name}</span>
                {(p.agency || p.status === "invited") && (
                  <span className="block truncate text-xs text-muted">{[p.agency, p.status === "invited" ? C.invitedPerson : null].filter(Boolean).join(" · ")}</span>
                )}
              </span>
            </li>
          ))}
      </ul>

      <div className="mt-4 space-y-4 border-t border-line-soft pt-4">
        <button type="button" disabled={pending} onClick={() => run(() => setChatMuted(room, !muted))} className={`${buttonClass.secondary} w-full`}>
          {muted ? <Bell className="size-4" /> : <BellOff className="size-4" />}
          {muted ? C.unmute : C.mute}
        </button>

        {group && (
          <>
            <div className="flex gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={C.groupName} className={inputClass} />
              <button type="button" disabled={pending} onClick={() => run(() => renameChat(room, name))} className={buttonClass.secondary}>
                {C.save}
              </button>
            </div>

            {colleagues.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium text-fg-2">{C.addPeople}</p>
                <PeoplePicker people={colleagues} chosen={adding} onChange={setAdding} />
                {adding.length > 0 && (
                  <button type="button" disabled={pending} onClick={() => run(() => addChatPeople(room, adding), () => setAdding([]))} className={`${buttonClass.primary} mt-2 w-full`}>
                    <UserPlus className="size-4" />
                    {C.addPeople}
                  </button>
                )}
              </div>
            )}

            <div>
              <p className="mb-1.5 text-sm font-medium text-fg-2">{C.inviteOther}</p>
              <div className="flex gap-2">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={C.inviteEmail} className={inputClass} />
                <button
                  type="button"
                  disabled={pending || !email.includes("@")}
                  onClick={() =>
                    startTransition(async () => {
                      const { result } = await inviteToChat(room, email);
                      setNote(
                        result === "invited" ? C.inviteSent : result === "added" ? C.inviteAdded : result === "not_found" ? C.inviteNotFound : result === "already" ? C.inviteAlready : t.errors.generic
                      );
                      if (result === "invited" || result === "added") {
                        setEmail("");
                        router.refresh();
                      }
                    })
                  }
                  className={buttonClass.secondary}
                >
                  {C.invite}
                </button>
              </div>
              {note && <p className="mt-1.5 text-sm text-fg-2">{note}</p>}
            </div>

            {leaving ? (
              <div className="rounded-xl border border-danger/30 p-3">
                <p className="text-sm">{C.leaveConfirm}</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" disabled={pending} onClick={() => run(() => leaveChat(room), () => router.push("/chat"))} className={buttonClass.danger}>
                    {C.leave}
                  </button>
                  <button type="button" onClick={() => setLeaving(false)} className={buttonClass.ghost}>
                    {t.common.cancel}
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setLeaving(true)} className={`${buttonClass.ghost} w-full text-danger`}>
                <LogOut className="size-4" />
                {C.leave}
              </button>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
