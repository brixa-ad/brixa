import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: LEGAL.privacy.title };

export default function PrivacyPage() {
  return <LegalPage kind="privacy" />;
}
