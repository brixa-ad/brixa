"use client";

import { useState } from "react";
import { Contact, PenLine } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

/** A listing's history: log what we did, or a colleague's call. */
export function LogTabs({ own, colleague }: { own: React.ReactNode; colleague: React.ReactNode }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"own" | "colleague">("own");
  const button = (active: boolean) =>
    `inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
      active ? "bg-accent text-on-accent" : "text-muted hover:text-fg"
    }`;
  return (
    <div>
      <div className="mb-4 flex gap-1 rounded-lg border border-line bg-surface p-0.5">
        <button type="button" onClick={() => setTab("own")} aria-pressed={tab === "own"} className={button(tab === "own")}>
          <PenLine className="size-4" />
          {t.activity.logTitle}
        </button>
        <button type="button" onClick={() => setTab("colleague")} aria-pressed={tab === "colleague"} className={button(tab === "colleague")}>
          <Contact className="size-4" />
          {t.partners.fromColleague}
        </button>
      </div>
      {tab === "own" ? own : colleague}
    </div>
  );
}
