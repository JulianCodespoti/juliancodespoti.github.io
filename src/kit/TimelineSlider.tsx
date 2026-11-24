import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";

export function TimelineSlider({
  step,
  maxStep,
  onChange,
  label = "Step through timeline",
}: {
  step: number;
  maxStep: number;
  onChange: (next: number) => void;
  label?: string;
}) {
  return (
    <>
      <button
        type="button"
        className="step-icon-btn"
        onClick={() => onChange(0)}
        disabled={step === 0}
        aria-label="Reset"
        title="Reset"
      >
        <RotateCcw size={14} />
      </button>
      <button
        type="button"
        className="step-icon-btn"
        onClick={() => onChange(Math.max(0, step - 1))}
        disabled={step === 0}
        aria-label="Previous step"
        title="Previous"
      >
        <ArrowLeft size={14} />
      </button>
      <div className="step-track-wrap">
        <div className="step-ticks" aria-hidden="true">
          {Array.from({ length: maxStep + 1 }, (_, i) => (
            <span key={i} />
          ))}
        </div>
        <input
          type="range"
          className="step-range"
          min={0}
          max={maxStep}
          step={1}
          value={step}
          aria-label={label}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
      <button
        type="button"
        className="step-icon-btn"
        onClick={() => onChange(Math.min(maxStep, step + 1))}
        disabled={step === maxStep}
        aria-label="Next step"
        title="Next"
      >
        <ArrowRight size={14} />
      </button>
    </>
  );
}
