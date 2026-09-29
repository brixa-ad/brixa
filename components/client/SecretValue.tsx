"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { masked } from "@/lib/egn";

/** Personal data shown as ••••••4567 until asked for (so it isn't read over a shoulder). */
export function SecretValue({ value }: { value: string }) {
  const { t } = useI18n();
  const [shown, setShown] = useState(false);
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-medium tabular-nums">{shown ? value : masked(value)}</span>
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? t.clients.hide : t.clients.show}
        title={shown ? t.clients.hide : t.clients.show}
        className="grid size-7 place-items-center rounded-md text-muted transition hover:bg-raised hover:text-fg"
      >
        {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </span>
  );
}
