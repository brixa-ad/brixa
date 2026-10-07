import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Building2, Gift, Handshake, Pencil, Phone, User } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { PageHeader } from "@/components/PageHeader";
import { DealActions, DealStageBar, DeleteDealButton } from "@/components/deal/DealControls";
import { DealOffers, DealPaymentsForm, DealSchedule, type OfferRow } from "@/components/deal/DealDetails";
import { Card, buttonClass } from "@/components/ui/form";
import { sofiaToday } from "@/lib/dates";
import { dealTitle, getDeal } from "@/lib/deals";
import { formatDate, formatPrice } from "@/lib/format";
import { fmt } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { memberBack } from "@/lib/member-back";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { personName } from "@/lib/tasks";

export async function generateMetadata({ params }: PageProps<"/deals/[id]">): Promise<Metadata> {
  const [{ t }, deal] = await Promise.all([getI18n(), getDeal((await params).id)]);
  return { title: deal ? dealTitle(deal, t) : t.deals.title };
}

export default async function DealPage({ params, searchParams }: PageProps<"/deals/[id]">) {
  const { id } = await params;
  const { from } = await searchParams;
  const [{ t, lang }, deal, session] = await Promise.all([getI18n(), getDeal(id), getSession()]);
  if (!deal || !session) notFound();

  const supabase = await createClient();
  const { data: offerRows } = await supabase
    .from("deal_offers")
    .select("id, amount, currency, offered_by, agency, offered_on, status, note, hold_deposit")
    .eq("deal_id", id)
    .order("offered_on", { ascending: false })
    .order("created_at", { ascending: false });
  const offers = ((offerRows ?? []) as OfferRow[]).map((o) => ({
    ...o,
    amount: Number(o.amount),
    hold_deposit: o.hold_deposit === null ? null : Number(o.hold_deposit),
  }));
  const today = sofiaToday();
  const back = await memberBack(from, session.organizationId);

  const mine = deal.broker_id === session.userId;
  const confirmed = Boolean(deal.confirmed_at);
  const canEdit = session.isManager || (mine && !confirmed);
  const canDelete = session.isManager || (mine && deal.status === "open");
  const statusTone =
    deal.status === "won"
      ? confirmed
        ? "bg-success/10 text-success"
        : "bg-warning/10 text-warning"
      : deal.status === "lost"
        ? "bg-danger/10 text-danger"
        : "bg-accent-soft text-accent-fg";

  return (
    <>
      <PageHeader
        backHref={back?.href ?? "/deals"}
        backLabel={back?.label ?? t.deals.title}
        title={dealTitle(deal, t)}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>{t.options.dealKind[deal.kind]}</span>
            <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${statusTone}`}>
              {t.options.dealStatus[deal.status]}
            </span>
          </span>
        }
        actions={
          canEdit || canDelete || (deal.status === "won" && deal.kind === "sale") ? (
            <>
              {/* every year on the day of the purchase: a card for the client */}
              {deal.status === "won" && deal.kind === "sale" && (
                <Link href={`/deals/${id}/card`} className={buttonClass.secondary}>
                  <Gift className="size-4" />
                  {t.anniversary.cardTitle}
                </Link>
              )}
              {canEdit && (
                <Link href={`/deals/${id}/edit`} className={buttonClass.secondary}>
                  <Pencil className="size-4" />
                  {t.common.edit}
                </Link>
              )}
              {canDelete && <DeleteDealButton dealId={id} />}
            </>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card title={t.deals.datesTitle}>
            <DealStageBar dealId={id} kind={deal.kind} stage={deal.stage} status={deal.status} canMove={canEdit} />
            <div className="mt-5 border-t border-line-soft pt-4">
              <DealSchedule
                // a stage move changes what comes next — start the scheduler fresh then
                key={`${deal.stage}-${deal.status}`}
                dealId={id}
                kind={deal.kind}
                stage={deal.stage}
                status={deal.status}
                canEdit={canEdit}
                today={today}
                steps={{
                  viewing: { day: deal.viewing_on, time: deal.viewing_time },
                  offer: { day: deal.offer_on, time: deal.offer_time },
                  deposit: { day: deal.deposit_on, time: deal.deposit_time },
                  preliminary: { day: deal.preliminary_on, time: deal.preliminary_time },
                  notary: { day: deal.notary_on, time: deal.notary_time },
                }}
              />
            </div>
          </Card>

          <Card>
            <dl className="grid grid-cols-1 gap-5 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">{deal.status === "won" ? t.deals.commission : t.deals.expected}</dt>
                <dd className="mt-1 text-2xl font-bold text-accent-fg">
                  {formatPrice(deal.commission, "EUR", lang) ?? t.common.notSet}
                </dd>
                {deal.referral_percent && deal.commission !== null && deal.net_commission !== null ? (
                  <div className="mt-1.5 space-y-0.5 text-xs">
                    <p className="text-muted">
                      {t.deals.externalBroker}
                      {deal.referral_name ? ` ${deal.referral_name}` : ""}: −{formatPrice(deal.commission - deal.net_commission, "EUR", lang)} (
                      {deal.referral_percent}%) ·{" "}
                      {deal.referral_paid_on
                        ? fmt(t.deals.referralPaid, { date: formatDate(deal.referral_paid_on, lang) })
                        : t.deals.referralUnpaid}
                    </p>
                    <p className="font-semibold text-fg">
                      {t.deals.forAgency}: {formatPrice(deal.net_commission, "EUR", lang)}
                    </p>
                  </div>
                ) : null}
                {deal.status === "won" && deal.closed_on && (
                  <p className="mt-0.5 text-xs text-muted">{fmt(t.deals.closed, { date: formatDate(deal.closed_on, lang) })}</p>
                )}
                {confirmed && deal.confirmed_at && (
                  <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-success">
                    <BadgeCheck className="size-3.5" />
                    {fmt(t.deals.confirmed, {
                      name: personName(deal.confirmer),
                      when: formatDate(deal.confirmed_at, lang),
                    })}
                  </p>
                )}
              </div>
              <div>
                <dt className="text-xs text-muted">{t.deals.price}</dt>
                <dd className="mt-1 text-lg font-semibold">{formatPrice(deal.price, deal.currency, lang) ?? t.common.notSet}</dd>
              </div>

              <div>
                <dt className="text-xs text-muted">{t.deals.fieldProperty}</dt>
                <dd className="mt-1">
                  {deal.property ? (
                    <Link
                      href={`/properties/${deal.property.id}`}
                      className="inline-flex items-center gap-1.5 font-medium text-accent-fg hover:underline"
                    >
                      <Building2 className="size-4" />
                      {deal.property.title}
                    </Link>
                  ) : (
                    <span className="text-muted">{t.common.notSet}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{t.deals.fieldClient}</dt>
                <dd className="mt-1 space-y-1">
                  {deal.client ? (
                    <>
                      <Link
                        href={`/clients/${deal.client.id}`}
                        className="inline-flex items-center gap-1.5 font-medium text-accent-fg hover:underline"
                      >
                        <User className="size-4" />
                        {deal.client.full_name}
                      </Link>
                      {deal.client.phone && (
                        <a href={`tel:${deal.client.phone}`} className="flex items-center gap-1.5 text-muted hover:text-fg">
                          <Phone className="size-3.5" />
                          {deal.client.phone}
                        </a>
                      )}
                    </>
                  ) : (
                    <span className="text-muted">{t.common.notSet}</span>
                  )}
                </dd>
              </div>

              <div>
                <dt className="text-xs text-muted">{t.deals.broker}</dt>
                <dd className="mt-1 flex items-center gap-2 font-medium">
                  {deal.broker ? (
                    <>
                      <Avatar path={deal.broker.avatar_path} name={personName(deal.broker)} size="sm" />
                      {personName(deal.broker)}
                    </>
                  ) : (
                    t.common.notSet
                  )}
                </dd>
              </div>
              {(deal.double_sided || deal.partner_agency) && (
                <div className="sm:col-span-2">
                  <dd className="flex flex-wrap items-center gap-2">
                    {deal.double_sided && (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-fg">
                        <Handshake className="size-3.5" />
                        {t.deals.doubleSided}
                        {deal.buyer_rate !== null && ` · +${deal.buyer_rate}${deal.kind === "rent" ? ` ${t.units.months}` : "%"}`}
                      </span>
                    )}
                    {deal.partner_agency && (
                      <span className="inline-flex flex-wrap items-center gap-1.5 rounded-lg bg-raised px-2.5 py-1 text-xs font-semibold text-fg-2">
                        {fmt(t.deals.partnerLabel, { agency: deal.partner_agency })}
                        {deal.partner_broker && <span className="font-normal text-muted">· {deal.partner_broker}</span>}
                        {deal.partner_side && (
                          <span className="font-normal text-muted">
                            · {deal.partner_side === "buyer" ? t.deals.partnerBuyer : t.deals.partnerSeller}
                          </span>
                        )}
                      </span>
                    )}
                  </dd>
                </div>
              )}
              {deal.status === "lost" && deal.lost_reason && (
                <div>
                  <dt className="text-xs text-muted">{t.deals.reason}</dt>
                  <dd className="mt-1">{deal.lost_reason}</dd>
                </div>
              )}
            </dl>

            {deal.notes && (
              <div className="mt-5 border-t border-line-soft pt-4">
                <p className="text-xs text-muted">{t.deals.fieldNotes}</p>
                <p className="mt-1 whitespace-pre-line text-sm text-fg-2">{deal.notes}</p>
              </div>
            )}
          </Card>

          <Card title={t.deals.offersTitle}>
            <DealOffers dealId={id} offers={offers} currency={deal.currency} canEdit={canEdit} today={today} />
          </Card>

          <Card title={t.deals.paymentsTitle}>
            <DealPaymentsForm
              dealId={id}
              price={deal.price}
              currency={deal.currency}
              canEdit={canEdit}
              commission={deal.commission}
              referral={{ name: deal.referral_name, percent: deal.referral_percent, paidOn: deal.referral_paid_on }}
              initial={{
                depositAmount: deal.deposit_amount,
                preliminaryBank: deal.preliminary_bank,
                preliminaryCash: deal.preliminary_cash,
                notaryBank: deal.notary_bank,
                notaryCash: deal.notary_cash,
              }}
            />
          </Card>
        </div>

        <Card title={deal.status === "open" ? t.deals.closeTitle : t.options.dealStatus[deal.status]}>
          <DealActions
            dealId={id}
            status={deal.status}
            confirmed={confirmed}
            commission={deal.commission}
            referralPercent={deal.referral_percent}
            today={today}
            canEdit={canEdit}
            isManager={session.isManager}
          />
        </Card>
      </div>
    </>
  );
}
