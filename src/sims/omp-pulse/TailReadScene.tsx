import { motion } from "motion/react";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { ActionBtn, Choice, Scene } from "../../engine";

type ReadMode = "full" | "tail";

export function TailReadScene() {
  const [mode, setMode] = useState<ReadMode>("tail");
  const [runKey, setRunKey] = useState(0);

  const replay = (next?: ReadMode) => {
    if (next) setMode(next);
    setRunKey((k) => k + 1);
  };

  const isTail = mode === "tail";

  return (
    <Scene
      title={
        <span style={{ color: isTail ? "var(--sage)" : "var(--copper)", fontWeight: 600 }}>
          {isTail ? "62x faster: jump straight to the end" : "Full scan: reads every older message first"}
        </span>
      }
      controls={
        <>
          <Choice
            label="File read method"
            value={mode}
            onChange={(m) => replay(m)}
            options={[
              { value: "full", label: "Read whole file" },
              { value: "tail", label: "Seek from end" },
            ]}
          />
          <ActionBtn iconOnly accent label="Replay file read" onClick={() => replay()}>
            <RotateCcw size={14} />
          </ActionBtn>
        </>
      }
      footer={
        <>
          <span>
            Bytes read: <strong style={{ color: isTail ? "var(--sage)" : "var(--copper)" }}>{isTail ? "70 KB" : "44 MB"}</strong>
          </span>
          <span>
            Time: <strong style={{ color: isTail ? "var(--sage)" : "var(--copper)" }}>{isTail ? "0.59 ms" : "36.4 ms"}</strong>
          </span>
        </>
      }
    >
      {/* 44 MB file tape */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "var(--fg-dim)", marginBottom: "0.45rem" }}>
        <span>Oldest messages (0 MB)</span>
        <span style={{ color: "var(--sage)", fontWeight: 500 }}>Latest screen (70 KB)</span>
      </div>

      <div
        style={{
          position: "relative",
          height: "52px",
          borderRadius: "9px",
          border: "1px solid var(--line-strong)",
          background: "var(--bg)",
          overflow: "hidden",
        }}
      >
        {/* Subtle segment ticks across the 44 MB file */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            gridTemplateColumns: "repeat(12, 1fr)",
            pointerEvents: "none",
          }}
        >
          {Array.from({ length: 12 }, (_, i) => (
            <div
              key={i}
              style={{
                borderRight: i < 11 ? "1px solid var(--line)" : "none",
                opacity: 0.45,
              }}
            />
          ))}
        </div>

        {/* Highlighted tail target (last ~6% visually so it is clearly visible) */}
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            right: 0,
            width: "7%",
            background: "var(--sage-bg)",
            borderLeft: "1.5px solid var(--sage-line)",
          }}
        />

        {/* Animated read sweep */}
        {isTail ? (
          <motion.div
            key={`tail-${runKey}`}
            initial={{ width: "0%", right: 0 }}
            animate={{ width: "7%" }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            style={{
              position: "absolute",
              top: "6px",
              bottom: "6px",
              right: "4px",
              borderRadius: "5px",
              background: "var(--sage)",
            }}
          />
        ) : (
          <motion.div
            key={`full-${runKey}`}
            initial={{ width: "0%" }}
            animate={{ width: "calc(100% - 8px)" }}
            transition={{ duration: 1.55, ease: "linear" }}
            style={{
              position: "absolute",
              top: "6px",
              bottom: "6px",
              left: "4px",
              borderRadius: "5px",
              background: "var(--copper)",
              opacity: 0.85,
            }}
          />
        )}
      </div>
    </Scene>
  );
}
