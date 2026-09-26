import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Building2, Pencil, Phone, User } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { PageHeader } from "@/components/PageHeader";
import { DealActions, DealStageBar, DeleteDealButton } from "@/components/deal/DealControls";
import { Card, buttonClass } from "@/components/ui/form";
import { sofiaToday } from "@/lib/dates";
import { dealTitle, getDeal } from "@/lib/deals";
import { formatDate, formatPrice } from "@/lib/format";
import { fmt } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getSession } from "@/lib/session";
import { personName } from "@/lib/tasks";

export async function generateMetadata({ params }: PageProps<"/deals/[id]">): Promise<Metadata> {
  const [{ t }, deal] = await Promise.all([getI18n(), getDeal((await params).id)]);
  return { title: deal ? dealTitle(deal, t) : t.deals.title };
}

export default async function DealPage({ params }: PageProps<"/deals/[id]">) {
  const { id } = await params;
  const [{ t, lang }, deal, session] = await Promise.all([getI18n(), getDeal(id), getSession()]);
  if (!deal || !session) notFound();

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
        backHref="/deals"
        backLabel={t.deals.title}
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
          canEdit || canDelete ? (
            <>
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card>
            <DealStageBar dealId={id} kind={deal.kind} stage={deal.stage} status={deal.status} canMove={canEdit} />
          </Card>

          <Card>
            <dl className="grid gap-5 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">{deal.status === "won" ? t.deals.commission : t.deals.expected}</dt>
                <dd className="mt-1 text-2xl font-bold text-accent-fg">
                  {formatPrice(deal.commission, "EUR", lang) ?? t.common.notSet}
                </dd>
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
        </div>

        <Card title={deal.status === "open" ? t.deals.closeTitle : t.options.dealStatus[deal.status]}>
          <DealActions
            dealId={id}
            status={deal.status}
            confirmed={confirmed}
            commission={deal.commission}
            today={sofiaToday()}
            canEdit={canEdit}
            isManager={session.isManager}
          />
        </Card>
      </div>
    </>
  );
}
