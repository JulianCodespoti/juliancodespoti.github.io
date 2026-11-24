import { motion } from "motion/react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { ActionBtn, Choice, Scene, SPRING_SNAPPY, useSceneActive } from "../../engine";

type Strategy = "clear" | "latch";

export function BackpressureValveScene() {
  const [strategy, setStrategy] = useState<Strategy>("clear");
  const [running, setRunning] = useState(true);
  const { ref, active } = useSceneActive(running);

  const [fill, setFill] = useState(2); // 0..6 capacity
  const [latched, setLatched] = useState(false);
  const [overflows, setOverflows] = useState(0);
  const [rssMb, setRssMb] = useState(14);
  const [pulseKey, setPulseKey] = useState(0);

  const reset = () => {
    setFill(1);
    setLatched(false);
    setOverflows(0);
    setRssMb(14);
    setPulseKey((k) => k + 1);
  };

  useEffect(() => {
    reset();
  }, [strategy]);

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      setPulseKey((k) => k + 1);
      if (latched) return;

      setFill((prev) => {
        const next = prev + 1;
        if (next >= 6) {
          setOverflows((o) => o + 1);
          if (strategy === "latch") {
            setLatched(true);
            return 1; // holds 1 resync order, latch stays shut!
          } else {
            // Clear-only bug: drops to 1 tiny resync, reopens immediately, RSS climbs!
            setRssMb((r) => Math.min(321, r + 38));
            return 1;
          }
        }
        return next;
      });
    }, 520);
    return () => window.clearInterval(id);
  }, [active, latched, strategy]);

  return (
    <Scene
      sceneRef={ref}
      title={
        <span>
          Phone in tunnel (offline) ·{" "}
          <strong style={{ color: latched ? "var(--sage)" : overflows > 1 ? "var(--crimson)" : "var(--fg)" }}>
            {latched ? "Valve latched · watcher parked" : overflows > 1 ? `Oscillating (${overflows}×)` : "Filling queue"}
          </strong>
        </span>
      }
      controls={
        <>
          <Choice
            label="Overflow strategy"
            value={strategy}
            onChange={setStrategy}
            options={[
              { value: "clear", label: "Clear only (bug)" },
              { value: "latch", label: "Stall latch (fix)" },
            ]}
          />
          <ActionBtn onClick={() => setRunning((r) => !r)}>
            {running ? <Pause size={12} /> : <Play size={12} />}
          </ActionBtn>
          <ActionBtn onClick={reset}>
            <RotateCcw size={12} />
          </ActionBtn>
        </>
      }
      footer={
        <>
          <span>Overflows: <strong style={{ color: overflows > 1 ? "var(--crimson)" : "var(--fg)" }}>{overflows}</strong></span>
          <span>Daemon RSS: <strong style={{ color: rssMb > 40 ? "var(--crimson)" : "var(--sage)" }}>{rssMb} MiB</strong></span>
        </>
      }
    >
      <svg viewBox="0 0 640 132" style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Animated backpressure intake valve and buffer tank">
        {/* Intake pipe */}
        <line x1="92" y1="66" x2="215" y2="66" stroke="var(--line-strong)" strokeWidth="3" />
        {/* Output pipe (blocked because phone is offline) */}
        <line x1="445" y1="66" x2="548" y2="66" stroke="var(--crimson-line)" strokeWidth="2.5" strokeDasharray="5 5" />

        {/* Producer box */}
        <rect x="10" y="34" width="84" height="64" rx="8" fill="var(--stage-sub)" stroke="var(--line-strong)" strokeWidth="1.2" />
        <text x="52" y="62" textAnchor="middle" fill="var(--fg)" fontFamily="var(--font-mono)" fontSize="11" fontWeight="600">Watcher</text>
        <text x="52" y="79" textAnchor="middle" fill={latched ? "var(--sage)" : "var(--fg-dim)"} fontFamily="var(--font-mono)" fontSize="9.5">
          {latched ? "parked" : "reading"}
        </text>

        {/* Animated incoming chunk: either flows into tank OR bounces off closed latch */}
        <motion.circle
          key={pulseKey}
          r="6"
          cy="66"
          initial={{ cx: 102, opacity: 0.9 }}
          animate={
            latched
              ? { cx: [102, 162, 138], opacity: [0.9, 0.9, 0] }
              : { cx: [102, 215], opacity: [0.9, 0.9] }
          }
          transition={{ duration: 0.46, ease: "easeOut" }}
          fill={latched ? "var(--fg-dim)" : "var(--copper)"}
        />

        {/* Physical swinging intake valve arm */}
        <g transform="translate(178, 36)">
          <motion.g
            animate={{ rotate: latched ? 0 : -68 }}
            transition={SPRING_SNAPPY}
            style={{ transformOrigin: "0px 0px" }}
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="46"
              stroke={latched ? "var(--sage)" : "var(--fg-muted)"}
              strokeWidth="4"
              strokeLinecap="round"
            />
          </motion.g>
          <circle cx="0" cy="0" r="4.5" fill="var(--fg)" />
          <text x="0" y="-10" textAnchor="middle" fill={latched ? "var(--sage)" : "var(--fg-dim)"} fontFamily="var(--font-mono)" fontSize="9.5">
            {latched ? "LATCHED" : "OPEN"}
          </text>
        </g>

        {/* Queue tank */}
        <rect
          x="216"
          y="26"
          width="228"
          height="80"
          rx="9"
          fill="var(--bg)"
          stroke={overflows > 1 && strategy === "clear" ? "var(--crimson)" : latched ? "var(--sage)" : "var(--line-strong)"}
          strokeWidth="1.5"
        />
        <text x="330" y="18" textAnchor="middle" fill="var(--fg-dim)" fontFamily="var(--font-mono)" fontSize="9.5">
          Per-client queue (cap: 6 slots)
        </text>

        {/* Animated bars inside the queue tank */}
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const isResync = i === 0 && overflows > 0 && fill === 1;
          const activeSlot = i < fill;
          return (
            <motion.rect
              key={i}
              x={228 + i * 35}
              width={27}
              rx={5}
              initial={false}
              animate={{
                y: activeSlot ? 40 : 84,
                height: activeSlot ? 52 : 8,
                opacity: activeSlot ? 1 : 0.22,
                fill: isResync
                  ? strategy === "latch"
                    ? "var(--sage)"
                    : "var(--crimson)"
                  : "var(--copper)",
              }}
              transition={SPRING_SNAPPY}
            />
          );
        })}

        {/* Phone box (offline) */}
        <rect x="548" y="34" width="82" height="64" rx="8" fill="var(--stage-sub)" stroke="var(--crimson-line)" strokeWidth="1.2" />
        <text x="589" y="62" textAnchor="middle" fill="var(--fg)" fontFamily="var(--font-mono)" fontSize="11" fontWeight="600">Phone</text>
        <text x="589" y="79" textAnchor="middle" fill="var(--crimson)" fontFamily="var(--font-mono)" fontSize="9.5">offline</text>
      </svg>
    </Scene>
  );
}
