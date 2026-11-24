import type { ReactNode } from "react";

export const SPRING_SNAPPY = { type: "spring" as const, stiffness: 420, damping: 32, mass: 0.8 };
export const SPRING_GENTLE = { type: "spring" as const, stiffness: 240, damping: 28, mass: 0.9 };
export const SPRING_WEIGHTY = { type: "spring" as const, stiffness: 160, damping: 24, mass: 1.1 };

export function SvgStage({
  viewBox,
  label,
  framed = true,
  children,
}: {
  viewBox: string;
  label: string;
  framed?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={framed ? "svg-stage svg-stage--framed" : "svg-stage"}>
      <svg viewBox={viewBox} role="img" aria-label={label} style={{ width: "100%", height: "auto", display: "block" }}>
        {children}
      </svg>
    </div>
  );
}
