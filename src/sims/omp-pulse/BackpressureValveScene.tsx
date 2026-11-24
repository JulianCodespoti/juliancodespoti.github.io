import { motion } from "motion/react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { ActionBtn, Choice, Scene, SPRING_SNAPPY, useSceneActive } from "../../engine";

type Strategy = "clear" | "latch";

export function BackpressureValveScene() {
  const [strategy, setStrategy] = useState<Strategy>("clear");
  const [running, setRunning] = useState(true);
  const { ref, active } = useSceneActive(running);

  const [fill, setFill] = useState(1);
  const [latched, setLatched] = useState(false);
  const [overflows, setOverflows] = useState(0);
  const [memoryMb, setMemoryMb] = useState(14);
  const [pulseKey, setPulseKey] = useState(0);

  const reset = () => {
    setFill(1);
    setLatched(false);
    setOverflows(0);
    setMemoryMb(14);
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
            return 1;
          } else {
            setMemoryMb((m) => Math.min(321, m + 38));
            return 1;
          }
        }
        return next;
      });
    }, 520);
    return () => window.clearInterval(id);
  }, [active, latched, strategy]);

  const statusText = latched
    ? "Valve closed, watcher paused"
    : overflows > 1
      ? "Looping and leaking memory"
      : "Queue filling while phone is offline";

  return (
    <Scene
      sceneRef={ref}
      title={
        <span style={{ color: latched ? "var(--sage)" : overflows > 1 ? "var(--crimson)" : "var(--fg-muted)", fontWeight: 600 }}>
          {statusText}
        </span>
      }
      controls={
        <>
          <Choice
            label="Overflow behavior"
            value={strategy}
            onChange={setStrategy}
            options={[
              { value: "clear", label: "Clear queue" },
              { value: "latch", label: "Close valve" },
            ]}
          />
          <ActionBtn
            iconOnly
            accent
            label={running ? "Pause animation" : "Play animation"}
            onClick={() => setRunning((r) => !r)}
          >
            {running ? <Pause size={14} /> : <Play size={14} />}
          </ActionBtn>
          <ActionBtn iconOnly label="Restart animation" onClick={reset}>
            <RotateCcw size={14} />
          </ActionBtn>
        </>
      }
      footer={
        <>
          <span>
            Overflows: <strong style={{ color: overflows > 1 ? "var(--crimson)" : "var(--fg)" }}>{overflows}</strong>
          </span>
          <span>
            Memory: <strong style={{ color: memoryMb > 40 ? "var(--crimson)" : "var(--sage)" }}>{memoryMb} MB</strong>
          </span>
        </>
      }
    >
      <svg viewBox="0 0 640 124" style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Backpressure intake valve and queue">
        {/* Intake pipe */}
        <line x1="94" y1="64" x2="216" y2="64" stroke="var(--line-strong)" strokeWidth="3" />
        {/* Blocked output pipe */}
        <line x1="444" y1="64" x2="546" y2="64" stroke="var(--crimson-line)" strokeWidth="2.5" strokeDasharray="5 5" />

        {/* Watcher */}
        <rect x="10" y="32" width="84" height="64" rx="10" fill="var(--stage-sub)" stroke="var(--line-strong)" strokeWidth="1.2" />
        <text x="52" y="60" textAnchor="middle" fill="var(--fg)" fontFamily="var(--font-sans)" fontSize="12.5" fontWeight="600">
          Watcher
        </text>
        <text x="52" y="78" textAnchor="middle" fill={latched ? "var(--sage)" : "var(--fg-dim)"} fontFamily="var(--font-sans)" fontSize="11">
          {latched ? "paused" : "reading"}
        </text>

        {/* Moving chunk */}
        <motion.circle
          key={pulseKey}
          r="6"
          cy="64"
          initial={{ cx: 102, opacity: 0.9 }}
          animate={
            latched
              ? { cx: [102, 162, 138], opacity: [0.9, 0.9, 0] }
              : { cx: [102, 214], opacity: [0.9, 0.9] }
          }
          transition={{ duration: 0.46, ease: "easeOut" }}
          fill={latched ? "var(--fg-dim)" : "var(--copper)"}
        />

        {/* Swinging valve */}
        <g transform="translate(178, 34)">
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
              strokeWidth="4.5"
              strokeLinecap="round"
            />
          </motion.g>
          <circle cx="0" cy="0" r="4.5" fill="var(--fg)" />
          <text x="0" y="-11" textAnchor="middle" fill={latched ? "var(--sage)" : "var(--fg-dim)"} fontFamily="var(--font-sans)" fontSize="11" fontWeight="500">
            {latched ? "Closed" : "Open"}
          </text>
        </g>

        {/* Queue tank */}
        <rect
          x="216"
          y="24"
          width="228"
          height="80"
          rx="11"
          fill="var(--bg)"
          stroke={overflows > 1 && strategy === "clear" ? "var(--crimson)" : latched ? "var(--sage)" : "var(--line-strong)"}
          strokeWidth="1.5"
        />

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
                y: activeSlot ? 38 : 82,
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

        {/* Offline phone */}
        <rect x="546" y="32" width="84" height="64" rx="10" fill="var(--stage-sub)" stroke="var(--crimson-line)" strokeWidth="1.2" />
        <text x="588" y="60" textAnchor="middle" fill="var(--fg)" fontFamily="var(--font-sans)" fontSize="12.5" fontWeight="600">
          Phone
        </text>
        <text x="588" y="78" textAnchor="middle" fill="var(--crimson)" fontFamily="var(--font-sans)" fontSize="11">
          offline
        </text>
      </svg>
    </Scene>
  );
}
