import type { ReactNode } from "react";

export type SemanticTone = "accent" | "cyan" | "emerald" | "amber" | "rose" | "neutral";

const DOT_COLOR: Record<SemanticTone, string> = {
  accent: "var(--accent)",
  cyan: "var(--cyan)",
  emerald: "var(--emerald)",
  amber: "var(--amber)",
  rose: "var(--rose)",
  neutral: "var(--fg-muted)",
};

export function MetricPill({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  tone?: SemanticTone;
}) {
  return (
    <span className="metric-pill">
      <span className="metric-dot" style={{ background: DOT_COLOR[tone] }} aria-hidden="true" />
      <span className="metric-pill-label">{label}</span>
      <span>{value}</span>
    </span>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="kit-seg" role="group" aria-label={label}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className="kit-seg-btn"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (next: number) => void;
}) {
  return (
    <label className="kit-slider">
      <span className="kit-slider-head">
        <span className="kit-slider-label">{label}</span>
        <span className="kit-slider-val">{format ? format(value) : String(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="kit-toggle"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
    >
      <span className="kit-toggle-dot" aria-hidden="true" />
      {label}
    </button>
  );
}

export function ActionButton({
  children,
  onClick,
  variant = "default",
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  variant?: "default" | "primary" | "danger";
  disabled?: boolean;
}) {
  const cls =
    variant === "primary"
      ? "kit-btn kit-btn--primary"
      : variant === "danger"
        ? "kit-btn kit-btn--danger"
        : "kit-btn";
  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
