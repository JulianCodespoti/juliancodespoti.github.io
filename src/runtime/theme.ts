import { useEffect, useState } from "react";

export interface ThemePalette {
  mode: "dark" | "light";
  bg: string;
  surface: string;
  surfaceSub: string;
  line: string;
  lineStrong: string;
  ink: string;
  muted: string;
  dim: string;
  copper: string;
  copperBg: string;
  teal: string;
  tealBg: string;
  sage: string;
  sageBg: string;
  crimson: string;
  crimsonBg: string;
  fontSans: string;
  fontMono: string;
}

const DARK_FALLBACK: ThemePalette = {
  mode: "dark",
  bg: "#111214",
  surface: "#17191c",
  surfaceSub: "#1e2126",
  line: "#2a2e36",
  lineStrong: "#3e4451",
  ink: "#e7e9ee",
  muted: "#98a0ae",
  dim: "#666e7c",
  copper: "#df7a47",
  copperBg: "rgba(223, 122, 71, 0.16)",
  teal: "#34a8a3",
  tealBg: "rgba(52, 168, 163, 0.16)",
  sage: "#48b07b",
  sageBg: "rgba(72, 176, 123, 0.16)",
  crimson: "#e05656",
  crimsonBg: "rgba(224, 86, 86, 0.16)",
  fontSans: '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, sans-serif',
  fontMono: '"IBM Plex Mono", ui-monospace, monospace',
};

export function readThemePalette(): ThemePalette {
  if (typeof window === "undefined") return DARK_FALLBACK;
  const root = document.documentElement;
  const css = getComputedStyle(root);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const mode = root.dataset.theme === "light" ? "light" : "dark";
  return {
    mode,
    bg: v("--bg", DARK_FALLBACK.bg),
    surface: v("--stage", DARK_FALLBACK.surface),
    surfaceSub: v("--stage-sub", DARK_FALLBACK.surfaceSub),
    line: v("--line", DARK_FALLBACK.line),
    lineStrong: v("--line-strong", DARK_FALLBACK.lineStrong),
    ink: v("--fg", DARK_FALLBACK.ink),
    muted: v("--fg-muted", DARK_FALLBACK.muted),
    dim: v("--fg-dim", DARK_FALLBACK.dim),
    copper: v("--copper", DARK_FALLBACK.copper),
    copperBg: v("--copper-bg", DARK_FALLBACK.copperBg),
    teal: v("--teal", DARK_FALLBACK.teal),
    tealBg: v("--teal-bg", DARK_FALLBACK.tealBg),
    sage: v("--sage", DARK_FALLBACK.sage),
    sageBg: v("--sage-bg", DARK_FALLBACK.sageBg),
    crimson: v("--crimson", DARK_FALLBACK.crimson),
    crimsonBg: v("--crimson-bg", DARK_FALLBACK.crimsonBg),
    fontSans: v("--font-sans", DARK_FALLBACK.fontSans),
    fontMono: v("--font-mono", DARK_FALLBACK.fontMono),
  };
}

/** Reactive CSS token snapshot that updates live on Dark/Light toggle. */
export function useThemePalette(): ThemePalette {
  const [palette, setPalette] = useState<ThemePalette>(DARK_FALLBACK);

  useEffect(() => {
    setPalette(readThemePalette());
    const obs = new MutationObserver(() => setPalette(readThemePalette()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  return palette;
}
