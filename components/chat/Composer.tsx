"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, Camera, FileText, Handshake, Mic, Paperclip, SendHorizontal, Square, UserRound, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { CHAT_BUCKET, CHAT_MAX_BYTES, MESSAGE_COLUMNS, duration, type ChatMessage } from "@/lib/chat";
import { compressImage } from "@/lib/photos";
import { createClient } from "@/lib/supabase/client";

export type CardKind = "property" | "client" | "deal";

// what a file is, when the phone doesn't say
const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  gif: "image/gif",
};

/** The bottom of a conversation: write, attach (a photo, a file, something from BRIXA), or speak. */
export function Composer({
  room,
  me,
  myOrg,
  shared,
  onSent,
  onPickCard,
}: {
  room: string;
  me: string;
  myOrg: string;
  /** with another agency: no clients or deals */
  shared: boolean;
  onSent: (message: ChatMessage) => void;
  onPickCard: (kind: CardKind) => void;
}) {
  const { t } = useI18n();
  const C = t.chat;
  const [text, setText] = useState("");
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState<{ started: number } | null>(null);
  const [now, setNow] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const keep = useRef(true);
  const photoInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  // the recording's clock
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [recording]);

  async function insert(row: Partial<ChatMessage>) {
    const supabase = createClient();
    const { data, error: failed } = await supabase
      .from("chat_messages")
      .insert({ room_id: room, sender_id: me, organization_id: myOrg, ...row })
      .select(MESSAGE_COLUMNS)
      .single();
    if (failed || !data) throw failed ?? new Error("not sent");
    onSent(data as ChatMessage);
  }

  async function sendText() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      await insert({ kind: "text", body: body.slice(0, 4000) });
      setText("");
      area.current?.focus();
    } catch {
      setError(C.uploadFailed);
    } finally {
      setBusy(false);
    }
  }

  async function upload(blob: Blob, name: string, type: string, kind: "image" | "file" | "voice", seconds?: number) {
    if (blob.size > CHAT_MAX_BYTES) {
      setError(C.tooBig);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ext = (name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
      const path = `${room}/${crypto.randomUUID()}.${ext}`;
      const supabase = createClient();
      const { error: failed } = await supabase.storage.from(CHAT_BUCKET).upload(path, blob, { contentType: type, upsert: false });
      if (failed) throw failed;
      await insert({ kind, file_path: path, file_name: name.slice(0, 200), file_type: type, file_size: blob.size, duration_s: seconds ?? null });
    } catch {
      setError(C.uploadFailed);
    } finally {
      setBusy(false);
    }
  }

  async function pickFile(file: File | undefined, asPhoto: boolean) {
    if (!file) return;
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    const type = file.type || TYPES[ext] || "application/octet-stream";
    if (type.startsWith("image/") && type !== "image/gif") {
      // photos go smaller (2000px), as JPEG
      const small = await compressImage(file);
      const jpeg = small.type === "image/jpeg";
      await upload(small, jpeg ? file.name.replace(/\.[^.]+$/, "") + ".jpg" : file.name, jpeg ? "image/jpeg" : type, "image");
    } else {
      await upload(file, file.name, type, asPhoto && type.startsWith("image/") ? "image" : "file");
    }
  }

  async function startRecording() {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError(C.micDenied);
      return;
    }
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    const started = Date.now();
    keep.current = true;
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      setRecording(null);
      if (!keep.current || chunks.length === 0) return;
      // the bucket knows the plain type ("audio/webm", "audio/mp4")
      const type = (rec.mimeType || mime || "audio/webm").split(";")[0];
      const ext = type === "audio/mp4" ? "m4a" : type.split("/")[1];
      const seconds = Math.round((Date.now() - started) / 1000);
      void upload(new Blob(chunks, { type }), `voice.${ext}`, type, "voice", seconds);
    };
    rec.start();
    recorder.current = rec;
    setNow(started);
    setRecording({ started });
  }

  function stopRecording(send: boolean) {
    keep.current = send;
    recorder.current?.stop();
    recorder.current = null;
  }

  const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  const options: { kind: "photo" | "file" | CardKind; icon: typeof Camera; label: string }[] = [
    { kind: "photo", icon: Camera, label: C.photo },
    { kind: "file", icon: FileText, label: C.file },
    { kind: "property", icon: Building2, label: C.property },
    ...(shared
      ? []
      : ([
          { kind: "client", icon: UserRound, label: C.client },
          { kind: "deal", icon: Handshake, label: C.deal },
        ] as const)),
  ];

  return (
    <div className="border-t border-line bg-canvas/95 px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur">
      {error && <p className="mb-1.5 px-1 text-sm text-danger">{error}</p>}
      {menu && (
        <div className="mb-2 flex flex-wrap gap-2">
          {options.map((o) => (
            <button
              key={o.kind}
              type="button"
              onClick={() => {
                setMenu(false);
                if (o.kind === "photo") photoInput.current?.click();
                else if (o.kind === "file") fileInput.current?.click();
                else onPickCard(o.kind);
              }}
              className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-2 text-sm font-medium text-fg-2 transition hover:bg-raised"
            >
              <o.icon className="size-4 text-accent-fg" />
              {o.label}
            </button>
          ))}
        </div>
      )}
      <input ref={photoInput} type="file" accept="image/*" hidden onChange={(e) => { void pickFile(e.target.files?.[0], true); e.target.value = ""; }} />
      <input
        ref={fileInput}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,image/*"
        hidden
        onChange={(e) => { void pickFile(e.target.files?.[0], false); e.target.value = ""; }}
      />

      {recording ? (
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => stopRecording(false)} className="grid size-11 place-items-center rounded-full text-muted transition hover:bg-raised" aria-label={C.cancelRecording}>
            <X className="size-5" />
          </button>
          <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
            <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-danger" />
            <span className="font-medium tabular-nums">{duration((now - recording.started) / 1000)}</span>
            <span className="truncate text-muted">{C.recording}</span>
          </span>
          <button type="button" onClick={() => stopRecording(true)} className="grid size-11 place-items-center rounded-full bg-accent text-on-accent" aria-label={C.send}>
            <Square className="size-4 fill-current" />
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => setMenu(!menu)}
            disabled={busy}
            className={`grid size-11 shrink-0 place-items-center rounded-full transition ${menu ? "bg-accent-soft text-accent-fg" : "text-muted hover:bg-raised"}`}
            aria-label={C.attach}
          >
            <Paperclip className="size-5" />
          </button>
          <textarea
            ref={area}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // on a computer Enter sends (Shift+Enter: a new line); on a phone Enter is a new line
              if (e.key === "Enter" && !e.shiftKey && !touch) {
                e.preventDefault();
                void sendText();
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder={C.placeholder}
            className="max-h-36 min-h-11 flex-1 resize-none rounded-2xl border border-line-strong bg-raised px-4 py-2.5 text-base outline-none transition [field-sizing:content] focus:border-accent sm:text-[15px]"
          />
          {text.trim() ? (
            <button type="button" onClick={() => void sendText()} disabled={busy} className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-on-accent disabled:opacity-60" aria-label={C.send}>
              <SendHorizontal className="size-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void startRecording()}
              disabled={busy}
              className="grid size-11 shrink-0 place-items-center rounded-full text-muted transition hover:bg-raised disabled:opacity-60"
              aria-label={C.record}
              title={C.record}
            >
              <Mic className="size-5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
