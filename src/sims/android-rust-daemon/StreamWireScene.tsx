import { motion } from "motion/react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { ActionBtn, Scene, SPRING_GENTLE, useSceneActive } from "../../engine";

const TOKENS = ["All ", "9 ", "Vitest ", "cases ", "pass ", "on ", "arm64."];

export function StreamWireScene() {
  const [running, setRunning] = useState(true);
  const { ref, active } = useSceneActive(running);
  const [tick, setTick] = useState(1);

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      setTick((t) => (t >= TOKENS.length ? 1 : t + 1));
    }, 950);
    return () => window.clearInterval(id);
  }, [active]);

  const text = TOKENS.slice(0, tick).join("");
  let snapUnits = 0;
  for (let i = 1; i <= tick; i++) snapUnits += i;
  const deltaUnits = tick;

  const snapKb = Math.round((snapUnits / 28) * 244);
  const deltaKb = Math.round((deltaUnits / 7) * 25);
  const snapPacketW = 24 + tick * 24;

  return (
    <Scene
      sceneRef={ref}
      title={<span>Streaming: <strong style={{ color: "var(--fg)" }}>"{text}"</strong></span>}
      controls={
        <>
          <ActionBtn accent onClick={() => setRunning((r) => !r)}>
            {running ? <Pause size={12} /> : <Play size={12} />}
            {running ? "Pause" : "Play"}
          </ActionBtn>
          <ActionBtn onClick={() => setTick(1)}>
            <RotateCcw size={12} />
            Restart
          </ActionBtn>
        </>
      }
      footer={
        <>
          <span>Full snapshots: <strong style={{ color: "var(--copper)" }}>{snapKb} KB</strong></span>
          <span>Prefix deltas: <strong style={{ color: "var(--sage)" }}>{deltaKb} KB</strong></span>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1.15rem" }}>
        {/* Lane 1: Full snapshot wire where packet grows wider every tick */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: "0.73rem", marginBottom: "0.3rem" }}>
            <span style={{ color: "var(--copper)", fontWeight: 600 }}>Full snapshots (resends entire reply)</span>
            <span style={{ color: "var(--fg-dim)" }}>frame #{tick} · {tick}x size</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "62px minmax(0, 1fr) 54px", alignItems: "center", gap: "0.6rem" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--fg-muted)" }}>Daemon</span>
            <svg viewBox="0 0 460 28" style={{ width: "100%", height: "28px", display: "block", overflow: "hidden" }} aria-hidden="true">
              <line x1="0" y1="14" x2="460" y2="14" stroke="var(--line)" strokeWidth="2" />
              <motion.rect
                key={`snap-${tick}`}
                y={6}
                height={16}
                rx={4}
                width={snapPacketW}
                fill="var(--copper)"
                initial={{ x: 0, opacity: 0.25 }}
                animate={{ x: 460 - snapPacketW, opacity: [0.35, 1, 1, 0.25] }}
                transition={{ duration: 0.84, ease: "easeInOut" }}
              />
            </svg>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--fg-muted)", textAlign: "right" }}>Phone</span>
          </div>
          <div style={{ height: "5px", marginTop: "0.25rem", borderRadius: "999px", background: "var(--bg)", overflow: "hidden" }}>
            <motion.div
              animate={{ width: `${Math.max(4, (snapKb / 244) * 100)}%` }}
              transition={SPRING_GENTLE}
              style={{ height: "100%", background: "var(--copper)", borderRadius: "999px" }}
            />
          </div>
        </div>

        {/* Lane 2: Prefix delta wire with constant sliver every tick */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: "0.73rem", marginBottom: "0.3rem" }}>
            <span style={{ color: "var(--sage)", fontWeight: 600 }}>Prefix deltas (sends only new suffix)</span>
            <span style={{ color: "var(--fg-dim)" }}>frame #{tick} · constant</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "62px minmax(0, 1fr) 54px", alignItems: "center", gap: "0.6rem" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--fg-muted)" }}>Daemon</span>
            <svg viewBox="0 0 460 28" style={{ width: "100%", height: "28px", display: "block", overflow: "hidden" }} aria-hidden="true">
              <line x1="0" y1="14" x2="460" y2="14" stroke="var(--line)" strokeWidth="2" />
              <motion.rect
                key={`delta-${tick}`}
                y={7}
                height={14}
                rx={4}
                width={22}
                fill="var(--sage)"
                initial={{ x: 0, opacity: 0.25 }}
                animate={{ x: 438, opacity: [0.4, 1, 1, 0.25] }}
                transition={{ duration: 0.72, ease: "easeInOut" }}
              />
            </svg>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--fg-muted)", textAlign: "right" }}>Phone</span>
          </div>
          <div style={{ height: "5px", marginTop: "0.25rem", borderRadius: "999px", background: "var(--bg)", overflow: "hidden" }}>
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
