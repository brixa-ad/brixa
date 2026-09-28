"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CheckCircle2, Loader2, Mail, MessageCircle, Phone } from "lucide-react";
import { logActivity } from "@/app/(app)/tasks/actions";
import { useI18n } from "@/components/I18nProvider";
import { NoteArea } from "@/components/ui/Dictate";
import { buttonClass } from "@/components/ui/form";
import { mailHref, telHref, viberHref, type ContactKind } from "@/lib/phone";

const LOG_TYPE: Record<ContactKind, "call" | "message" | "email"> = { call: "call", viber: "message", email: "email" };

/**
 * Call / Viber / e-mail a client in one tap — then note how it went, straight into the
 * client's history. `open` (from a notification's button) starts that contact right away.
 */
export function ContactButtons({
  phone,
  email,
  clientId,
  open,
  compact = false,
}: {
  phone: string | null | undefined;
  email: string | null | undefined;
  clientId?: string | null;
  open?: ContactKind | null;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const [used, setUsed] = useState<ContactKind | null>(null);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const opened = useRef(false);

  const links: { kind: ContactKind; href: string; label: string; icon: typeof Phone }[] = [];
  if (phone) links.push({ kind: "call", href: telHref(phone), label: t.contact.call, icon: Phone });
  if (phone) links.push({ kind: "viber", href: viberHref(phone), label: t.contact.viber, icon: MessageCircle });
  if (email) links.push({ kind: "email", href: mailHref(email), label: t.contact.email, icon: Mail });

  // A notification's "Call" / "Viber" / "E-mail" button lands here with ?contact=…
  useEffect(() => {
    if (opened.current || !open) return;
    const target = links.find((link) => link.kind === open);
    if (!target) return;
    opened.current = true;
    window.location.href = target.href;
  });

  if (links.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className={`flex flex-wrap gap-2 ${compact ? "" : "[&>a]:flex-1"}`}>
        {links.map(({ kind, href, label, icon: Icon }) => (
          <a
            key={kind}
            href={href}
            onClick={() => {
              if (!clientId) return;
              setUsed(kind);
              setSaved(false);
            }}
            title={label}
            aria-label={label}
            className={
              compact
                ? "grid size-9 place-items-center rounded-lg border border-line bg-surface text-accent-fg transition hover:bg-raised"
                : kind === "call"
                  ? buttonClass.primary
                  : buttonClass.secondary
            }
          >
            <Icon className="size-4" />
            {!compact && label}
          </a>
        ))}
      </div>

      {/* after the call / message: a line for the client's history */}
      {used && clientId && !compact && (
        <div className="space-y-2 rounded-xl border border-line bg-raised/50 p-3">
          {saved ? (
            <p className="flex items-center gap-1.5 text-sm font-medium text-success">
              <CheckCircle2 className="size-4" />
              {t.contact.logged}
            </p>
          ) : (
            <>
              <p className="text-sm font-medium">{t.contact.logTitle}</p>
              <NoteArea
                rows={2}
                value={note}
                maxLength={2000}
                onChange={setNote}
                placeholder={t.contact.logPlaceholder}
              />
              <button
                type="button"
                disabled={pending || !note.trim()}
                onClick={() =>
                  startTransition(async () => {
                    const result = await logActivity({ type: LOG_TYPE[used], clientId, propertyId: null, note });
                    if (result.ok) {
                      setSaved(true);
                      setNote("");
                    }
                  })
                }
                className={`${buttonClass.primary} w-full`}
              >
                {pending && <Loader2 className="size-4 animate-spin" />}
                {t.contact.logSave}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
