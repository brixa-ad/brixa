import {
  BadgeCheck,
  BarChart3,
  Bell,
  Building2,
  DoorOpen,
  CalendarCheck,
  CalendarDays,
  Inbox,
  Handshake,
  House,
  ListChecks,
  Map as MapIcon,
  Rocket,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
  UserSearch,
  UserRound,
  Users,
  UsersRound,
  Wallet,
  type LucideProps,
} from "lucide-react";
import type { NavKey } from "@/lib/nav";

const ICONS: Record<NavKey, React.ComponentType<LucideProps>> = {
  home: House,
  plan: Rocket,
  business: Wallet,
  territory: MapIcon,
  brix: Sparkles,
  tasks: ListChecks,
  calendar: CalendarDays,
  deals: Handshake,
  properties: Building2,
  openHouses: DoorOpen,
  clients: Users,
  followup: CalendarCheck,
  contacts: Inbox,
  stats: BarChart3,
  market: TrendingUp,
  partnerSearches: UserSearch,
  closedDeals: BadgeCheck,
  team: UsersRound,
  goals: Target,
  notifications: Bell,
  profile: UserRound,
  settings: Settings,
};

export function NavIcon({ name, ...props }: { name: NavKey } & LucideProps) {
  const Icon = ICONS[name];
  return <Icon {...props} />;
}
