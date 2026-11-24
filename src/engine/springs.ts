import { useEffect, useRef, useState } from "react";

export const SPRING_SNAPPY = { type: "spring" as const, stiffness: 420, damping: 32, mass: 0.75 };
export const SPRING_GENTLE = { type: "spring" as const, stiffness: 260, damping: 28, mass: 0.9 };
export const SPRING_WEIGHTY = { type: "spring" as const, stiffness: 320, damping: 30, mass: 1.1 };

/**
 * Shared visibility + reduced-motion gate for every animated scene so offscreen
 * simulations automatically pause and never waste battery.
 */
export function useSceneActive(running: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(true);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const fn = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) setInView(e.isIntersecting);
      },
      { rootMargin: "100px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return { ref, active: running && inView && !reduced, reduced };
}
