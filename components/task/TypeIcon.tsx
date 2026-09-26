import { CalendarCheck, CheckSquare, Home, Mail, MessageSquare, Phone, StickyNote, Users } from "lucide-react";

const ICONS = {
  call: Phone,
  email: Mail,
  message: MessageSquare,
  meeting: Users,
  viewing: Home,
  note: StickyNote,
  task: CheckSquare,
  other: CalendarCheck,
} as const;

export function TypeIcon({ type, className = "size-4" }: { type: string; className?: string }) {
  const Icon = ICONS[type as keyof typeof ICONS] ?? CalendarCheck;
  return <Icon className={className} />;
}
