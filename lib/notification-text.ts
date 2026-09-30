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
