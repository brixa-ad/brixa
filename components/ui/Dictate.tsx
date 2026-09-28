"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Mic, MicOff } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { inputClass } from "@/components/ui/form";

type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<SpeechResult> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

/** The browser's speech-to-text (Chrome, Edge, Safari), if it has one. */
function recognitionClass(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Adds dictated words after what's already typed. */
export const appendText = (current: string, added: string) => (current.trim() ? `${current.trimEnd()} ${added}` : added);

/**
 * A microphone next to a note: speak and the words are typed in. Hidden where the browser
 * can't do it (the phone keyboard's own microphone still works there).
 */
export function DictateButton({ onText, className = "" }: { onText: (text: string) => void; className?: string }) {
  const { t, lang } = useI18n();
  const supported = useSyncExternalStore(
    () => () => {},
    () => recognitionClass() !== null,
    () => false,
  );
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const latest = useRef(onText);
  useEffect(() => {
    latest.current = onText;
  });
  useEffect(() => () => recognition.current?.stop(), []);

  if (!supported) return null;

  function toggle() {
    if (recognition.current) {
      recognition.current.stop();
      return;
    }
    const Speech = recognitionClass();
    if (!Speech) return;
    const r = new Speech();
    r.lang = lang === "bg" ? "bg-BG" : "en-US";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript.trim();
        if (result.isFinal && text) latest.current(text);
      }
    };
    r.onend = () => {
      recognition.current = null;
      setListening(false);
    };
    r.onerror = () => {
      recognition.current = null;
      setListening(false);
    };
    recognition.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      recognition.current = null;
    }
  }

  const label = listening ? t.dictation.stop : t.dictation.start;
  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      aria-pressed={listening}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
        listening ? "bg-danger/15 text-danger" : "text-muted hover:bg-raised hover:text-fg"
      } ${className}`}
    >
      {listening ? <MicOff className="size-4 animate-pulse" /> : <Mic className="size-4" />}
      {listening && <span>{t.dictation.listening}</span>}
    </button>
  );
}

/** A note box with the microphone in its corner. */
export function NoteArea({
  value,
  onChange,
  rows = 3,
  className = "",
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  className?: string;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange" | "rows" | "className">) {
  return (
    <div className="relative">
      <textarea
        {...rest}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} resize-y pb-10 ${className}`}
      />
      <DictateButton className="absolute bottom-1.5 right-1.5" onText={(text) => onChange(appendText(value, text))} />
    </div>
  );
}
