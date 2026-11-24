import { motion } from "motion/react";
import { Lock, LockOpen, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActionBtn, Scene, SPRING_GENTLE } from "../../engine";

type Stage = 0 | 1 | 2;

function scramble(text: string): string {
  const out: string[] = [];
  let h = 2166136261;
  for (let i = 0; i < 6; i++) {
    h ^= (text.charCodeAt(i % Math.max(1, text.length)) || 65) + i * 29;
    h = Math.imul(h, 16777619) >>> 0;
    out.push(((h >>> 16) & 0xff).toString(16).padStart(2, "0"));
  }
  return out.join(" ");
}

export function PushCipherScene() {
  const [msg, setMsg] = useState("Build finished");
  const [stage, setStage] = useState<Stage>(1);
  const timersRef = useRef<number[]>([]);

  const hex = useMemo(() => scramble(msg || "Build finished"), [msg]);

  const clearTimers = () => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
  };

  useEffect(() => clearTimers, []);

  const sendPush = () => {
    clearTimers();
    setStage(0);
    timersRef.current.push(window.setTimeout(() => setStage(1), 520));
    timersRef.current.push(window.setTimeout(() => setStage(2), 1300));
  };

  const positions = ["0%", "31%", "62%"];
  const isCipher = stage === 1;

  return (
    <Scene
      title="End-to-end encrypted push"
      controls={
        <ActionBtn accent onClick={sendPush} label="Send encrypted push">
          <Send size={13} />
          Send
        </ActionBtn>
      }
      footer={
        <input
          type="text"
          aria-label="Notification text"
          placeholder="Type a notification..."
          value={msg}
          maxLength={40}
          onChange={(e) => setMsg(e.target.value)}
          style={{
            width: "100%",
            padding: "0.38rem 0.65rem",
            borderRadius: "7px",
            border: "1px solid var(--line)",
            background: "var(--bg)",
            color: "var(--fg)",
            fontFamily: "var(--font-sans)",
            fontSize: "0.84rem",
          }}
        />
      }
    >
      {/* 3 clickable stations */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.65rem", marginBottom: "0.95rem" }}>
        {[
          { idx: 0 as Stage, name: "Daemon", sub: "Encrypts" },
          { idx: 1 as Stage, name: "Push Relay", sub: "Sees gibberish" },
          { idx: 2 as Stage, name: "Phone", sub: "Decrypts" },
        ].map((node) => (
          <button
            key={node.name}
            type="button"
            onClick={() => {
              clearTimers();
              setStage(node.idx);
            }}
            style={{
              textAlign: "left",
              padding: "0.6rem 0.75rem",
              borderRadius: "8px",
              border: `1px solid ${stage === node.idx ? "var(--line-strong)" : "var(--line)"}`,
              background: stage === node.idx ? "var(--stage-sub)" : "var(--bg)",
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
            }}
          >
            <div style={{ fontSize: "0.84rem", fontWeight: 600, color: "var(--fg)" }}>{node.name}</div>
            <div style={{ fontSize: "0.75rem", color: "var(--fg-dim)", marginTop: "2px" }}>{node.sub}</div>
          </button>
        ))}
      </div>

      {/* Gliding packet track */}
      <div
        style={{
          borderRadius: "9px",
          border: "1px solid var(--line)",
          background: "var(--bg)",
          padding: "6px",
        }}
      >
        <div style={{ position: "relative", height: "44px" }}>
          <motion.div
            animate={{
              left: positions[stage],
              borderColor: isCipher ? "var(--copper)" : "var(--sage)",
              backgroundColor: isCipher ? "var(--copper-bg)" : "var(--sage-bg)",
            }}
            transition={SPRING_GENTLE}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              width: "38%",
              borderRadius: "7px",
              borderWidth: "1.5px",
              borderStyle: "solid",
              padding: "0 0.7rem",
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
              fontFamily: isCipher ? "var(--font-mono)" : "var(--font-sans)",
              fontSize: isCipher ? "0.76rem" : "0.84rem",
              fontWeight: 500,
              color: "var(--fg)",
              overflow: "hidden",
            }}
          >
            <span style={{ color: isCipher ? "var(--copper)" : "var(--sage)", flexShrink: 0, display: "flex" }}>
              {isCipher ? <Lock size={14} /> : <LockOpen size={14} />}
            </span>
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {isCipher ? hex : msg || "(empty)"}
            </span>
          </motion.div>
        </div>
      </div>
    </Scene>
  );
}
