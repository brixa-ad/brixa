"use client";

import { useEffect, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { sendChatCard } from "@/app/(app)/chat/actions";
import { useI18n } from "@/components/I18nProvider";
import { Modal } from "@/components/ui/Modal";
import { formatPrice } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { CardKind } from "./Composer";

type Found = { id: string; title: string; hint: string };

/** A listing, client or deal of BRIXA to send: the latest first, or found by name. */
export function CardPicker({ room, kind, myOrg, onClose }: { room: string; kind: CardKind; myOrg: string; onClose: () => void }) {
  const { t, lang } = useI18n();
  const C = t.chat;
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    const supabase = createClient();
    const q = query.trim().replace(/[%_]/g, "");
    const timer = setTimeout(async () => {
      let rows: Found[] = [];
      if (kind === "property") {
        let req = supabase.from("properties").select("id, title, current_price, currency, status").eq("organization_id", myOrg);
        if (q) req = req.ilike("title", `%${q}%`);
        const { data } = await req.order("updated_at", { ascending: false }).limit(20);
        rows = (data ?? []).map((p) => ({ id: p.id, title: p.title, hint: formatPrice(p.current_price, p.currency, lang) ?? "" }));
      } else if (kind === "client") {
        let req = supabase.from("clients").select("id, full_name, types").eq("organization_id", myOrg);
        if (q) req = req.ilike("full_name", `%${q}%`);
        const { data } = await req.order("updated_at", { ascending: false }).limit(20);
        rows = (data ?? []).map((c) => ({
          id: c.id,
          title: c.full_name,
          hint: (c.types as string[]).map((x) => t.options.clientType[x as keyof typeof t.options.clientType] ?? x).join(", "),
        }));
      } else {
        const { data } = await supabase
          .from("deals")
          .select("id, stage, kind, price, currency, property:properties(title), client:clients(full_name)")
          .eq("organization_id", myOrg)
          .eq("status", "open")
          .order("updated_at", { ascending: false })
          .limit(40);
        rows = ((data ?? []) as unknown as { id: string; stage: string; kind: string; price: number | null; currency: string; property: { title: string } | null; client: { full_name: string } | null }[])
          .map((d) => {
            const stages = d.kind === "rent" ? t.options.dealStageRent : t.options.dealStage;
            return {
              id: d.id,
              title: d.property?.title ?? d.client?.full_name ?? "—",
              hint: [stages[d.stage as keyof typeof stages], d.client?.full_name].filter(Boolean).join(" · "),
            };
          })
          .filter((d) => !q || `${d.title} ${d.hint}`.toLowerCase().includes(q.toLowerCase()))
          .slice(0, 20);
      }
      if (alive) setFound(rows);
    }, q ? 250 : 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [kind, myOrg, query, lang, t]);

  const title = kind === "property" ? C.property : kind === "client" ? C.client : C.deal;
  return (
    <Modal title={`${C.pickCard} · ${title}`} onClose={onClose}>
      <label className="mb-3 flex items-center gap-2 rounded-lg border border-line-strong bg-raised px-3">
        <Search className="size-4 text-muted" />
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={C.search} className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none sm:text-sm" />
      </label>
      {failed && <p className="mb-2 text-sm text-danger">{t.errors.generic}</p>}
      {found === null ? (
        <p className="py-6 text-center text-sm text-muted">{t.common.loading}</p>
      ) : found.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">{C.noResults}</p>
      ) : (
        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {found.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await sendChatCard(room, kind, f.id);
                    if (result.ok) onClose();
                    else setFailed(true);
                  })
                }
                className="flex w-full flex-col rounded-xl px-3 py-2 text-left transition hover:bg-raised disabled:opacity-60"
              >
                <span className="truncate text-sm font-medium">{f.title}</span>
                {f.hint && <span className="truncate text-xs text-muted">{f.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
