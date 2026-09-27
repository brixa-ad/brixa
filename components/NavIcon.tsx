import {
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  Handshake,
  House,
  ListChecks,
  Settings,
  Target,
  UserRound,
  Users,
  UsersRound,
  type LucideProps,
} from "lucide-react";
import type { NavKey } from "@/lib/nav";

const ICONS: Record<NavKey, React.ComponentType<LucideProps>> = {
  home: House,
  tasks: ListChecks,
  calendar: CalendarDays,
  deals: Handshake,
  properties: Building2,
  clients: Users,
  stats: BarChart3,
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
