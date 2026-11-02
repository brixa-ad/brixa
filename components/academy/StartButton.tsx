"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

/** The button that starts a test: it waits while the questions are picked. */
export function StartButton({ className, children, disabled }: { className: string; children: React.ReactNode; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={disabled || pending} aria-busy={pending}>
      {pending && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}
