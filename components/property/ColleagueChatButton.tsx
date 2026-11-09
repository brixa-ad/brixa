"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, MessagesSquare } from "lucide-react";
import { startDirectChat } from "@/app/(app)/chat/actions";

/** The personal chat with a colleague (made at once if there isn't one yet). */
export function ColleagueChatButton({ person, label }: { person: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      title={label}
      aria-label={label}
      onClick={async () => {
        setBusy(true);
        const result = await startDirectChat(person);
        if (result.id) router.push(`/chat/${result.id}`);
        else setBusy(false);
      }}
      className="grid size-8 place-items-center rounded-lg text-accent-fg transition hover:bg-raised disabled:opacity-60"
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <MessagesSquare className="size-4" />}
    </button>
  );
}
