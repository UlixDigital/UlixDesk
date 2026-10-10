"use client";

import { useEffect, useState } from "react";

const listeners = new Set<(now: number) => void>();
let intervalId: number | null = null;

function publish(now: number) {
  for (const listener of listeners) listener(now);
}

/** One clock for the header timer and the daily running row, so they tick together. */
export function useSharedNow(serverNow: number) {
  const [now, setNow] = useState(serverNow);

  useEffect(() => {
    listeners.add(setNow);
    if (intervalId === null) {
      publish(Date.now());
      intervalId = window.setInterval(() => publish(Date.now()), 1000);
    } else {
      setNow(Date.now());
    }
    return () => {
      listeners.delete(setNow);
      if (listeners.size === 0 && intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };
  }, []);

  return now;
}
