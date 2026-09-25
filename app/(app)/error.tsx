"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass } from "@/components/ui/form";

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const { t } = useI18n();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-danger/10 text-danger">
        <AlertTriangle className="size-6" />
      </span>
      <h1 className="mt-4 text-xl font-bold tracking-tight">{t.errors.pageTitle}</h1>
      <p className="mt-2 text-sm text-muted">{t.errors.pageHint}</p>
      {error.digest && <p className="mt-2 font-mono text-xs text-subtle">#{error.digest}</p>}
      <button type="button" onClick={() => retry()} className={`${buttonClass.primary} mt-6`}>
        <RotateCcw className="size-4" />
        {t.common.retry}
      </button>
    </div>
  );
}
