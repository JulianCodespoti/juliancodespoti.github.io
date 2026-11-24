import { motion } from "motion/react";
import { useId, type ReactNode } from "react";
import { SPRING_SNAPPY } from "./springs";

export type InkTone = "copper" | "teal" | "sage" | "crimson";

const TONE_COLOR: Record<InkTone, string> = {
  copper: "var(--copper)",
  teal: "var(--teal)",
  sage: "var(--sage)",
  crimson: "var(--crimson)",
};

/** Inline underlined concept highlight matching the diagram ink below. */
export function Term({ tone, children }: { tone: InkTone; children: ReactNode }) {
  return (
    <span className="ink-term" style={{ color: TONE_COLOR[tone] }}>
      {children}
    </span>
  );
}

/** Spring-animated segmented choice control. */
export function Choice<T extends string>({
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
  const id = useId();
  return (
    <div className="eng-choice" role="group" aria-label={label}>
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            className="eng-choice-btn"
            aria-pressed={selected}
            onClick={() => onChange(opt.value)}
          >
            {selected && <motion.span layoutId={`choice-${id}`} className="eng-choice-pill" transition={SPRING_SNAPPY} />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function ActionBtn({
  children,
  onClick,
  accent = false,
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  accent?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={accent ? "eng-btn eng-btn--accent" : "eng-btn"}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function PhaseStrip({
  phases,
  active,
  onSelect,
}: {
  phases: readonly string[];
  active: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="eng-phases" role="tablist">
      {phases.map((label, i) => (
        <button
          key={label}
          type="button"
          className="eng-phase-btn"
          aria-current={i === active ? "step" : undefined}
          onClick={() => onSelect(i)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
