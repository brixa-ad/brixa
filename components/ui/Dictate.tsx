"use client";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Loader2, Mic, MicOff } from "lucide-react";
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
  onerror: ((event: { error?: string }) => void) | null;
};

/** The longest note recorded in one go. */
const MAX_RECORDING_MS = 2 * 60 * 1000;

/** Whether the server can turn a recording into text (a speech service key is set). */
const DictationContext = createContext({ server: false });

export function DictationProvider({ server, children }: { server: boolean; children: React.ReactNode }) {
  return <DictationContext.Provider value={{ server }}>{children}</DictationContext.Provider>;
}

/** The browser's own speech-to-text (Chrome, Edge, Safari), if it has one. */
function recognitionClass(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** The app added to an iPhone's home screen: iOS gives it no speech recognition of its own. */
function isIosHomeScreenApp() {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || (/iPhone|iPad|iPod/.test(navigator.userAgent) && matchMedia("(display-mode: standalone)").matches);
}

const canRecord = () => typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

type Mode = "native" | "record" | "none";

function pickMode(server: boolean, nativeBroken: boolean): Mode {
  if (typeof window === "undefined") return "none";
  if (!nativeBroken && recognitionClass() && !isIosHomeScreenApp()) return "native";
  if (server && canRecord()) return "record";
  return "none";
}

/** Adds dictated words after what's already typed. */
export const appendText = (current: string, added: string) => (current.trim() ? `${current.trimEnd()} ${added}` : added);

/**
 * A microphone next to a note: speak and the words are typed in. The browser's own dictation
 * where it has one; otherwise (the iPhone home-screen app) the note is recorded and the server writes it.
 */
export function DictateButton({ onText, className = "" }: { onText: (text: string) => void; className?: string }) {
  const { t, lang } = useI18n();
  const { server } = useContext(DictationContext);
  const [nativeBroken, setNativeBroken] = useState(false);
  const mode = useSyncExternalStore(
    () => () => {},
    () => pickMode(server, nativeBroken),
    () => "none" as Mode,
  );
  const [state, setState] = useState<"idle" | "listening" | "working">("idle");
  const [failed, setFailed] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const latest = useRef(onText);
  useEffect(() => {
    latest.current = onText;
  });
  useEffect(
    () => () => {
      recognition.current?.stop();
      if (recorder.current?.state === "recording") recorder.current.stop();
    },
    []
  );

  if (mode === "none") return null;

  function flashError() {
    setFailed(true);
    setTimeout(() => setFailed(false), 3000);
  }

  function startNative() {
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
      setState("idle");
    };
    r.onerror = (event) => {
      recognition.current = null;
      setState("idle");
      // the browser has the API but won't let this page use it — record instead, if the server can write it
      if (event.error === "service-not-allowed" || event.error === "not-allowed" || event.error === "audio-capture") {
        setNativeBroken(true);
      }
      if (event.error && event.error !== "no-speech" && event.error !== "aborted") flashError();
    };
    recognition.current = r;
    try {
      r.start();
      setState("listening");
    } catch {
      recognition.current = null;
      setNativeBroken(true);
    }
  }

  async function startRecording() {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      flashError();
      return;
    }
    const type = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((x) => MediaRecorder.isTypeSupported?.(x));
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    const limit = setTimeout(() => rec.state === "recording" && rec.stop(), MAX_RECORDING_MS);
    rec.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    rec.onstop = async () => {
      clearTimeout(limit);
      stream.getTracks().forEach((track) => track.stop());
      recorder.current = null;
      const mime = rec.mimeType || type || "audio/mp4";
      const audio = new Blob(chunks, { type: mime });
      if (!audio.size) {
        setState("idle");
        return;
      }
      setState("working");
      const ext = mime.includes("webm") ? "webm" : mime.includes("ogg") ? "ogg" : "m4a";
      const form = new FormData();
      form.append("audio", audio, `note.${ext}`);
      form.append("lang", lang);
      try {
        const response = await fetch("/api/transcribe", { method: "POST", body: form });
        const result = (await response.json()) as { text?: string };
        if (response.ok && result.text) latest.current(result.text);
        else flashError();
      } catch {
        flashError();
      }
      setState("idle");
    };
    recorder.current = rec;
    rec.start();
    setState("listening");
  }

  function toggle() {
    setFailed(false);
    if (state === "working") return;
    if (state === "listening") {
      recognition.current?.stop();
      if (recorder.current?.state === "recording") recorder.current.stop();
      return;
    }
    if (mode === "native") startNative();
    else void startRecording();
  }

  const label = state === "listening" ? t.dictation.stop : t.dictation.start;
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={state === "working"}
      title={label}
      aria-label={label}
      aria-pressed={state === "listening"}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
        state === "listening" || failed ? "bg-danger/15 text-danger" : "text-muted hover:bg-raised hover:text-fg"
      } ${className}`}
    >
      {state === "working" ? (
        <Loader2 className="size-4 animate-spin" />
      ) : state === "listening" ? (
        <MicOff className="size-4 animate-pulse" />
      ) : (
        <Mic className="size-4" />
      )}
      {state === "listening" && <span>{t.dictation.listening}</span>}
      {state === "working" && <span>{t.dictation.working}</span>}
      {failed && state === "idle" && <span>{t.dictation.failed}</span>}
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
