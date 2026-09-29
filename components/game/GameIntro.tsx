"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Rocket } from "lucide-react";
import { LevelShield } from "@/components/game/PlayerCard";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass } from "@/components/ui/form";
import { Modal, useMounted } from "@/components/ui/Modal";
import { fmt } from "@/lib/i18n/dictionaries";

const key = (userId: string) => `brixa.level.${userId}`;

function readLevel(userId: string) {
  try {
    const value = localStorage.getItem(key(userId));
    return value === null ? null : Number(value);
  } catch {
    return undefined; // storage blocked: never show anything
  }
}

function writeLevel(userId: string, level: number) {
  try {
    localStorage.setItem(key(userId), String(level));
  } catch {}
}

/** The first time: a word about the game. After that: a moment when a new level is reached. */
export function GameIntro({ userId, level }: { userId: string; level: number }) {
  const { t } = useI18n();
  const mounted = useMounted();
  const [closed, setClosed] = useState(false);
  const stored = mounted ? readLevel(userId) : undefined;

  // a lower level than remembered (a deal taken back): just remember the new one
  useEffect(() => {
    if (typeof stored === "number" && stored > level) writeLevel(userId, level);
  }, [stored, level, userId]);

  if (!mounted || closed || stored === undefined) return null;
  const welcome = stored === null;
  if (!welcome && stored >= level) return null;

  const close = () => {
    writeLevel(userId, level);
    setClosed(true);
  };

  return (
    <Modal title={welcome ? t.game.welcomeTitle : t.game.levelUpTitle} onClose={close}>
      <div className="flex flex-col items-center pt-2 text-center">
        <div className="relative">
          <span className="absolute inset-0 animate-ping rounded-2xl bg-brand-cyan/30" aria-hidden />
          <LevelShield index={level} size="lg" />
        </div>
        <p className="mt-4 text-xl font-bold tracking-tight">{t.game.levels[level]}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {welcome ? t.game.welcomeText : fmt(t.game.levelUpText, { title: t.game.levels[level] })}
        </p>
        <div className="mt-6 flex w-full gap-2">
          {welcome && (
            <Link href="/plan" onClick={close} className={`${buttonClass.secondary} flex-1`}>
              <Rocket className="size-4" />
              {t.game.welcomeOpen}
            </Link>
          )}
          <button type="button" onClick={close} className={`${buttonClass.primary} flex-1`}>
            {t.game.close}
          </button>
        </div>
      </div>
    </Modal>
  );
}
