"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { useI18n } from "@/components/I18nProvider";
import { buttonClass } from "@/components/ui/form";
import { AVATAR_BUCKET, squareAvatar } from "@/lib/avatar";
import { createClient } from "@/lib/supabase/client";

/** Changes are saved immediately: upload → point the profile at it → delete the old file. */
export function AvatarUploader({
  userId,
  avatarPath,
  name,
}: {
  userId: string;
  avatarPath: string | null;
  name: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const working = busy || refreshing;

  async function setAvatar(file: File | null) {
    setBusy(true);
    setError(false);
    const supabase = createClient();

    try {
      let newPath: string | null = null;
      if (file) {
        const blob = await squareAvatar(file);
        newPath = `${userId}/${crypto.randomUUID()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from(AVATAR_BUCKET)
          .upload(newPath, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
        if (uploadError) throw uploadError;
      }

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_path: newPath })
        .eq("id", userId);
      if (updateError) throw updateError;

      if (avatarPath) await supabase.storage.from(AVATAR_BUCKET).remove([avatarPath]);
      startRefresh(() => router.refresh());
    } catch (err) {
      console.error("Avatar update failed:", err);
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="relative">
        <Avatar path={avatarPath} name={name} size="xl" />
        {working && (
          <span className="absolute inset-0 grid place-items-center rounded-full bg-black/50">
            <Loader2 className="size-6 animate-spin text-white" />
          </span>
        )}
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          disabled={working}
          onClick={() => inputRef.current?.click()}
          className={buttonClass.secondary}
        >
          <Camera className="size-4" />
          {avatarPath ? t.profile.changePhoto : t.profile.uploadPhoto}
        </button>
        {avatarPath && (
          <button type="button" disabled={working} onClick={() => setAvatar(null)} className={buttonClass.danger}>
            <Trash2 className="size-4" />
            {t.profile.removePhoto}
          </button>
        )}
      </div>

      <p className="text-xs text-muted">{t.profile.photoHint}</p>
      {error && <p className="text-sm font-medium text-danger">{t.errors.generic}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) setAvatar(file);
        }}
      />
    </div>
  );
}
