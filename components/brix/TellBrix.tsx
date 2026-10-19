"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Mic } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { DictateButton, appendText } from "@/components/ui/Dictate";
import { buttonClass, inputClass } from "@/components/ui/form";

/**
 * After a call or a meeting: say what happened, and Brix turns it into a new client, a note and the
 * next step — each one shown to confirm. The words can be checked and corrected before they go.
 */
export function TellBrix() {
  const { t } = useI18n();
  const B = t.brix;
  const router = useRouter();
  const [text, setText] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);

  const send = () => {
    const words = text.trim();
    if (words) router.push(`/brix?q=${encodeURIComponent(words.slice(0, 2000))}`);
  };

  return (
    <section className="rounded-2xl border border-accent/40 bg-surface p-4 shadow-xs sm:p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Mic className="size-4 text-brand-cyan" />
        {B.tellTitle}
      </h2>
      <p className="mt-0.5 text-sm text-muted">{B.tellHint}</p>
      <div className="relative mt-3">
        <textarea
          ref={field}
          value={text}
          rows={2}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
          placeholder={B.tellPlaceholder}
          aria-label={B.tellTitle}
          className={`${inputClass} resize-y pb-10`}
        />
        <DictateButton
          className="absolute bottom-1.5 right-1.5 bg-accent-soft text-accent-fg!"
          onText={(words) => setText((current) => appendText(current, words))}
          onKeyboard={() => field.current?.focus()}
        />
      </div>
      <div className="mt-2 flex justify-end">
        <button type="button" disabled={!text.trim()} onClick={send} className={buttonClass.primary}>
          {B.tellSend}
          <ArrowRight className="size-4" />
        </button>
      </div>
    </section>
  );
}
