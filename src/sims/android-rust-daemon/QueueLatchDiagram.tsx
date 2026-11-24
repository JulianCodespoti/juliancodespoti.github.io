import { useState } from "react";
import { Diagram, ModeSwitch, TimelineSlider } from "../../kit";

const SLOTS = 8;

interface QueueState {
  filled: number;
  resyncSlot: boolean;
  latched: boolean;
  overflows: number;
  parsedChunks: number;
  note: string;
}

function computeState(step: number, mode: "clear" | "latch"): QueueState {
  if (step === 0) {
    return {
      filled: 0,
      resyncSlot: false,
      latched: false,
      overflows: 0,
      parsedChunks: 0,
      note: "Phone is offline. Drag right to send a burst of log chunks.",
    };
  }

  let filled = 0;
  let resyncSlot = false;
  let latched = false;
  let overflows = 0;
  let parsedChunks = 0;

  for (let t = 1; t <= step; t++) {
    if (latched) continue;
    parsedChunks += 2;
    filled += 2;
    if (filled >= SLOTS) {
      overflows += 1;
      filled = 0;
      resyncSlot = true;
      if (mode === "latch") latched = true;
    } else {
      resyncSlot = false;
    }
  }

  const note =
    mode === "clear"
      ? overflows === 0
        ? `Queue filling (${filled}/${SLOTS} slots).`
        : `Overflow #${overflows}: queue cleared to 1 tiny resync frame, so the watcher resumed immediately.`
      : latched
        ? `Overflow #1: stall latch shut. Watcher stopped parsing (${parsedChunks} chunks parsed, 0 extra RAM).`
        : `Queue filling (${filled}/${SLOTS} slots).`;

  return { filled, resyncSlot, latched, overflows, parsedChunks, note };
}

export function QueueLatchDiagram() {
  const [mode, setMode] = useState<"clear" | "latch">("clear");
  const [step, setStep] = useState(4);

  const s = computeState(step, mode);

  return (
    <Diagram
      top={
        <>
          <span>
            overflows: <strong style={{ color: s.overflows > 1 ? "var(--red)" : "var(--fg)" }}>{s.overflows}</strong>
            {" · "}
            chunks parsed: <strong style={{ color: "var(--fg)" }}>{s.parsedChunks}</strong>
          </span>
          <ModeSwitch
            label="Overflow handling"
            value={mode}
            onChange={(m) => setMode(m)}
            options={[
              { value: "clear", label: "Clear only (bug)" },
              { value: "latch", label: "Stall latch (fix)" },
            ]}
          />
        </>
      }
      footer={<TimelineSlider step={step} maxStep={9} onChange={setStep} label="Log burst timeline" />}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
        {/* Gate indicator */}
        <div
          style={{
            padding: "0.45rem 0.65rem",
            borderRadius: "6px",
            border: `1.5px solid ${s.latched ? "var(--green)" : "var(--line-strong)"}`,
            background: s.latched ? "var(--green-soft)" : "var(--well-alt)",
            fontFamily: "var(--font-mono)",
            fontSize: "0.72rem",
            color: s.latched ? "var(--green)" : "var(--fg-muted)",
            whiteSpace: "nowrap",
          }}
        >
          {s.latched ? "GATE CLOSED" : "GATE OPEN"}
        </div>

        {/* 8 simple queue squares */}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${SLOTS}, 1fr)`, gap: "6px", flex: 1 }}>
          {Array.from({ length: SLOTS }, (_, i) => {
            const isResync = i === 0 && s.resyncSlot;
            const isFilled = !isResync && i < s.filled;
            const bg = isResync
              ? mode === "clear"
                ? "var(--red)"
                : "var(--green)"
              : isFilled
                ? "var(--amber)"
                : "var(--well-alt)";
            return (
              <div
                key={i}
                style={{
                  height: "32px",
                  borderRadius: "5px",
                  background: bg,
                  border: `1px solid ${isFilled || isResync ? "transparent" : "var(--line)"}`,
                  transition: "background 160ms ease",
                }}
              />
            );
          })}
        </div>
      </div>

      <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--fg-muted)" }}>
        {s.note}
      </div>
    </Diagram>
  );
}
