import type { ReactNode } from "react";

export type InkTone = "copper" | "teal" | "sage" | "crimson";

const TONE_COLOR: Record<InkTone, string> = {
  copper: "var(--copper)",
  teal: "var(--teal)",
  sage: "var(--sage)",
  crimson: "var(--crimson)",
};

/** Inline underlined concept highlight matching the canvas ink directly below. */
export function Cue({ tone, children }: { tone: InkTone; children: ReactNode }) {
  return (
    <span className="ink-cue" style={{ color: TONE_COLOR[tone] }}>
      {children}
    </span>
  );
}

/** Quiet editorial discovery prompt encouraging the reader to poke at an edge case. */
export function TryThis({ children }: { children: ReactNode }) {
  return (
    <div className="try-this">
      <span className="try-this-tag">Try this:</span> {children}
    </div>
  );
}

/** Frameless editorial figure with optional quiet inline controls and caption below. */
export function Figure({
  controls,
  caption,
  children,
}: {
  controls?: ReactNode;
  caption?: ReactNode;
  children: ReactNode;
}) {
  return (
    <figure className="post-figure">
      {children}
      {controls ? <div className="fig-controls">{controls}</div> : null}
      {caption ? <figcaption className="fig-caption">{caption}</figcaption> : null}
    </figure>
  );
}

/** Quiet segmented pill toggle. */
export function Toggle<T extends string>({
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
    <div className="ui-toggle" role="group" aria-label={label}>
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            className="ui-toggle-btn"
            aria-pressed={selected}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Tactile icon-only button (Play, Pause, Replay). */
export function IconButton({
  children,
  onClick,
  label,
  accent = false,
}: {
  children: ReactNode;
  onClick: () => void;
  label: string;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      className={accent ? "ui-btn ui-btn--icon ui-btn--accent" : "ui-btn ui-btn--icon"}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

/** Quiet inline pill button for direct actions or selections. */
export function ChipButton({
  children,
  onClick,
  active = false,
  accent = false,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  accent?: boolean;
  label?: string;
}) {
  const cls = [
    "ui-btn",
    active ? "ui-btn--active" : "",
    accent ? "ui-btn--accent" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type="button" className={cls} onClick={onClick} aria-pressed={active || undefined} aria-label={label}>
      {children}
    </button>
  );
}

/** Press-and-hold tactile button for simulating transient states (tunnel, packet drop, load spike). */
export function HoldButton({
  label,
  activeLabel,
  held,
  onHoldChange,
}: {
  label: string;
  activeLabel?: string;
  held: boolean;
  onHoldChange: (isHeld: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={held ? "ui-hold ui-hold--active" : "ui-hold"}
      aria-pressed={held}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onHoldChange(true);
      }}
      onPointerUp={() => onHoldChange(false)}
      onPointerCancel={() => onHoldChange(false)}
      onLostPointerCapture={() => onHoldChange(false)}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          onHoldChange(true);
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onHoldChange(false);
        }
      }}
      onBlur={() => onHoldChange(false)}
    >
      <span className="ui-hold-dot" aria-hidden="true" />
      <span>{held && activeLabel ? activeLabel : label}</span>
    </button>
  );
}

/** Minimal inline slider for continuous parameters. */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  displayValue,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  displayValue?: string;
  onChange: (next: number) => void;
}) {
  return (
    <label className="ui-slider">
      <span className="ui-slider-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {displayValue ? <span className="ui-slider-val">{displayValue}</span> : null}
    </label>
  );
}
