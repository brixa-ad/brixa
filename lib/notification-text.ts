import { formatPrice } from "./format";
import { fmt, type Dictionary, type Lang } from "./i18n/dictionaries";

export type NotificationData = {
  title?: string;
  actor?: string;
  days?: number;
  amount?: number;
  stage?: string;
  kind?: string;
  time?: string | null;
  count?: number;
  hours?: number;
  tasks?: number;
  followups?: number;
  steps?: number;
  /** an import: clients or properties */
  what?: string;
  /** a chat message's words, and the agency inviting to a conversation */
  text?: string;
  agency?: string;
  /** a personal message request (not a group's invitation) */
  direct?: boolean;
  /** a package an agency asked for, and whom to call */
  plan?: string;
  phone?: string | null;
  /** an analysis opened again (another day) */
  again?: boolean;
  /** work handed over */
  clients?: number;
  properties?: number;
  deals?: number;
};

/** Where tapping a notification leads: the morning brief opens the day's window on the home screen. */
export function notificationLink(type: string, link: string | null) {
  return type === "morning_brief" ? "/?today=1" : link;
}

/**
 * Notifications are stored as type + data; the text is written in the reader's
 * language — on the Notifications page and in the push to the phone.
 */
export function notificationText(type: string, data: NotificationData, t: Dictionary, lang: Lang) {
  const vars = {
    title: data.title ?? "",
    actor: data.actor ?? "",
    days: data.days ?? 0,
    amount: formatPrice(Number(data.amount ?? 0), "EUR", lang) ?? "",
    stage:
      (data.kind === "rent" ? t.options.dealStageRent : t.options.dealStage)[
        (data.stage ?? "viewing") as keyof typeof t.options.dealStage
      ] ?? "",
    time: data.time ?? "",
    count: data.count ?? 0,
    hours: data.hours ?? 24,
  };
  const late = (data.days ?? 0) > 0;
  switch (type) {
    case "task_assigned":
      return fmt(t.notifications.task_assigned, vars);
    case "task_done":
      return fmt(t.notifications.task_done, vars);
    case "task_overdue":
      return fmt(late ? t.notifications.task_overdue_days : t.notifications.task_overdue, vars);
    case "task_overdue_team":
      return fmt(late ? t.notifications.task_overdue_team_days : t.notifications.task_overdue_team, vars);
    case "deal_to_confirm":
      return fmt(t.notifications.deal_to_confirm, vars);
    case "deal_confirmed":
      return fmt(t.notifications.deal_confirmed, vars);
    case "deal_returned":
      return fmt(t.notifications.deal_returned, vars);
    case "commission_logged":
      return fmt(t.notifications.commission_logged, vars);
    case "overtaken":
      return fmt(t.notifications.overtaken, vars);
    case "deal_date_tomorrow":
      return fmt(data.time ? t.notifications.deal_date_tomorrow_at : t.notifications.deal_date_tomorrow, vars);
    case "deal_date_today":
      return fmt(data.time ? t.notifications.deal_date_today_at : t.notifications.deal_date_today, vars);
    case "deal_date_team":
      return fmt(data.time ? t.notifications.deal_date_team_at : t.notifications.deal_date_team, vars);
    case "deal_date_soon":
      return fmt(t.notifications.deal_date_soon, vars);
    case "tasks_missed":
      return fmt(t.notifications.tasks_missed, vars);
    case "tasks_missed_team":
      return fmt(t.notifications.tasks_missed_team, vars);
    case "follow_up_missed":
    case "follow_up_missed_team":
    case "client_released":
    case "client_released_team":
    case "free_contact":
    case "client_assigned":
    case "contact_claimed":
    case "follow_ups_today":
      return fmt(t.notifications[type], vars);
    case "chat_message":
      return fmt(data.kind === "direct" ? t.notifications.chat_direct : t.notifications.chat_group, { ...vars, text: data.text ?? "" });
    case "chat_invite":
      return fmt(data.direct ? t.notifications.chat_request : t.notifications.chat_invite, { ...vars, agency: data.agency ?? "" });
    case "agency_signed_up":
      return fmt(data.kind === "solo" ? t.notifications.agency_signed_up_solo : t.notifications.agency_signed_up, vars);
    case "plan_requested":
      return fmt(t.notifications.plan_requested, { ...vars, plan: data.plan ?? "", phone: data.phone ? ` · ${data.phone}` : "" });
    case "analysis_viewed":
      return fmt(data.again ? t.notifications.analysis_viewed_again : t.notifications.analysis_viewed, { ...vars, actor: data.actor ?? t.notifications.someone });
    case "team_week":
      return fmt(t.notifications.team_week, vars);
    case "work_handed":
      return fmt(t.notifications.work_handed, {
        ...vars,
        parts: [
          data.clients ? fmt(t.notifications.handed_clients, { n: data.clients }) : "",
          data.properties ? fmt(t.notifications.handed_properties, { n: data.properties }) : "",
          data.deals ? fmt(t.notifications.handed_deals, { n: data.deals }) : "",
          data.tasks ? fmt(t.notifications.handed_tasks, { n: data.tasks }) : "",
        ]
          .filter(Boolean)
          .join(", "),
      });
    case "imported":
      return fmt(data.what === "properties" ? t.notifications.imported_properties : t.notifications.imported_clients, vars);
    case "morning_brief": {
      const parts = [
        data.tasks ? fmt(t.notifications.morning_tasks, { count: data.tasks }) : "",
        data.followups
          ? fmt(data.title ? t.notifications.morning_followups_names : t.notifications.morning_followups, {
              count: data.followups,
              names: data.title ?? "",
            })
          : "",
        data.steps ? fmt(t.notifications.morning_steps, { count: data.steps }) : "",
      ].filter(Boolean);
      return fmt(t.notifications.morning_brief, { parts: parts.join(", ") });
    }
    case "share_viewed":
      return fmt(data.actor ? t.notifications.share_viewed : t.notifications.share_viewed_anon, vars);
    case "lead_new":
    case "lead_known":
    case "partner_search":
      return fmt(t.notifications[type], vars);
    case "client_hot":
      // the listing opened again, or a tap on call / Viber / WhatsApp / e-mail
      return data.kind === "open" || !data.kind
        ? fmt(t.notifications.client_hot_open, vars)
        : fmt(t.notifications.client_hot_tap, {
            ...vars,
            button: (t.signals.buttons as Record<string, string>)[data.kind] ?? data.kind,
          });
    case "report_viewed":
      return fmt(data.actor ? t.notifications.report_viewed : t.notifications.report_viewed_anon, vars);
    case "site_inquiry":
      // about a listing, or a general question
      return fmt(t.notifications.site_inquiry, { ...vars, title: data.title ? ` — ${data.title}` : "" });
    case "open_house_visitor":
      return fmt(t.notifications.open_house_visitor, vars);
    case "task_reminder":
      return fmt(t.notifications.task_reminder, vars);
    case "push_test":
      return t.notifications.push_test;
    default:
      return vars.title;
  }
}
