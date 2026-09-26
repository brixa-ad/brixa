"use client";

import { useEffect } from "react";
import { markNotificationsRead } from "@/app/(app)/tasks/actions";

/** Opening the notifications page counts as reading them (clears the bell). */
export function MarkNotificationsRead({ hasUnread }: { hasUnread: boolean }) {
  useEffect(() => {
    if (hasUnread) void markNotificationsRead();
  }, [hasUnread]);
  return null;
}
