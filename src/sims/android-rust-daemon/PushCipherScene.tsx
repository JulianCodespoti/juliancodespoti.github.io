import { motion } from "motion/react";
import { Lock, LockOpen, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActionBtn, Scene, SPRING_GENTLE } from "../../engine";

type Stage = 0 | 1 | 2; // 0 = daemon plaintext, 1 = crossing relay encrypted, 2 = decrypted on phone

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
  const [msg, setMsg] = useState("Reply ready: 9 tests pass");
  const [stage, setStage] = useState<Stage>(1);

  const hex = useMemo(() => scramble(msg || "Reply ready"), [msg]);
  const timersRef = useRef<number[]>([]);

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
      title="Zero-OpenSSL Web Push (p256 + hkdf + aes-gcm)"
      controls={
        <ActionBtn accent onClick={sendPush}>
          <Send size={12} />
          Send push
        </ActionBtn>
      }
      footer={
        <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", width: "100%" }}>
          <span>notification:</span>
          <input
            type="text"
            value={msg}
            maxLength={48}
            onChange={(e) => setMsg(e.target.value)}
            style={{
              flex: 1,
              minWidth: 0,
              padding: "0.3rem 0.55rem",
              borderRadius: "5px",
              border: "1px solid var(--line)",
              background: "var(--bg)",
              color: "var(--fg)",
              fontFamily: "var(--font-mono)",
              fontSize: "0.76rem",
            }}
          />
        </label>
      }
    >
      {/* 3 clickable station nodes */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.6rem", marginBottom: "0.9rem" }}>
        {[
          { idx: 0 as Stage, name: "1. Your daemon", sub: "seals with aes-gcm" },
          { idx: 1 as Stage, name: "2. Push relay", sub: "sees cipher bytes only" },
          { idx: 2 as Stage, name: "3. Your phone", sub: "decrypts locally" },
        ].map((node) => (
          <button
            key={node.name}
            type="button"
            onClick={() => setStage(node.idx)}
            style={{
              textAlign: "left",
              padding: "0.55rem 0.65rem",
              borderRadius: "7px",
              border: `1px solid ${stage === node.idx ? "var(--line-strong)" : "var(--line)"}`,
              background: stage === node.idx ? "var(--stage-sub)" : "var(--bg)",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
            }}
          >
            <div style={{ fontSize: "0.74rem", fontWeight: 600, color: "var(--fg)" }}>{node.name}</div>
            <div style={{ fontSize: "0.68rem", color: "var(--fg-dim)", marginTop: "2px" }}>{node.sub}</div>
          </button>
        ))}
      </div>

      {/* Animated gliding packet that physically locks & scrambles across the relay */}
      <div
        style={{
          borderRadius: "8px",
          border: "1px solid var(--line)",
          background: "var(--bg)",
          padding: "6px",
        }}
      >
        <div style={{ position: "relative", height: "42px" }}>
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
              borderRadius: "6px",
              borderWidth: "1.5px",
              borderStyle: "solid",
              padding: "0 0.65rem",
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
              fontFamily: "var(--font-mono)",
              fontSize: "0.73rem",
              color: "var(--fg)",
              overflow: "hidden",
            }}
          >
            <span style={{ color: isCipher ? "var(--copper)" : "var(--sage)", flexShrink: 0 }}>
              {isCipher ? <Lock size={13} /> : <LockOpen size={13} />}
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
