import type { ReactNode } from "react";

export type SwatchColor = "amber" | "blue" | "green" | "red" | "dim";

const VAR: Record<SwatchColor, string> = {
  amber: "var(--amber)",
  blue: "var(--blue)",
  green: "var(--green)",
  red: "var(--red)",
  dim: "var(--fg-dim)",
};

/**
 * Inline colored square + label inside prose so the reader maps a color in
 * a sentence straight onto the matching blocks in the diagram below it.
 */
export function Legend({ color, children }: { color: SwatchColor; children: ReactNode }) {
  return (
    <span className="legend-token" style={{ color: color === "dim" ? "var(--fg-muted)" : VAR[color] }}>
      <span className="legend-swatch" style={{ background: VAR[color] }} aria-hidden="true" />
      {children}
    </span>
  );
}
