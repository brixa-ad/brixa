import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { buttonClass, inputClass } from "@/components/ui/form";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Проверка на известия" };

type Check = {
  name: string;
  agency: string | null;
  devices: { agent: string | null; since: string }[];
  notifications: { type: string; made: string; pushed: string | null; read: string | null; text: string | null }[];
  chats: { kind: string; title: string | null; status: string; muted: boolean; joined: string; read: string; with: string | null }[];
};

const when = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("bg-BG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Sofia" }).format(new Date(iso)) : "—";

/** BRIXA's own check of someone's notifications: devices, the last notifications (made / sent / read), conversations. */
export default async function PushCheckPage({ searchParams }: PageProps<"/admin/push">) {
  const session = await getSession();
  if (!session?.platformAdmin) notFound();
  const { email } = await searchParams;
  const target = typeof email === "string" ? email.trim() : "";
  const supabase = await createClient();
  const { data, error } = target ? await supabase.rpc("platform_push_check", { target_email: target }) : { data: null, error: null };
  const check = data as Check | null;

  return (
    <div className="space-y-6">
      <PageHeader title="Проверка на известия" backHref="/admin" backLabel="Агенции" />
      <form className="flex gap-2">
        <input name="email" type="email" defaultValue={target} placeholder="имейл" className={inputClass} />
        <button className={buttonClass.primary}>Провери</button>
      </form>
      {error && <p className="text-sm text-danger">{error.message}</p>}
      {target && !check && !error && <p className="text-sm text-muted">Няма такъв профил.</p>}
      {check && (
        <div className="space-y-6 text-sm">
          <p className="font-semibold">
            {check.name} · {check.agency ?? "—"}
          </p>
          <section>
            <h2 className="mb-2 font-semibold">Устройства с известия ({check.devices.length})</h2>
            <ul className="space-y-1">
              {check.devices.map((d, i) => (
                <li key={i} className="rounded-lg bg-surface px-3 py-2 ring-1 ring-line">
                  {when(d.since)} · <span className="text-muted">{d.agent?.slice(0, 120)}</span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="mb-2 font-semibold">Последни известия</h2>
            <ul className="space-y-1">
              {check.notifications.map((n, i) => (
                <li key={i} className="rounded-lg bg-surface px-3 py-2 ring-1 ring-line">
                  <span className="font-medium">{n.type}</span> · направено {when(n.made)} · <span className={n.pushed ? "text-success" : "text-danger"}>до телефона {when(n.pushed)}</span> · прочетено {when(n.read)}
                  {n.text && <span className="block truncate text-muted">{n.text}</span>}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="mb-2 font-semibold">Разговори</h2>
            <ul className="space-y-1">
              {check.chats.map((c, i) => (
                <li key={i} className="rounded-lg bg-surface px-3 py-2 ring-1 ring-line">
                  {c.kind} · {c.title ?? c.with ?? "—"} · <span className="font-medium">{c.status}</span>
                  {c.muted && " · заглушен"} · влязъл {when(c.joined)} · прочетено {when(c.read)}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
