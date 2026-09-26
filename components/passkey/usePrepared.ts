"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PREPARE_REFRESH_MS } from "@/lib/passkey";

/**
 * Keeps a fresh passkey challenge ready so a tap can open Face ID without waiting
 * on the network. `take()` hands out the current one (challenges are single-use)
 * and fetches the next.
 */
export function usePrepared<T extends { rpId: string | null }>(
  prepare: () => Promise<T | null>,
  enabled: boolean
) {
  const [ready, setReady] = useState(false);
  /** the site address passkeys are set up for (from the server) */
  const [rpId, setRpId] = useState<string | null>(null);
  const current = useRef<T | null>(null);

  const refresh = useCallback(async () => {
    current.current = await prepare();
    setReady(current.current !== null);
    if (current.current?.rpId) setRpId(current.current.rpId);
  }, [prepare]);

  useEffect(() => {
    if (!enabled) return;
    let ignore = false;
    const run = async () => {
      const next = await prepare();
      if (ignore) return;
      current.current = next;
      setReady(next !== null);
      if (next?.rpId) setRpId(next.rpId);
    };
    run();
    const timer = setInterval(run, PREPARE_REFRESH_MS);
    return () => {
      ignore = true;
      clearInterval(timer);
    };
  }, [enabled, prepare]);

  const take = useCallback(() => {
    const value = current.current;
    current.current = null;
    setReady(false);
    return value;
  }, []);

  return { ready, take, refresh, rpId };
}
