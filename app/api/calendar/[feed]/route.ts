import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { dictionaries } from "@/lib/i18n/dictionaries";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type FeedRow = {
  uid: string;
  kind: string;
  title: string;
  day: string;
  at: string | null;
  detail: string;
  link: string;
  done: boolean;
};

const SOFIA = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Sofia",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0300",
  "TZNAME:EEST",
  "DTSTART:19700329T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0300",
  "TZOFFSETTO:+0200",
  "TZNAME:EET",
  "DTSTART:19701025T040000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

const escape = (text: string) =>
  text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Long lines are folded (RFC 5545) — by characters, so Cyrillic is never split. */
function fold(line: string) {
  const chars = [...line];
  if (chars.length <= 60) return line;
  const out: string[] = [];
  for (let i = 0; i < chars.length; i += 60) out.push((i ? " " : "") + chars.slice(i, i + 60).join(""));
  return out.join("\r\n");
}

const compactDay = (day: string) => day.replace(/-/g, "");
const nextDay = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
/** "11:00:00" + minutes → "HHMMSS" (capped at the end of the day). */
function clock(time: string, plusMinutes = 0) {
  const [h, m] = time.split(":").map(Number);
  const total = Math.min(h * 60 + m + plusMinutes, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}${String(total % 60).padStart(2, "0")}00`;
}

/**
 * The private calendar address a person adds to Google Calendar ("From URL").
 * The token in the address is the key — it only shows that person's tasks and deal steps.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/calendar/[feed]">) {
  const { feed } = await ctx.params;
  const token = feed.replace(/\.ics$/i, "");
  if (!UUID.test(token)) return new Response("Not found", { status: 404 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { data, error } = await supabase.rpc("calendar_feed", { feed_token: token });
  if (error) {
    console.error("Calendar feed failed:", error.message);
    return new Response("Error", { status: 500 });
  }

  const t = dictionaries.bg;
  const origin = request.nextUrl.origin;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BRIXA//CRM//BG",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:BRIXA",
    "X-WR-TIMEZONE:Europe/Sofia",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...SOFIA,
  ];

  for (const row of (data ?? []) as FeedRow[]) {
    let summary = row.title;
    if (row.kind !== "task") {
      // deal steps come as "<stage>:<sale|rent>"
      const [stage, kind] = row.kind.split(":");
      const labels = kind === "rent" ? t.options.dealStageRent : t.options.dealStage;
      summary = `${labels[stage as keyof typeof labels] ?? stage}: ${row.title}`;
    }
    if (row.done) summary = `✓ ${summary}`;
    const minutes = row.kind === "task" ? 30 : 60;

    lines.push(
      "BEGIN:VEVENT",
      `UID:${row.uid}@brixa`,
      `DTSTAMP:${stamp}`,
      ...(row.at
        ? [
            `DTSTART;TZID=Europe/Sofia:${compactDay(row.day)}T${clock(row.at)}`,
            `DTEND;TZID=Europe/Sofia:${compactDay(row.day)}T${clock(row.at, minutes)}`,
          ]
        : [`DTSTART;VALUE=DATE:${compactDay(row.day)}`, `DTEND;VALUE=DATE:${compactDay(nextDay(row.day))}`]),
      fold(`SUMMARY:${escape(summary)}`),
      ...(row.detail ? [fold(`DESCRIPTION:${escape(row.detail)}`)] : []),
      fold(`URL:${origin}${row.link}`),
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="brixa.ics"',
      "Cache-Control": "no-store",
    },
  });
}
