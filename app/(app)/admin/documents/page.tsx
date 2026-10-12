import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/form";
import type { SaleDoc, SaleOffice } from "@/lib/sale-docs";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { DocsEditor, OfficesEditor } from "./SaleDocsEditor";

export const metadata: Metadata = { title: "Документи за продажба — данни" };

/** BRIXA's owner keeps the sale documents' fees, times and the offices' addresses up to date (for every agency). */
export default async function SaleDocsAdminPage() {
  const session = await getSession();
  if (!session?.platformAdmin) notFound();
  const supabase = await createClient();
  const [{ data: docs }, { data: offices }] = await Promise.all([
    supabase.from("sale_docs").select("*").order("sort"),
    supabase.from("sale_offices").select("*").order("city").order("kind"),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Документи за продажба — данни"
        subtitle="Таксите, сроковете и адресите, които виждат всички агенции в „Документи за продажба“."
        backHref="/admin"
        backLabel="Агенции"
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title="Документи">
          <DocsEditor docs={(docs ?? []) as SaleDoc[]} />
        </Card>
        <Card title="Служби по градове">
          <OfficesEditor offices={(offices ?? []) as SaleOffice[]} />
        </Card>
      </div>
    </div>
  );
}
