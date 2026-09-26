"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PREPARE_REFRESH_MS } from "@/lib/passkey";

/**
 * Keeps a fresh passkey challenge ready so a tap can open Face ID without waiting
 * on the network. `take()` hands out the current one (challenges are single-use)
 * and fetches the next.
 */
export function usePrepared<T>(prepare: () => Promise<T | null>, enabled: boolean) {
  const [ready, setReady] = useState(false);
  const current = useRef<T | null>(null);

  const refresh = useCallback(async () => {
    current.current = await prepare();
    setReady(current.current !== null);
  }, [prepare]);

  useEffect(() => {
    if (!enabled) return;
    let ignore = false;
    const run = async () => {
      const next = await prepare();
      if (ignore) return;
      current.current = next;
      setReady(next !== null);
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

  return { ready, take, refresh };
}
