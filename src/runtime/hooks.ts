import { useCallback, useEffect, useState } from "react";

/** Shared playback controller hook for timeline or stepped interactive figures. */
export function usePlayback(totalSteps: number, initialRunning = false, intervalMs = 850) {
  const [step, setStep] = useState(0);
  const [running, setRunning] = useState(initialRunning);

  useEffect(() => {
    if (!running || totalSteps <= 1) return;
    const id = window.setInterval(() => {
      setStep((s) => (s + 1 >= totalSteps ? 0 : s + 1));
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [running, totalSteps, intervalMs]);

  const toggle = useCallback(() => setRunning((r) => !r), []);
  const reset = useCallback(() => {
    setStep(0);
    setRunning(false);
  }, []);

  return { step, setStep, running, setRunning, toggle, reset };
}

/** Optional URL query-param state hook so complex sandboxes can be deep-linked and shared. */
export function useFigureParam<T extends string>(key: string, fallback: T, allowed?: readonly T[]) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return fallback;
    const raw = new URLSearchParams(window.location.search).get(key);
    if (!raw) return fallback;
    if (allowed && !allowed.includes(raw as T)) return fallback;
    return raw as T;
  });

  const update = useCallback(
    (next: T) => {
      setValue(next);
      if (typeof window === "undefined") return;
      const url = new URL(window.location.href);
      if (next === fallback) url.searchParams.delete(key);
      else url.searchParams.set(key, next);
      window.history.replaceState({}, "", url);
    },
    [key, fallback],
  );

  return [value, update] as const;
}
