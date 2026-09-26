import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n/server";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getTheme } from "@/lib/theme-server";
import { LoginForm } from "./LoginForm";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.auth.signIn };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const [{ error, notice }, theme] = await Promise.all([searchParams, getTheme()]);

  return (
    <main className="flex min-h-screen flex-col">
      <div className="flex items-center justify-between px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] sm:px-8">
        <Logo />
        <div className="flex items-center gap-2">
          <ThemeToggle initialTheme={theme} />
          <LanguageToggle />
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <LoginForm
          signInError={error === "invalidCredentials" || error === "genericError" ? error : null}
          callbackFailed={error === "callback"}
          emailConfirmed={notice === "confirmed"}
        />
      </div>
    </main>
  );
}
