import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, ClipboardList, FileText, Megaphone, QrCode, Star, UserPlus, Users } from "lucide-react";
import { CancelOpenHouse } from "@/components/openhouse/CancelOpenHouse";
import { PageHeader } from "@/components/PageHeader";
import { MessageSender } from "@/components/program/MessageSender";
import { TaskItem } from "@/components/task/TaskItem";
import { Card, buttonClass } from "@/components/ui/form";
import { sofiaToday } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import { fmt } from "@/lib/i18n/dictionaries";
import { getI18n } from "@/lib/i18n/server";
import { getOpenHouse, hhmm, placeOf, weekdayDate, type Visitor } from "@/lib/open-houses";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { TASK_SELECT, byDue, personName, type TaskRow } from "@/lib/tasks";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: PageProps<"/open-houses/[id]">): Promise<Metadata> {
  const { id } = await params;
  const house = UUID.test(id) ? await getOpenHouse(id) : null;
  return { title: house?.property?.title ?? "Open house" };
}

/** One open house: the preparation, the visitors and what they thought, the ready invitations. */
export default async function OpenHousePage({ params }: PageProps<"/open-houses/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [session, house] = await Promise.all([getSession(), getOpenHouse(id)]);
  if (!session || !house) notFound();

  const supabase = await createClient();
  const [{ t, lang }, { data: taskRows }, { data: visitorRows }] = await Promise.all([
    getI18n(),
    supabase.from("tasks").select(TASK_SELECT).eq("open_house_id", id),
    supabase
      .from("open_house_visitors")
      .select("id, client_id, full_name, phone, email, kind, price_opinion, rating, liked, looking_for, created_at")
      .eq("open_house_id", id)
      .order("created_at"),
  ]);
  const today = sofiaToday();
  const tasks = ((taskRows ?? []) as unknown as TaskRow[]).sort(byDue);
  const visitors = (visitorRows ?? []) as Visitor[];
  const isHost = house.host_id === session.userId;
  const canManage = isHost || session.isManager || house.created_by === session.userId;
  const seesVisitors = isHost || session.isManager;
  const cancelled = house.cancelled_at !== null;

  const when = fmt(t.openHouses.when, { day: weekdayDate(house.day, lang), from: hhmm(house.starts_at), to: hhmm(house.ends_at) });
  const place = placeOf(house.property);
  const broker = personName(house.host);
  const vars = {
    day: weekdayDate(house.day, lang),
    from: hhmm(house.starts_at),
    to: hhmm(house.ends_at),
    title: house.property?.title ?? "",
    place: place ? ` (${place})` : "",
    broker,
    agency: session.organizationName,
    phone: house.host?.phone ? `, ${house.host.phone}` : "",
  };

  // what the visitors thought (other agents aren't counted)
  const people = visitors.filter((v) => v.kind !== "agent");
  const opinions = { low: 0, right: 0, high: 0 };
  for (const v of people) if (v.price_opinion) opinions[v.price_opinion]++;
  const opinionTotal = opinions.low + opinions.right + opinions.high;
  const ratings = people.map((v) => v.rating).filter((r): r is number => r !== null);
  const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;

  return (
    <>
      <PageHeader
        backHref="/open-houses"
        backLabel={t.openHouses.title}
        title={
          <span className={cancelled ? "text-muted line-through" : ""}>
            {house.property ? (
              <Link href={`/properties/${house.property.id}`} className="hover:text-accent-fg">
                {house.property.title}
              </Link>
            ) : (
              "—"
            )}
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1 capitalize">
              <CalendarDays className="size-3.5" />
              {when}
            </span>
            {place && <span>{place}</span>}
            <span>
              {t.openHouses.host}: {broker}
            </span>
            {cancelled && <span className="font-semibold text-danger">{t.openHouses.cancelledBadge}</span>}
          </span>
        }
        actions={
          !cancelled ? (
            <>
              <Link href={`/open-houses/${id}/flyer`} className={buttonClass.secondary}>
                <FileText className="size-4" />
                {t.openHouses.flyer}
              </Link>
              <Link href={`/open-houses/${id}/sign`} className={buttonClass.secondary}>
                <QrCode className="size-4" />
                {t.openHouses.sign}
              </Link>
              {seesVisitors && house.day <= today && (
                <a href={`/o/${house.token}`} target="_blank" rel="noreferrer" className={buttonClass.primary}>
                  <UserPlus className="size-4" />
                  {t.openHouses.register}
                </a>
              )}
              {canManage && house.day >= today && <CancelOpenHouse id={id} />}
            </>
          ) : undefined
        }
      />

      {house.note && <p className="-mt-2 mb-6 whitespace-pre-line text-sm text-fg-2">{house.note}</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          {/* ---- the visitors and what they thought ---- */}
          <Card
            title={
              <span className="flex items-center gap-2">
                <Users className="size-4 text-brand-cyan" />
                {t.openHouses.visitorsTitle}
                {seesVisitors && visitors.length > 0 && (
                  <span className="text-sm font-normal text-muted">· {fmt(t.openHouses.visitorsCount, { count: visitors.length })}</span>
                )}
              </span>
            }
          >
            {!seesVisitors ? (
              <p className="text-sm text-muted">{t.openHouses.visitorsHidden}</p>
            ) : visitors.length === 0 ? (
              <p className="text-sm text-muted">{t.openHouses.noVisitors}</p>
            ) : (
              <>
                <div className="mb-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-raised/60 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">{t.openHouses.priceTitle}</p>
                    {(["low", "right", "high"] as const).map((key) => (
                      <div key={key} className="mb-1.5 last:mb-0">
                        <div className="flex justify-between text-sm">
                          <span className="text-fg-2">{t.openHouses.price[key]}</span>
                          <span className="font-semibold tabular-nums">{opinions[key]}</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface">
                          <div
                            className={`h-full rounded-full ${key === "high" ? "bg-warning" : key === "low" ? "bg-success" : "bg-accent"}`}
                            style={{ width: `${opinionTotal ? (opinions[key] / opinionTotal) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl bg-raised/60 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-subtle">{t.openHouses.avgRating}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-2xl font-bold">
                      <Star className="size-5 fill-warning text-warning" />
                      {avgRating === null ? "—" : formatNumber(avgRating, lang, 1)}
                    </p>
                    <ul className="mt-2 space-y-0.5 text-xs text-muted">
                      {(["buyer", "neighbor", "curious", "agent"] as const).map((kind) => {
                        const n = visitors.filter((v) => v.kind === kind).length;
                        return n > 0 ? <li key={kind}>{`${t.openHouses.kinds[kind]}: ${n}`}</li> : null;
                      })}
                    </ul>
                  </div>
                </div>

                <ul className="divide-y divide-line-soft">
                  {visitors.map((v) => (
                    <li key={v.id} className="py-3">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {v.client_id ? (
                          <Link href={`/clients/${v.client_id}`} className="font-semibold hover:text-accent-fg">
                            {v.full_name}
                          </Link>
                        ) : (
                          <span className="font-semibold">{v.full_name}</span>
                        )}
                        <span className="rounded-md bg-raised px-1.5 py-0.5 text-[11px] font-medium text-fg-2">{t.openHouses.kinds[v.kind]}</span>
                        {v.price_opinion && (
                          <span className="text-xs text-muted">
                            {t.openHouses.priceTitle}: <span className="font-semibold text-fg-2">{t.openHouses.price[v.price_opinion]}</span>
                          </span>
                        )}
                        {v.rating !== null && (
                          <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-warning">
                            <Star className="size-3.5 fill-warning" />
                            {v.rating}
                          </span>
                        )}
                        {v.phone && <span className="text-xs text-muted">{v.phone}</span>}
                      </div>
                      {v.looking_for && <p className="mt-1 text-sm text-fg-2">{`${t.openHouses.lookingFor}: ${v.looking_for}`}</p>}
                      {v.liked && <p className="mt-0.5 text-sm text-fg-2">{`${t.openHouses.liked}: ${v.liked}`}</p>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          {/* ---- the preparation, day by day ---- */}
          <Card
            title={
              <span className="flex items-center gap-2">
                <ClipboardList className="size-4 text-brand-cyan" />
                {t.openHouses.prepTitle}
              </span>
            }
          >
            {tasks.length === 0 ? (
              <p className="text-sm text-muted">{t.tasks.empty}</p>
            ) : (
              <ul className="-mx-3">
                {tasks.map((task) => (
                  <TaskItem key={task.id} task={task} today={today} viewerId={session.userId} t={t} showAssignee={!isHost} />
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* ---- the invitations, ready to send ---- */}
        {!cancelled && (
          <aside>
            <Card
              title={
                <span className="flex items-center gap-2">
                  <Megaphone className="size-4 text-brand-cyan" />
                  {t.openHouses.invitesTitle}
                </span>
              }
            >
              <div className="space-y-5">
                {(["database", "social", "neighbors"] as const).map((key) => {
                  const text = fmt(t.openHouses.inviteTexts[key], vars);
                  return (
                    <div key={key}>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">{t.openHouses.invites[key]}</p>
                      <p className="mb-2 whitespace-pre-line rounded-xl bg-raised/60 p-3 text-sm leading-relaxed text-fg-2">{text}</p>
                      <MessageSender text={text} phone={null} email={null} compact />
                    </div>
                  );
                })}
              </div>
            </Card>
          </aside>
        )}
      </div>
    </>
  );
}
