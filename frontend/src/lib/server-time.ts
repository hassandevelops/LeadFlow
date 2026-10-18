import { useEffect, useState } from "react";
import { api } from "./api-client";

let serverOffsetMs = 0;
let syncPromise: Promise<void> | null = null;

export function syncServerTime(): Promise<void> {
  syncPromise ??= api
    .get<{ serverTime: string }>("/time")
    .then((result) => {
      serverOffsetMs = new Date(result.serverTime).getTime() - Date.now();
    })
    .catch(() => {
      serverOffsetMs = 0;
    })
    .finally(() => {
      syncPromise = null;
    });
  return syncPromise;
}

export function serverNow(): number {
  return Date.now() + serverOffsetMs;
}

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(serverNow);

  useEffect(() => {
    void syncServerTime();
    setNow(serverNow());
    const timer = window.setInterval(() => setNow(serverNow()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return now;
}
