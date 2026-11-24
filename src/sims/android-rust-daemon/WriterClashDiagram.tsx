import { useState } from "react";
import { Diagram, ModeSwitch, TimelineSlider } from "../../kit";

const LABELS_NAIVE = [
  "Start: laptop and disk both hold turns 1 and 2.",
  "Phone writes turn 3 directly to disk. Laptop RAM does not see it.",
  "Laptop finishes turn 4 and rewrites the whole file from RAM. Turn 3 is gone.",
];

const LABELS_SAFE = [
  "Start: laptop and disk both hold turns 1 and 2.",
  "Daemon sees laptop owns the file, so it sends turn 3 through the laptop bridge.",
  "Laptop finishes turn 4 and writes turns 1, 2, 3, and 4 cleanly.",
];

function TurnBlock({ num, tone, lost = false }: { num: number; tone: "amber" | "blue" | "red"; lost?: boolean }) {
  const color = tone === "amber" ? "var(--amber)" : tone === "blue" ? "var(--blue)" : "var(--red)";
  const bg = tone === "amber" ? "var(--amber-soft)" : tone === "blue" ? "var(--blue-soft)" : "var(--red-soft)";
  return (
    <div
      style={{
        padding: "0.35rem 0.55rem",
        borderRadius: "5px",
        border: `1px ${lost ? "dashed" : "solid"} ${color}`,
        background: bg,
        fontFamily: "var(--font-mono)",
        fontSize: "0.75rem",
        color: lost ? "var(--red)" : "var(--fg)",
        textDecoration: lost ? "line-through" : "none",
      }}
    >
      turn {num} {lost ? "(overwritten)" : ""}
    </div>
  );
}

export function WriterClashDiagram() {
  const [mode, setMode] = useState<"naive" | "safe">("naive");
  const [step, setStep] = useState(2);

  const laptopTurns =
    mode === "naive"
      ? step < 2
        ? [1, 2]
        : [1, 2, 4]
      : step === 0
        ? [1, 2]
        : step === 1
          ? [1, 2, 3]
          : [1, 2, 3, 4];

  const diskTurns =
    mode === "naive"
      ? step === 0
        ? [1, 2]
        : step === 1
          ? [1, 2, 3]
          : [1, 2, 4]
      : laptopTurns;

  const lostTurn3 = mode === "naive" && step === 2;

  return (
    <Diagram
      top={
        <>
          <span>{mode === "naive" ? LABELS_NAIVE[step] : LABELS_SAFE[step]}</span>
          <ModeSwitch
            label="Write path"
            value={mode}
            onChange={setMode}
            options={[
              { value: "naive", label: "Two writers" },
              { value: "safe", label: "Single writer" },
            ]}
          />
        </>
      }
      footer={<TimelineSlider step={step} maxStep={2} onChange={setStep} label="Write sequence" />}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.85rem" }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.74rem", color: "var(--fg-muted)", marginBottom: "0.45rem" }}>
            Laptop RAM
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {laptopTurns.map((n) => (
              <TurnBlock key={n} num={n} tone={n === 3 ? "blue" : "amber"} />
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.74rem", color: "var(--fg-muted)", marginBottom: "0.45rem" }}>
            session.jsonl on disk
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {diskTurns.map((n) => (
              <TurnBlock key={n} num={n} tone={n === 3 ? "blue" : "amber"} />
            ))}
            {lostTurn3 ? <TurnBlock num={3} tone="red" lost /> : null}
          </div>
        </div>
      </div>
    </Diagram>
  );
}
