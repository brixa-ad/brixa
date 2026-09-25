import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n/server";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Logo } from "@/components/Logo";
import { LoginForm } from "./LoginForm";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.auth.signIn };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error, notice } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col">
      <div className="flex items-center justify-between px-4 py-4 sm:px-8">
        <Logo />
        <LanguageToggle />
      </div>

      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <LoginForm callbackFailed={error === "callback"} emailConfirmed={notice === "confirmed"} />
      </div>
    </main>
  );
}
