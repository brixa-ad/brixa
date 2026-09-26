import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { I18nProvider } from "@/components/I18nProvider";
import { getLang } from "@/lib/i18n/server";
import { getTheme } from "@/lib/theme-server";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: { default: "BRIXA", template: "%s · BRIXA" },
  description: "CRM for real estate agencies",
  applicationName: "BRIXA",
  // "Add to Home Screen" on iPhone opens full-screen, like an app.
  appleWebApp: { capable: true, title: "BRIXA", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

// Behave like an app on phones: no zooming, content runs under the notch/status bar.
export async function generateViewport(): Promise<Viewport> {
  const theme = await getTheme();
  return {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: "cover",
    themeColor: theme === "light" ? "#f3f6fc" : "#040915",
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [lang, theme] = await Promise.all([getLang(), getTheme()]);

  return (
    <html lang={lang} data-theme={theme} className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <I18nProvider lang={lang}>{children}</I18nProvider>
      </body>
    </html>
  );
}
