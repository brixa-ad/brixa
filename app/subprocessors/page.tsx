import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: LEGAL.subprocessors.title };

export default function SubprocessorsPage() {
  return <LegalPage kind="subprocessors" />;
}
