import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useEffect } from "react";

export interface ScrubberStep {
  id: string;
  label: string;
  summary?: string;
}

export function Scrubber({
  steps,
  activeIndex,
  onSelect,
  playing = false,
  onTogglePlay,
  intervalMs = 2400,
}: {
  steps: readonly ScrubberStep[];
  activeIndex: number;
  onSelect: (index: number) => void;
  playing?: boolean;
  onTogglePlay?: () => void;
  intervalMs?: number;
}) {
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      onSelect((activeIndex + 1) % steps.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [playing, activeIndex, steps.length, intervalMs, onSelect]);

  return (
    <div className="kit-scrubber">
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        {onTogglePlay ? (
          <button
            type="button"
            className="kit-btn kit-btn--primary"
            onClick={onTogglePlay}
            aria-label={playing ? "Pause walkthrough" : "Play walkthrough"}
          >
            {playing ? <Pause size={13} /> : <Play size={13} />}
            {playing ? "Pause" : "Auto-step"}
          </button>
        ) : null}
        <button
          type="button"
          className="kit-btn"
          onClick={() => onSelect(Math.max(0, activeIndex - 1))}
          disabled={activeIndex === 0}
          aria-label="Previous step"
        >
          <ChevronLeft size={14} />
          Prev
        </button>
        <button
          type="button"
          className="kit-btn"
          onClick={() => onSelect(Math.min(steps.length - 1, activeIndex + 1))}
          disabled={activeIndex === steps.length - 1}
          aria-label="Next step"
        >
          Next
          <ChevronRight size={14} />
        </button>
        <span
          style={{
            marginLeft: "auto",
            fontFamily: "var(--font-mono)",
            fontSize: "0.74rem",
            color: "var(--fg-muted)",
          }}
        >
          Step {activeIndex + 1} / {steps.length}
        </span>
      </div>
      <div className="kit-scrubber-steps" role="tablist" aria-label="Walkthrough steps">
        {steps.map((step, i) => (
          <button
            key={step.id}
            type="button"
            className="kit-step-btn"
            aria-current={i === activeIndex ? "step" : undefined}
            onClick={() => onSelect(i)}
          >
            <span className="kit-step-num">0{i + 1}</span>
            {step.label}
          </button>
        ))}
      </div>
    </div>
  );
}
