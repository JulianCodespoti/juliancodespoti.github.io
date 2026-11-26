import { useEffect, useRef, useState, type ReactNode } from "react";

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

/** Quiet borderless editorial prompt encouraging the reader to poke at an edge case. */
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

/** Quiet segmented pill toggle with a smooth sliding physical thumb. */
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
  const groupRef = useRef<HTMLDivElement | null>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [thumb, setThumb] = useState<{ left: number; width: number; singleRow: boolean } | null>(null);

  useEffect(() => {
    const measure = () => {
      const group = groupRef.current;
      const idx = options.findIndex((o) => o.value === value);
      const activeBtn = btnRefs.current[idx];
      if (!group || !activeBtn) return;

      // Detect if buttons wrapped onto multiple lines on narrow screens
      const tops = btnRefs.current.filter(Boolean).map((el) => el!.offsetTop);
      const singleRow = tops.length <= 1 || Math.max(...tops) - Math.min(...tops) < 4;

      setThumb({
        left: activeBtn.offsetLeft,
        width: activeBtn.offsetWidth,
        singleRow,
      });
    };

    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (ro && groupRef.current) ro.observe(groupRef.current);
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(measure);
    }
    return () => ro?.disconnect();
  }, [value, options]);

  const showThumb = Boolean(thumb && thumb.singleRow && thumb.width > 0);

  return (
    <div
      ref={groupRef}
      className={showThumb ? "ui-toggle" : "ui-toggle ui-toggle--fallback"}
      role="group"
      aria-label={label}
    >
      {showThumb && thumb ? (
        <span
          className="ui-toggle-thumb"
          aria-hidden="true"
          style={{
            width: `${thumb.width}px`,
            transform: `translateX(${thumb.left}px)`,
          }}
        />
      ) : null}
      {options.map((opt, idx) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              btnRefs.current[idx] = el;
            }}
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

/** Quiet inline pill button for direct actions, presets, or binary status levers. */
export function ChipButton({
  children,
  onClick,
  active = false,
  accent = false,
  status,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  accent?: boolean;
  status?: "good" | "bad" | "neutral";
  label?: string;
}) {
  const cls = [
    "ui-btn",
    active ? "ui-btn--active" : "",
    accent ? "ui-btn--accent" : "",
    status === "good" ? "ui-btn--good" : status === "bad" ? "ui-btn--bad" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={cls}
      onClick={onClick}
      aria-pressed={active || status !== undefined ? active : undefined}
      aria-label={label}
    >
      {status ? <span className={`ui-status-dot ui-status-dot--${status}`} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

/** Press-and-hold tactile dead-man switch for simulating transient states (tunnel, packet drop). */
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
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {}
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

/** Precision tactile inline slider with filled rail and zero text selection while scrubbing. */
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
  const span = Math.max(1e-9, max - min);
  const pct = Math.max(0, Math.min(100, ((value - min) / span) * 100));

  return (
    <label className="ui-slider">
      <span className="ui-slider-label">{label}</span>
      <span className="ui-slider-track-wrap">
        <span className="ui-slider-rail" aria-hidden="true">
          <span className="ui-slider-fill" style={{ width: `${pct.toFixed(2)}%` }} />
        </span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </span>
      {displayValue ? <span className="ui-slider-val">{displayValue}</span> : null}
    </label>
  );
}
