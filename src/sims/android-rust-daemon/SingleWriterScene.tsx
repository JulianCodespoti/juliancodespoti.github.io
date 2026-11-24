import { AnimatePresence, motion } from "motion/react";
import { RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ActionBtn, Choice, Scene, SPRING_SNAPPY, StepDots } from "../../engine";

type Mode = "naive" | "guarded";

export function SingleWriterScene() {
  const [mode, setMode] = useState<Mode>("naive");
  const [step, setStep] = useState(2); // Start on final state so outcome is immediately visible; switching replays
  const timersRef = useRef<number[]>([]);

  const clearTimers = () => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
  };

  useEffect(() => clearTimers, []);

  const replay = () => {
    clearTimers();
    setStep(0);
    timersRef.current.push(window.setTimeout(() => setStep(1), 480));
    timersRef.current.push(window.setTimeout(() => setStep(2), 1350));
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    clearTimers();
    setStep(0);
    timersRef.current.push(window.setTimeout(() => setStep(1), 420));
    timersRef.current.push(window.setTimeout(() => setStep(2), 1250));
  };

  const laptopMsgs =
    mode === "naive"
      ? step < 2
        ? [1, 2]
        : [1, 2, 4]
      : step === 0
        ? [1, 2]
        : step === 1
          ? [1, 2, 3]
          : [1, 2, 3, 4];

  const savedMsgs =
    mode === "naive"
      ? step === 0
        ? [1, 2]
        : step === 1
          ? [1, 2, 3]
          : [1, 2, 4]
      : laptopMsgs;

  const clobbered = mode === "naive" && step === 2;

  const caption =
    step === 0
      ? "Both start with messages 1 and 2."
      : step === 1
        ? mode === "naive"
          ? "Phone writes message 3 directly to disk without telling Laptop."
          : "Phone sends message 3 through Laptop first."
        : mode === "naive"
          ? "Laptop saves from memory and overwrites message 3."
          : "Laptop saves all 4 messages cleanly.";

  return (
    <Scene
      title={
        <span style={{ color: clobbered ? "var(--crimson)" : step === 2 ? "var(--sage)" : "var(--fg-muted)", fontWeight: 600 }}>
          {clobbered ? "Message 3 overwritten" : step === 2 ? "All messages kept" : "Syncing devices"}
        </span>
      }
      controls={
        <>
          <Choice
            label="Write strategy"
            value={mode}
            onChange={switchMode}
            options={[
              { value: "naive", label: "Two writers" },
              { value: "guarded", label: "Single writer" },
            ]}
          />
          <ActionBtn iconOnly accent label="Replay sequence" onClick={replay}>
            <RotateCcw size={14} />
          </ActionBtn>
        </>
      }
      footer={
        <>
          <span style={{ color: clobbered ? "var(--crimson)" : "var(--fg-muted)" }}>{caption}</span>
          <StepDots
            count={3}
            active={step}
            onSelect={(i) => {
              clearTimers();
              setStep(i);
            }}
            labels={["Start", "Phone sends", "Laptop saves"]}
          />
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.75rem", marginBottom: "0.75rem" }}>
        {/* Laptop */}
        <div style={{ padding: "0.8rem 0.9rem", borderRadius: "9px", border: "1px solid var(--line)", background: "var(--bg)" }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--fg-muted)", marginBottom: "0.55rem" }}>
            Laptop
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", minHeight: "30px" }}>
            <AnimatePresence>
              {laptopMsgs.map((n) => (
                <motion.span
                  key={n}
                  layout
                  initial={{ scale: 0.75, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.75, opacity: 0 }}
                  transition={SPRING_SNAPPY}
                  style={{
                    padding: "0.22rem 0.6rem",
                    borderRadius: "6px",
                    border: `1px solid ${n === 3 ? "var(--teal)" : "var(--copper-line)"}`,
                    background: n === 3 ? "var(--teal-bg)" : "var(--copper-bg)",
                    fontSize: "0.8rem",
                    fontWeight: 500,
                    color: "var(--fg)",
                  }}
                >
                  Msg {n}
                </motion.span>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Phone */}
        <div style={{ padding: "0.8rem 0.9rem", borderRadius: "9px", border: "1px solid var(--line)", background: "var(--bg)" }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--fg-muted)", marginBottom: "0.55rem" }}>
            Phone
          </div>
          <div style={{ display: "flex", alignItems: "center", minHeight: "30px", fontSize: "0.82rem" }}>
            {step === 0 ? (
              <span style={{ color: "var(--fg-dim)" }}>Ready to send Msg 3</span>
            ) : (
              <span style={{ color: "var(--teal)", fontWeight: 500 }}>
                {mode === "naive" ? "Wrote Msg 3 to disk" : "Sent Msg 3 via Laptop"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Saved chat file */}
      <div
        style={{
          padding: "0.85rem 0.9rem",
          borderRadius: "9px",
          border: `1.5px solid ${clobbered ? "var(--crimson)" : "var(--line-strong)"}`,
          background: clobbered ? "var(--crimson-bg)" : "var(--bg)",
          transition: "border-color 180ms ease, background 180ms ease",
        }}
      >
        <div style={{ fontSize: "0.8rem", fontWeight: 600, color: clobbered ? "var(--crimson)" : "var(--fg-muted)", marginBottom: "0.55rem" }}>
          Saved chat
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", minHeight: "30px" }}>
          <AnimatePresence>
            {savedMsgs.map((n) => (
              <motion.span
                key={`saved-${n}`}
                layout
                initial={{ y: -12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 14, opacity: 0, scale: 0.85 }}
                transition={SPRING_SNAPPY}
                style={{
                  padding: "0.24rem 0.65rem",
                  borderRadius: "6px",
                  border: `1px solid ${n === 3 ? "var(--teal)" : "var(--copper-line)"}`,
                  background: n === 3 ? "var(--teal-bg)" : "var(--copper-bg)",
                  fontSize: "0.8rem",
                  fontWeight: 500,
                  color: "var(--fg)",
                }}
              >
                Msg {n}
              </motion.span>
            ))}
            {clobbered && (
              <motion.span
                key="lost-3"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={SPRING_SNAPPY}
                style={{
                  padding: "0.24rem 0.65rem",
                  borderRadius: "6px",
                  border: "1px dashed var(--crimson)",
                  fontSize: "0.8rem",
                  fontWeight: 500,
                  color: "var(--crimson)",
                  textDecoration: "line-through",
                }}
              >
                Msg 3 lost
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>
    </Scene>
  );
}
