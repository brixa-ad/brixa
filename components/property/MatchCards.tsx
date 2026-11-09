import Link from "next/link";
import { Handshake, MessageCircle, Phone, UserSearch, Users } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { ClassBadge } from "@/components/client/ClassBadge";
import { Card } from "@/components/ui/form";
import { fmt, type Dictionary } from "@/lib/i18n/dictionaries";
import type { BuyerMatch, ColleagueBuyers, PartnerMatch } from "@/lib/matching";
import { telHref, viberHref } from "@/lib/phone";
import { ColleagueChatButton } from "./ColleagueChatButton";

/** On a listing: our clients whose search fits it. */
export function BuyerMatchesCard({ buyers, t }: { buyers: BuyerMatch[]; t: Dictionary }) {
  return (
    <Card
      id="buyers"
      title={
        <span className="flex items-center gap-2">
          <Users className="size-4 text-brand-cyan" />
          {t.partnerSearches.buyersTitle}
          <span className="font-normal text-subtle">{buyers.length}</span>
        </span>
      }
      description={t.partnerSearches.buyersHint}
    >
      {buyers.length === 0 ? (
        <p className="text-sm text-muted">{t.partnerSearches.noBuyers}</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {buyers.slice(0, 15).map((b) => (
            <li key={b.clientId} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <ClassBadge value={b.clientClass as "A" | "B" | "C"} />
              <div className="min-w-0 flex-1">
                <Link href={`/clients/${b.clientId}`} className="block truncate text-sm font-medium hover:text-accent-fg">
                  {b.name}
                </Link>
                {b.overBudgetPct !== null && (
                  <p className="text-xs text-warning">{fmt(t.clients.overBudget, { pct: b.overBudgetPct })}</p>
                )}
              </div>
              {b.phone && (
                <a href={telHref(b.phone)} title={t.share.call} aria-label={t.share.call} className="grid size-8 place-items-center rounded-lg text-accent-fg transition hover:bg-raised">
                  <Phone className="size-4" />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** On a listing: colleagues at the agency with buyers it fits — how many, not who; write to them or call. */
export function ColleagueBuyersCard({ colleagues, t }: { colleagues: ColleagueBuyers[]; t: Dictionary }) {
  const P = t.partnerSearches;
  return (
    <Card
      id="colleague-buyers"
      title={
        <span className="flex items-center gap-2">
          <Handshake className="size-4 text-brand-cyan" />
          {P.colleaguesTitle}
          <span className="font-normal text-subtle">{colleagues.reduce((sum, c) => sum + c.buyers, 0)}</span>
        </span>
      }
      description={P.colleaguesHint}
    >
      <ul className="divide-y divide-line-soft">
        {colleagues.map((c) => (
          <li key={c.brokerId} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <Avatar path={c.avatarPath} name={c.name} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{c.name}</p>
              <p className="truncate text-xs text-muted">
                {[c.buyers === 1 ? P.colleagueBuyer : fmt(P.colleagueBuyers, { n: c.buyers }), c.hot > 0 ? fmt(P.colleagueHot, { n: c.hot }) : ""]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <ColleagueChatButton person={c.brokerId} label={t.chat.writeTo} />
            {c.phone && (
              <a href={telHref(c.phone)} title={t.share.call} aria-label={t.share.call} className="grid size-8 place-items-center rounded-lg text-accent-fg transition hover:bg-raised">
                <Phone className="size-4" />
              </a>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** On a listing: colleagues at other agencies whose buyer it fits — call them. */
export function PartnerMatchesCard({ matches, t }: { matches: PartnerMatch[]; t: Dictionary }) {
  return (
    <Card
      title={
        <span className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <UserSearch className="size-4 text-brand-cyan" />
            {t.partnerSearches.forPropertyTitle}
            <span className="font-normal text-subtle">{matches.length}</span>
          </span>
          <Link href="/partner-searches" className="text-sm font-medium text-accent-fg hover:underline">
            {t.nav.partnerSearches} →
          </Link>
        </span>
      }
      description={t.partnerSearches.forPropertyHint}
    >
      <ul className="divide-y divide-line-soft">
        {matches.slice(0, 15).map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{m.brokerName}</p>
              <p className="truncate text-xs text-muted">{[m.agency, m.phone].filter(Boolean).join(" · ")}</p>
              {m.overBudgetPct !== null && (
                <p className="text-xs text-warning">{fmt(t.clients.overBudget, { pct: m.overBudgetPct })}</p>
              )}
            </div>
            {m.phone && (
              <>
                <a href={telHref(m.phone)} title={t.share.call} aria-label={t.share.call} className="grid size-8 place-items-center rounded-lg text-accent-fg transition hover:bg-raised">
                  <Phone className="size-4" />
                </a>
                <a href={viberHref(m.phone)} title="Viber" aria-label="Viber" className="grid size-8 place-items-center rounded-lg text-[#7360f2] transition hover:bg-raised">
                  <MessageCircle className="size-4" />
                </a>
              </>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
