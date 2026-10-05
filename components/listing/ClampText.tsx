"use client";

import { useState } from "react";

/** A long text cut to a few lines, with "see the full text" (when it's long). */
export function ClampText({ text, more, less }: { text: string; more: string; less: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 320 || text.split("\n").length > 5;
  return (
    <div>
      <p className={`whitespace-pre-line text-[15px] leading-relaxed text-fg-2 ${open || !long ? "" : "line-clamp-5"}`}>{text}</p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-4 w-full rounded-full bg-raised py-3 text-sm font-semibold transition hover:bg-overlay"
        >
          {open ? less : more}
        </button>
      )}
    </div>
  );
}
