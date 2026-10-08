"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { answerChatInvite } from "@/app/(app)/chat/actions";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass } from "@/components/ui/form";
import { fmt } from "@/lib/i18n/dictionaries";

/** At the bottom of a message request: who asks, and accept or decline. */
export function RequestBar({ room, name, agency }: { room: string; name: string; agency: string }) {
  const { t } = useI18n();
  const C = t.chat;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="border-t border-line bg-canvas/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
      <p className="text-center text-sm text-fg-2">{fmt(C.requestBar, { name, agency })}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await answerChatInvite(room, false);
              router.push("/chat");
            })
          }
          className={`${buttonClass.secondary} flex-1`}
        >
          {C.decline}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await answerChatInvite(room, true);
              router.refresh();
            })
          }
          className={`${buttonClass.primary} flex-1`}
        >
          {C.accept}
        </button>
      </div>
    </div>
  );
}
