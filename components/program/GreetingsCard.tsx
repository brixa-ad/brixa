import Link from "next/link";
import { Cake, PartyPopper } from "lucide-react";
import type { Greeting } from "@/lib/greetings-server";
import { fmt, type Dictionary } from "@/lib/i18n/dictionaries";
import { MessageSender } from "./MessageSender";

/** Today's name days and birthdays among my clients, each with a greeting to send in one tap. */
export function GreetingsList({ greetings, t }: { greetings: Greeting[]; t: Dictionary }) {
  return (
    <ul className="space-y-3">
      {greetings.map((g) => (
        <li key={`${g.clientId}-${g.reason}`} className="rounded-xl bg-raised/50 p-3">
          <div className="flex items-center gap-2">
            {g.reason === "birthday" ? <Cake className="size-4 shrink-0 text-warning" /> : <PartyPopper className="size-4 shrink-0 text-brand-cyan" />}
            <Link href={`/clients/${g.clientId}`} className="min-w-0 flex-1 truncate text-sm font-semibold hover:text-accent-fg">
              {g.name}
            </Link>
            <span className="shrink-0 text-xs text-muted">
              {g.reason === "birthday" ? t.programs.birthday : fmt(t.programs.nameDay, { feast: g.feast ?? "" })}
            </span>
          </div>
          <div className="mt-2">
            <MessageSender text={g.text} phone={g.phone} email={g.email} compact />
          </div>
        </li>
      ))}
    </ul>
  );
}
