import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: LEGAL.terms.title };

export default function TermsPage() {
  return <LegalPage kind="terms" />;
}
