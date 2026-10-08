"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { createClient } from "@/lib/supabase/client";

/** The chat in the top bar, with the unread messages — new ones count as they come. */
export function ChatButton({ initial }: { initial: number }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [count, setCount] = useState(initial);
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const { data } = await supabase.rpc("chat_unread");
        if (typeof data === "number") setCount(data);
      }, 600);
    };
    refreshRef.current = refresh;
    const channel = supabase
      .channel("chat-unread")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, refresh)
      .subscribe();
    // an open conversation says when it has been read
    window.addEventListener("brixa:chat-read", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("brixa:chat-read", refresh);
      void supabase.removeChannel(channel);
    };
  }, []);

  // moving between pages (a conversation read, an invitation answered)
  useEffect(() => {
    refreshRef.current();
  }, [pathname]);

  return (
    <Link
      href="/chat"
      title={t.chat.title}
      aria-label={t.chat.title}
      className="relative grid size-9 place-items-center rounded-lg border border-line bg-surface text-muted transition hover:bg-raised hover:text-fg"
    >
      <MessagesSquare className="size-4" />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 grid min-w-4.5 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold leading-4.5 text-on-accent">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
