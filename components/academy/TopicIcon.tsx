import { Handshake, HardHat, Landmark, LineChart, MapPin, Scale, Tag, UserSearch, type LucideProps } from "lucide-react";
import type { AcademyTopic } from "@/lib/academy";

const ICONS = {
  zut: HardHat,
  law: Scale,
  buyers: UserSearch,
  sellers: Tag,
  banks: Landmark,
  sales: Handshake,
  market: LineChart,
  city: MapPin,
} satisfies Record<AcademyTopic, unknown>;

/** The academy's topics, each with its picture. */
export function TopicIcon({ topic, ...props }: { topic: AcademyTopic } & LucideProps) {
  const Icon = ICONS[topic];
  return <Icon {...props} />;
}
