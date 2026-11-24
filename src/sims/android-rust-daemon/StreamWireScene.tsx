import { motion } from "motion/react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { ActionBtn, Scene, SPRING_GENTLE, useSceneActive } from "../../engine";

const WORDS = ["All ", "9 ", "tests ", "pass ", "on ", "arm64."];

export function StreamWireScene() {
  const [running, setRunning] = useState(true);
  const { ref, active } = useSceneActive(running);
  const [step, setStep] = useState(1);

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      setStep((s) => (s >= WORDS.length ? 1 : s + 1));
    }, 950);
    return () => window.clearInterval(id);
  }, [active]);

  const text = WORDS.slice(0, step).join("");
  let snapUnits = 0;
  for (let i = 1; i <= step; i++) snapUnits += i;

  const snapKb = Math.round((snapUnits / 21) * 244);
  const deltaKb = Math.round((step / WORDS.length) * 25);
  const snapW = 28 + step * 26;

  return (
    <Scene
      sceneRef={ref}
      title={
        <span>
          Reply: <strong style={{ color: "var(--fg)", fontWeight: 600 }}>"{text}"</strong>
        </span>
      }
      controls={
        <>
          <ActionBtn
            iconOnly
            accent
            label={running ? "Pause animation" : "Play animation"}
            onClick={() => setRunning((r) => !r)}
          >
            {running ? <Pause size={14} /> : <Play size={14} />}
          </ActionBtn>
          <ActionBtn iconOnly label="Restart animation" onClick={() => setStep(1)}>
            <RotateCcw size={14} />
          </ActionBtn>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        {/* Full resends */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.35rem" }}>
            <span style={{ fontSize: "0.84rem", fontWeight: 600, color: "var(--copper)" }}>Full resends</span>
            <span style={{ fontSize: "0.84rem", fontWeight: 600, color: "var(--fg)", fontVariantNumeric: "tabular-nums" }}>
              {snapKb} KB
            </span>
          </div>
          <svg viewBox="0 0 560 28" style={{ width: "100%", height: "28px", display: "block", overflow: "hidden" }} aria-hidden="true">
            <line x1="6" y1="14" x2="554" y2="14" stroke="var(--line)" strokeWidth="2" />
            <circle cx="6" cy="14" r="3.5" fill="var(--line-strong)" />
            <circle cx="554" cy="14" r="3.5" fill="var(--line-strong)" />
            <motion.rect
              key={`snap-${step}`}
              y={5}
              height={18}
              rx={5}
              width={snapW}
              fill="var(--copper)"
              initial={{ x: 10, opacity: 0.25 }}
              animate={{ x: 550 - snapW, opacity: [0.35, 1, 1, 0.25] }}
              transition={{ duration: 0.84, ease: "easeInOut" }}
            />
          </svg>
          <div style={{ height: "6px", marginTop: "0.3rem", borderRadius: "999px", background: "var(--bg)", overflow: "hidden" }}>
            <motion.div
              animate={{ width: `${Math.max(4, (snapKb / 244) * 100)}%` }}
              transition={SPRING_GENTLE}
              style={{ height: "100%", background: "var(--copper)", borderRadius: "999px" }}
            />
          </div>
        </div>

        {/* Deltas only */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.35rem" }}>
            <span style={{ fontSize: "0.84rem", fontWeight: 600, color: "var(--sage)" }}>Deltas only</span>
            <span style={{ fontSize: "0.84rem", fontWeight: 600, color: "var(--fg)", fontVariantNumeric: "tabular-nums" }}>
              {deltaKb} KB
            </span>
          </div>
          <svg viewBox="0 0 560 28" style={{ width: "100%", height: "28px", display: "block", overflow: "hidden" }} aria-hidden="true">
            <line x1="6" y1="14" x2="554" y2="14" stroke="var(--line)" strokeWidth="2" />
            <circle cx="6" cy="14" r="3.5" fill="var(--line-strong)" />
            <circle cx="554" cy="14" r="3.5" fill="var(--line-strong)" />
            <motion.rect
              key={`delta-${step}`}
              y={7}
              height={14}
              rx={4}
              width={24}
              fill="var(--sage)"
              initial={{ x: 10, opacity: 0.25 }}
              animate={{ x: 526, opacity: [0.4, 1, 1, 0.25] }}
              transition={{ duration: 0.72, ease: "easeInOut" }}
            />
          </svg>
          <div style={{ height: "6px", marginTop: "0.3rem", borderRadius: "999px", background: "var(--bg)", overflow: "hidden" }}>
            <motion.div
              animate={{ width: `${Math.max(2, (deltaKb / 244) * 100)}%` }}
              transition={SPRING_GENTLE}
              style={{ height: "100%", background: "var(--sage)", borderRadius: "999px" }}
            />
          </div>
        </div>
      </div>
    </Scene>
  );
}
