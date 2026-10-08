"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Search } from "lucide-react";
import { createChatGroup } from "@/app/(app)/chat/actions";
import { Avatar } from "@/components/Avatar";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass, inputClass } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";

export type Colleague = { id: string; name: string; avatar_path: string | null };

/** Colleagues to tick, with a search; shared by "New conversation" and "Add colleagues". */
export function PeoplePicker({ people, chosen, onChange }: { people: Colleague[]; chosen: string[]; onChange: (ids: string[]) => void }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? people.filter((p) => p.name.toLowerCase().includes(q)) : people;
  }, [people, query]);
  return (
    <div>
      {people.length > 6 && (
        <label className="mb-2 flex items-center gap-2 rounded-lg border border-line-strong bg-raised px-3">
          <Search className="size-4 text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.chat.search} className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none sm:text-sm" />
        </label>
      )}
      <ul className="max-h-72 space-y-1 overflow-y-auto">
        {shown.map((p) => {
          const on = chosen.includes(p.id);
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onChange(on ? chosen.filter((id) => id !== p.id) : [...chosen, p.id])}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${on ? "bg-accent-soft" : "hover:bg-raised"}`}
              >
                <Avatar path={p.avatar_path} name={p.name} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                <span className={`grid size-5 place-items-center rounded-md border ${on ? "border-accent bg-accent text-on-accent" : "border-line-strong"}`}>
                  {on && <Check className="size-3.5" />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** "New conversation": the colleagues, and a name if it's a group. */
export function NewChat({ colleagues }: { colleagues: Colleague[] }) {
  const { t } = useI18n();
  const C = t.chat;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass.primary}>
        <Plus className="size-4" />
        {C.newChat}
      </button>
      {open && (
        <Modal title={C.newChat} onClose={() => setOpen(false)}>
          <p className="mb-2 text-sm font-medium text-fg-2">{C.pickPeople}</p>
          <PeoplePicker people={colleagues} chosen={chosen} onChange={setChosen} />
          <label className="mt-4 block text-sm">
            <span className="mb-1.5 block font-medium text-fg-2">{C.groupName}</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className={inputClass} />
            <span className="mt-1 block text-xs text-muted">{C.groupNameHint}</span>
          </label>
          {failed && <p className="mt-3 text-sm text-danger">{t.errors.generic}</p>}
          <button
            type="button"
            disabled={pending || chosen.length === 0}
            onClick={() =>
              startTransition(async () => {
                const result = await createChatGroup(title, chosen);
                if (result.id) router.push(`/chat/${result.id}`);
                else setFailed(true);
              })
            }
            className={`${buttonClass.primary} mt-5 w-full`}
          >
            {pending ? t.common.loading : C.create}
          </button>
        </Modal>
      )}
    </>
  );
}
