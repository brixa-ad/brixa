import { LinkIcon } from "lucide-react";
import { Logo } from "@/components/Logo";
import { getI18n } from "@/lib/i18n/server";

/** A made-up or stopped link. */
export default async function SharedListingGone() {
  const { t } = await getI18n();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo />
      <LinkIcon className="size-10 text-faint" />
      <h1 className="text-lg font-semibold">{t.share.gone}</h1>
      <p className="text-sm text-muted">{t.share.goneHint}</p>
    </main>
  );
}
