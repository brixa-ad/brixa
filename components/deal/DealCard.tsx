import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { formatDate, formatPrice } from "@/lib/format";
import { fmt, type Dictionary, type Lang } from "@/lib/i18n/dictionaries";
import { dealTitle, type DealRow } from "@/lib/deals";
import { personName } from "@/lib/tasks";

/** One deal in a list or a stage column. */
export function DealCard({
  deal,
  t,
  lang,
  showBroker,
  from,
}: {
  deal: DealRow;
  t: Dictionary;
  lang: Lang;
  showBroker?: boolean;
  /** opened from a colleague's profile — the deal page leads back there */
  from?: string;
}) {
  const title = dealTitle(deal, t);
  const stageLabels = deal.kind === "rent" ? t.options.dealStageRent : t.options.dealStage;
  const amount = formatPrice(deal.net_commission ?? deal.commission, "EUR", lang);
  // at the offer stage: what the listing costs and what the client offers (the latest offer still standing)
  const atOffer = deal.status === "open" && deal.stage === "offer";
  const offer = atOffer
    ? [...deal.offers]
        .filter((o) => o.status !== "rejected")
        .sort((a, b) => b.offered_on.localeCompare(a.offered_on) || b.created_at.localeCompare(a.created_at))[0]
    : undefined;
  const asking = deal.property?.current_price != null ? formatPrice(deal.property.current_price, deal.property.currency, lang) : formatPrice(deal.price, deal.currency, lang);

  return (
    <Link
      href={`/deals/${deal.id}${from ? `?from=${from}` : ""}`}
      className="block rounded-xl border border-line bg-surface p-3.5 shadow-xs transition hover:border-accent/50 hover:bg-raised/40"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm font-semibold leading-snug">{title}</p>
        <span className="flex shrink-0 gap-1">
          {deal.double_sided && (
            <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] font-bold text-accent-fg" title={t.deals.doubleSided}>
              ×2
            </span>
          )}
          <span className="rounded-md bg-raised px-1.5 py-0.5 text-[11px] font-medium text-muted">
            {t.options.dealKind[deal.kind]}
          </span>
        </span>
      </div>
      {deal.property && deal.client && <p className="mt-0.5 truncate text-xs text-muted">{deal.client.full_name}</p>}
      {deal.referral_percent ? (
        <p className="mt-0.5 truncate text-xs text-muted">
          {t.deals.externalBroker} −{deal.referral_percent}%{deal.referral_name ? ` · ${deal.referral_name}` : ""}
        </p>
      ) : null}
      {deal.partner_agency && (
        <p className="mt-0.5 truncate text-xs text-muted">{fmt(t.deals.partnerLabel, { agency: deal.partner_agency })}</p>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          {atOffer ? (
            <dl className="space-y-0.5 text-sm">
              <div className="flex items-baseline gap-1.5">
                <dt className="text-[11px] text-subtle">{t.deals.askingPrice}</dt>
                <dd className="font-semibold tabular-nums">{asking ?? t.common.notSet}</dd>
              </div>
              <div className="flex items-baseline gap-1.5">
                <dt className="text-[11px] text-subtle">{t.deals.clientOffer}</dt>
                <dd className="font-bold tabular-nums text-accent-fg">
                  {offer ? formatPrice(offer.amount, offer.currency, lang) : "—"}
                </dd>
              </div>
              {offer?.hold_deposit ? (
                <p className="text-[11px] font-semibold text-warning">
                  {fmt(t.deals.holdDepositLine, { amount: formatPrice(offer.hold_deposit, "EUR", lang) ?? "" })}
                </p>
              ) : null}
            </dl>
          ) : (
            <p className={`text-sm font-bold ${deal.status === "lost" ? "text-muted line-through" : "text-accent-fg"}`}>
              {amount ?? t.common.notSet}
            </p>
          )}
          <p className="truncate text-[11px] text-subtle">
            {deal.status === "open"
              ? stageLabels[deal.stage]
              : deal.status === "won" && deal.closed_on
                ? fmt(t.deals.closed, { date: formatDate(deal.closed_on, lang) })
                : deal.lost_reason || t.options.dealStatus[deal.status]}
          </p>
        </div>
        {showBroker && deal.broker && (
          <Avatar path={deal.broker.avatar_path} name={personName(deal.broker)} size="sm" />
        )}
      </div>

      {deal.status === "won" && !deal.confirmed_at && (
        <p className="mt-2 rounded-md bg-warning/10 px-2 py-1 text-[11px] font-semibold text-warning">{t.deals.pending}</p>
      )}
    </Link>
  );
}
