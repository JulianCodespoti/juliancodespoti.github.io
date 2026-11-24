import { useState } from "react";
import { Diagram, TimelineSlider } from "../../kit";

const WORDS = ["All ", "9 ", "Vitest ", "cases ", "pass ", "now."];

export function DeltaStripDiagram() {
  const [step, setStep] = useState(3);

  const visibleWords = WORDS.slice(0, step);
  const fullChunks = Array.from({ length: step }, (_, i) => i + 1); // 1 + 2 + ... + step
  const fullTotal = fullChunks.reduce((a, b) => a + b, 0);
  const deltaTotal = step;

  const textSoFar = visibleWords.join("") || "(waiting for first token)";

  return (
    <Diagram
      top={
        <>
          <span style={{ color: "var(--fg)" }}>{textSoFar}</span>
          <span>step {step} / {WORDS.length}</span>
        </>
      }
      footer={<TimelineSlider step={step} maxStep={WORDS.length} onChange={setStep} label="Streaming chunks" />}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {/* Full snapshots */}
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontFamily: "var(--font-mono)",
              fontSize: "0.75rem",
              marginBottom: "0.4rem",
            }}
          >
            <span style={{ color: "var(--amber)" }}>Full snapshots</span>
            <span style={{ color: "var(--fg-muted)" }}>{fullTotal} blocks sent</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", minHeight: "22px" }}>
            {fullTotal === 0 ? (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.74rem", color: "var(--fg-dim)" }}>
                drag the slider right
              </span>
            ) : (
              fullChunks.map((count, groupIdx) => (
                <div
                  key={groupIdx}
                  style={{
                    display: "inline-flex",
                    gap: "2px",
                    padding: "2px",
                    borderRadius: "4px",
                    border: "1px solid var(--line)",
                    background: "var(--well-alt)",
                  }}
                >
                  {Array.from({ length: count }, (_, j) => (
                    <span
                      key={j}
                      style={{
                        width: "12px",
                        height: "14px",
                        borderRadius: "2px",
                        background: "var(--amber)",
                        display: "block",
                      }}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Prefix deltas */}
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontFamily: "var(--font-mono)",
              fontSize: "0.75rem",
              marginBottom: "0.4rem",
            }}
          >
            <span style={{ color: "var(--green)" }}>Prefix deltas</span>
            <span style={{ color: "var(--fg-muted)" }}>{deltaTotal} blocks sent</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", minHeight: "22px" }}>
            {Array.from({ length: deltaTotal }, (_, i) => (
              <span
                key={i}
                style={{
                  width: "16px",
                  height: "18px",
                  borderRadius: "3px",
                  background: "var(--green)",
                  display: "block",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </Diagram>
  );
}
