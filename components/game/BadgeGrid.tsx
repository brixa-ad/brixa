import { Award, Crown, Eye, Flame, Handshake, Home, Phone, Star, Users, type LucideIcon } from "lucide-react";
import { formatNumber, formatPrice } from "@/lib/format";
import { BADGE_KEYS, badgeTier, type BadgeKey, type BadgeStats } from "@/lib/game";
import { fmt, type Dictionary, type Lang } from "@/lib/i18n/dictionaries";

const ICONS: Record<BadgeKey, LucideIcon> = {
  deals: Handshake,
  commission: Crown,
  listings: Home,
  exclusives: Star,
  viewings: Eye,
  calls: Phone,
  clients: Users,
  streak: Flame,
};

// bronze, silver, gold, platinum, diamond
const TIER_STYLE = [
  "bg-[#d99a5b] text-[#3a1d00]",
  "bg-[#c9d1dc] text-[#1f2937]",
  "bg-[#f5c542] text-[#3b2a00]",
  "bg-[#a5f3fc] text-[#083344]",
  "bg-gradient-to-br from-[#2563ff] to-[#38c8ff] text-white",
];

/** Every badge area with the tier reached and what the next one takes. */
export function BadgeGrid({ stats, t, lang }: { stats: BadgeStats; t: Dictionary; lang: Lang }) {
  const amount = (key: BadgeKey, value: number) =>
    key === "commission" ? (formatPrice(value, "EUR", lang) ?? "0") : (formatNumber(value, lang) ?? "0");

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {BADGE_KEYS.map((key) => {
        const Icon = ICONS[key];
        const { tier, next } = badgeTier(key, stats[key]);
        return (
          <li key={key} className={`rounded-xl border p-3 text-center ${tier >= 0 ? "border-line bg-raised/40" : "border-dashed border-line-strong opacity-70"}`}>
            <span
              className={`mx-auto grid size-12 place-items-center rounded-full shadow-sm ${tier >= 0 ? TIER_STYLE[tier] : "bg-raised text-faint"}`}
            >
              {tier >= 0 ? <Icon className="size-5" /> : <Award className="size-5" />}
            </span>
            <p className="mt-2 truncate text-sm font-semibold">{t.game.badgeNames[key]}</p>
            <p className="truncate text-xs font-medium text-accent-fg">{tier >= 0 ? t.game.tiers[tier] : "—"}</p>
            <p className="mt-0.5 truncate text-[11px] text-subtle">
              {next === null
                ? t.game.badgeTop
                : fmt(tier >= 0 ? t.game.badgeNext : t.game.badgeLocked, { value: amount(key, next) })}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
