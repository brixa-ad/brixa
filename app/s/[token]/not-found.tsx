import { SearchX } from "lucide-react";
import { Logo } from "@/components/Logo";
import { getI18n } from "@/lib/i18n/server";

/** A made-up or stopped search link. */
export default async function SharedSearchGone() {
  const { t } = await getI18n();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo />
      <SearchX className="size-10 text-faint" />
      <h1 className="text-lg font-semibold">{t.searchShare.gone}</h1>
      <p className="text-sm text-muted">{t.searchShare.goneHint}</p>
    </main>
  );
}
