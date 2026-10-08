import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: LEGAL.dpa.title };

export default function DpaPage() {
  return <LegalPage kind="dpa" />;
}
