import { AnimatePresence, motion } from "motion/react";
import { Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ActionBtn, Choice, PhaseStrip, Scene, SPRING_SNAPPY } from "../../engine";

type Mode = "naive" | "guarded";

export function SingleWriterScene() {
  const [mode, setMode] = useState<Mode>("naive");
  const [phase, setPhase] = useState(0); // 0 = initial, 1 = phone sends #3, 2 = laptop writes #4
  const timersRef = useRef<number[]>([]);

  const clearTimers = () => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
  };

  useEffect(() => clearTimers, []);

  const playSequence = () => {
    clearTimers();
    setPhase(0);
    timersRef.current.push(window.setTimeout(() => setPhase(1), 450));
    timersRef.current.push(window.setTimeout(() => setPhase(2), 1350));
  };

  const laptopTurns =
    mode === "naive"
      ? phase < 2
        ? [1, 2]
        : [1, 2, 4]
      : phase === 0
        ? [1, 2]
        : phase === 1
          ? [1, 2, 3]
          : [1, 2, 3, 4];

  const diskTurns =
    mode === "naive"
      ? phase === 0
        ? [1, 2]
        : phase === 1
          ? [1, 2, 3]
          : [1, 2, 4]
      : laptopTurns;

  const clobbered = mode === "naive" && phase === 2;

  const caption =
    phase === 0
      ? "Laptop holds turns 1 and 2 in RAM and on disk."
      : phase === 1
        ? mode === "naive"
          ? "Phone appends turn 3 directly to disk. Laptop RAM never sees it."
          : "Guard sees laptop owns the file and forwards turn 3 into Laptop RAM first."
        : mode === "naive"
          ? "Laptop rewrites session.jsonl from RAM. Turn 3 is overwritten and lost."
          : "Laptop flushes turns 1, 2, 3, and 4 cleanly as the sole writer.";

  return (
    <Scene
      title={
        <PhaseStrip
          phases={["1. Start", "2. Phone sends #3", "3. Laptop writes #4"]}
          active={phase}
          onSelect={setPhase}
        />
      }
      controls={
        <>
          <Choice
            label="Ownership guard"
            value={mode}
            onChange={(m) => {
              clearTimers();
              setMode(m);
              setPhase(0);
            }}
            options={[
              { value: "naive", label: "Two writers" },
              { value: "guarded", label: "Single writer" },
            ]}
          />
          <ActionBtn accent onClick={playSequence}>
            <Play size={12} />
            Play
          </ActionBtn>
          <ActionBtn onClick={() => setPhase(0)}>
            <RotateCcw size={12} />
          </ActionBtn>
        </>
      }
      footer={
        <span style={{ color: clobbered ? "var(--crimson)" : "var(--fg-muted)" }}>{caption}</span>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.75rem", marginBottom: "0.75rem" }}>
        {/* Laptop RAM */}
        <div style={{ padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--line)", background: "var(--bg)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--fg-muted)", marginBottom: "0.5rem" }}>
            Laptop RAM (owner)
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", minHeight: "30px" }}>
            <AnimatePresence>
              {laptopTurns.map((n) => (
                <motion.span
                  key={n}
                  layout
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.7, opacity: 0 }}
                  transition={SPRING_SNAPPY}
                  style={{
                    padding: "0.25rem 0.55rem",
                    borderRadius: "5px",
                    border: `1px solid ${n === 3 ? "var(--teal)" : "var(--copper-line)"}`,
                    background: n === 3 ? "var(--teal-bg)" : "var(--copper-bg)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.74rem",
                    color: "var(--fg)",
                  }}
                >
                  #{n}
                </motion.span>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Phone */}
        <div style={{ padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--line)", background: "var(--bg)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--fg-muted)", marginBottom: "0.5rem" }}>
            Phone
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minHeight: "30px", fontFamily: "var(--font-mono)", fontSize: "0.73rem" }}>
            {phase === 0 ? (
              <span style={{ color: "var(--fg-dim)" }}>ready to send #3</span>
            ) : (
              <span style={{ color: "var(--teal)" }}>
                {mode === "naive" ? "wrote #3 directly to disk" : "routed #3 via laptop bridge"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Shared JSONL file on disk */}
      <div
        style={{
          padding: "0.8rem",
          borderRadius: "8px",
          border: `1.5px solid ${clobbered ? "var(--crimson)" : "var(--line-strong)"}`,
          background: clobbered ? "var(--crimson-bg)" : "var(--bg)",
          transition: "border-color 180ms ease, background 180ms ease",
        }}
      >
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: clobbered ? "var(--crimson)" : "var(--fg-muted)", marginBottom: "0.5rem" }}>
          session.jsonl on disk
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", minHeight: "30px" }}>
          <AnimatePresence>
            {diskTurns.map((n) => (
              <motion.span
                key={`disk-${n}`}
                layout
                initial={{ y: -14, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 18, opacity: 0, scale: 0.85 }}
                transition={SPRING_SNAPPY}
                style={{
                  padding: "0.25rem 0.6rem",
                  borderRadius: "5px",
                  border: `1px solid ${n === 3 ? "var(--teal)" : "var(--copper-line)"}`,
                  background: n === 3 ? "var(--teal-bg)" : "var(--copper-bg)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.74rem",
                  color: "var(--fg)",
                }}
              >
                turn #{n}
              </motion.span>
            ))}
            {clobbered && (
              <motion.span
                key="lost-3"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={SPRING_SNAPPY}
                style={{
                  padding: "0.25rem 0.6rem",
                  borderRadius: "5px",
                  border: "1px dashed var(--crimson)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.74rem",
                  color: "var(--crimson)",
                  textDecoration: "line-through",
                }}
              >
                turn #3 lost
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>
    </Scene>
  );
}
