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

/** Inline underlined concept highlight matching the scene ink below. */
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

/** Tactile button; pass iconOnly + label for clean icon-only media controls. */
export function ActionBtn({
  children,
  onClick,
  accent = false,
  iconOnly = false,
  label,
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  accent?: boolean;
  iconOnly?: boolean;
  label?: string;
  disabled?: boolean;
}) {
  const cls = [
    "eng-btn",
    accent ? "eng-btn--accent" : "",
    iconOnly ? "eng-btn--icon" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={cls}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

/** Minimal clickable dot indicator for multi-step scenes. */
export function StepDots({
  count,
  active,
  onSelect,
  labels,
}: {
  count: number;
  active: number;
  onSelect: (index: number) => void;
  labels?: readonly string[];
}) {
  return (
    <div className="eng-dots" role="tablist" aria-label="Steps">
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          className="eng-dot"
          aria-current={i === active ? "step" : undefined}
          aria-label={labels?.[i] ?? `Step ${i + 1}`}
          onClick={() => onSelect(i)}
        />
      ))}
    </div>
  );
}
