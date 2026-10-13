import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: LEGAL.security.title };

export default function SecurityPage() {
  return <LegalPage kind="security" />;
}
