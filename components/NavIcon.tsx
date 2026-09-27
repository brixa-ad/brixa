import {
  Bell,
  Building2,
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
  deals: Handshake,
  properties: Building2,
  clients: Users,
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
