"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { setAgencyLogo } from "@/app/(app)/settings/actions";
import { takePendingLogo } from "@/lib/pending-logo";
import { createClient } from "@/lib/supabase/client";

/** The owner's first visit after signing up an agency: the logo picked then goes up now. */
export function PendingLogo({ organizationId }: { organizationId: string }) {
  const router = useRouter();

  useEffect(() => {
    // taken once (and forgotten) — a second run finds nothing
    (async () => {
      const logo = await takePendingLogo();
      if (!logo) return;
      const extension = logo.type === "image/svg+xml" ? "svg" : logo.type === "image/jpeg" ? "jpg" : logo.type === "image/webp" ? "webp" : "png";
      const path = `${organizationId}/logo-${crypto.randomUUID()}.${extension}`;
      const { error } = await createClient().storage.from("agency-logos").upload(path, logo, { contentType: logo.type });
      if (error) {
        console.error("Uploading the logo failed:", error.message);
        return;
      }
      if ((await setAgencyLogo(path)).ok) router.refresh();
    })();
  }, [organizationId, router]);

  return null;
}
