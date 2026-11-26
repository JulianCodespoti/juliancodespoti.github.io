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
  copperLine: string;
  teal: string;
  tealBg: string;
  tealLine: string;
  sage: string;
  sageBg: string;
  sageLine: string;
  crimson: string;
  crimsonBg: string;
  crimsonLine: string;
  fontSans: string;
  fontMono: string;
}

const DARK_FALLBACK: ThemePalette = {
  mode: "dark",
  bg: "#0e1013",
  surface: "#15181d",
  surfaceSub: "#1c2027",
  line: "#272c36",
  lineStrong: "#434b5c",
  ink: "#eef0f4",
  muted: "#a4adba",
  dim: "#818b9b",
  copper: "#e6824e",
  copperBg: "rgba(230, 130, 78, 0.16)",
  copperLine: "rgba(230, 130, 78, 0.56)",
  teal: "#3fb8b2",
  tealBg: "rgba(63, 184, 178, 0.16)",
  tealLine: "rgba(63, 184, 178, 0.54)",
  sage: "#52bd85",
  sageBg: "rgba(82, 189, 133, 0.16)",
  sageLine: "rgba(82, 189, 133, 0.54)",
  crimson: "#eb6666",
  crimsonBg: "rgba(235, 102, 102, 0.17)",
  crimsonLine: "rgba(235, 102, 102, 0.58)",
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
    copperLine: v("--copper-line", DARK_FALLBACK.copperLine),
    teal: v("--teal", DARK_FALLBACK.teal),
    tealBg: v("--teal-bg", DARK_FALLBACK.tealBg),
    tealLine: v("--teal-line", DARK_FALLBACK.tealLine),
    sage: v("--sage", DARK_FALLBACK.sage),
    sageBg: v("--sage-bg", DARK_FALLBACK.sageBg),
    sageLine: v("--sage-line", DARK_FALLBACK.sageLine),
    crimson: v("--crimson", DARK_FALLBACK.crimson),
    crimsonBg: v("--crimson-bg", DARK_FALLBACK.crimsonBg),
    crimsonLine: v("--crimson-line", DARK_FALLBACK.crimsonLine),
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
