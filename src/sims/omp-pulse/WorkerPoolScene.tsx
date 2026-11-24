import { AnimatePresence, motion } from "motion/react";
import { RotateCcw, Send } from "lucide-react";
import { useState } from "react";
import { ActionBtn, Choice, Scene, SPRING_GENTLE, SPRING_SNAPPY } from "../../engine";

type Strategy = "eager" | "lazy";

const CHATS = ["API refactor", "Mobile nav", "Auth tests", "SQL query", "Deploy script"] as const;
const DAEMON_MB = 14;
const WORKER_MB = 281;
const POOL_CAP = 3;

export function WorkerPoolScene() {
  const [strategy, setStrategy] = useState<Strategy>("lazy");
  const [selectedChat, setSelectedChat] = useState<string>(CHATS[0]);
  const [browsed, setBrowsed] = useState<string[]>([CHATS[0], CHATS[1], CHATS[2]]);
  const [pool, setPool] = useState<string[]>([CHATS[0]]);
  const [note, setNote] = useState<string>("Browsing reads directly from disk. Only replying boots a worker.");

  const openChat = (chat: string) => {
    setSelectedChat(chat);
    setBrowsed((prev) => (prev.includes(chat) ? prev : [...prev, chat]));
    if (strategy === "eager") {
      setNote(`Opened "${chat}" and booted a dedicated 281 MB worker.`);
    } else {
      setNote(`Opened "${chat}" directly from disk (0 MB extra).`);
    }
  };

  const replyInChat = () => {
    if (strategy === "eager") {
      openChat(selectedChat);
      return;
    }
    setPool((prev) => {
      if (prev.includes(selectedChat)) {
        setNote(`"${selectedChat}" already has a warm worker ready.`);
        return prev;
      }
      if (prev.length < POOL_CAP) {
        setNote(`Pre-warmed a worker for "${selectedChat}" as you started typing.`);
        return [...prev, selectedChat];
      }
      const evicted = prev[0];
      setNote(`Retargeted warm worker from "${evicted}" to "${selectedChat}" in 59 ms.`);
      return [...prev.slice(1), selectedChat];
    });
  };

  const reset = () => {
    setSelectedChat(CHATS[0]);
    setBrowsed([CHATS[0], CHATS[1], CHATS[2]]);
    setPool([CHATS[0]]);
    setNote(
      strategy === "lazy"
        ? "Browsing reads directly from disk. Only replying boots a worker."
        : "Every opened chat boots its own 281 MB worker process.",
    );
  };

  const switchStrategy = (next: Strategy) => {
    setStrategy(next);
    setNote(
      next === "lazy"
        ? "Lazy pool: reading chats costs 0 workers; replying shares at most 3."
        : "Eager mode: every chat you browse boots a separate 281 MB worker.",
    );
  };

  const activeWorkers = strategy === "eager" ? browsed : pool;
  const totalMb = DAEMON_MB + activeWorkers.length * WORKER_MB;
  const maxBarMb = DAEMON_MB + CHATS.length * WORKER_MB;

  return (
    <Scene
      title={
        <span>
          Total memory:{" "}
          <strong style={{ color: totalMb > 900 ? "var(--crimson)" : strategy === "lazy" ? "var(--sage)" : "var(--copper)", fontWeight: 600 }}>
            {totalMb.toLocaleString()} MB
          </strong>
        </span>
      }
      controls={
        <>
          <Choice
            label="Worker strategy"
            value={strategy}
            onChange={switchStrategy}
            options={[
              { value: "eager", label: "Always spawn" },
              { value: "lazy", label: "Lazy pool (max 3)" },
            ]}
          />
          <ActionBtn iconOnly label="Reset pool" onClick={reset}>
            <RotateCcw size={14} />
          </ActionBtn>
        </>
      }
      footer={<span>{note}</span>}
    >
      {/* Clickable chats */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", marginBottom: "1rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
          {CHATS.map((chat) => {
            const isSelected = selectedChat === chat;
            return (
              <button
                key={chat}
                type="button"
                onClick={() => openChat(chat)}
                style={{
                  padding: "0.32rem 0.68rem",
                  borderRadius: "7px",
                  border: `1px solid ${isSelected ? "var(--copper-line)" : "var(--line)"}`,
                  background: isSelected ? "var(--copper-bg)" : "var(--bg)",
                  color: isSelected ? "var(--fg)" : "var(--fg-muted)",
                  fontFamily: "var(--font-sans)",
                  fontSize: "0.8rem",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                {chat}
              </button>
            );
          })}
        </div>

        {strategy === "lazy" && (
          <ActionBtn accent onClick={replyInChat} label={`Reply in ${selectedChat}`}>
            <Send size={13} />
            Reply
          </ActionBtn>
        )}
      </div>

      {/* Memory layout: Daemon + Worker slots */}
      <div style={{ display: "grid", gridTemplateColumns: "110px minmax(0, 1fr)", gap: "0.75rem", alignItems: "stretch", marginBottom: "1rem" }}>
        {/* Tiny Rust daemon */}
        <div
          style={{
            padding: "0.7rem 0.75rem",
            borderRadius: "9px",
            border: "1.5px solid var(--sage-line)",
            background: "var(--sage-bg)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--sage)" }}>Daemon</span>
          <span style={{ fontSize: "0.76rem", color: "var(--fg-muted)", marginTop: "2px" }}>14 MB</span>
        </div>

        {/* Worker processes */}
        <div
          style={{
            padding: "0.65rem 0.75rem",
            borderRadius: "9px",
            border: "1px solid var(--line)",
            background: "var(--bg)",
          }}
        >
          <div style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--fg-dim)", marginBottom: "0.45rem" }}>
            {strategy === "lazy"
              ? `Warm workers (${pool.length} of ${POOL_CAP} slots)`
              : `Spawned workers (${browsed.length} running)`}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", minHeight: "34px", alignItems: "center" }}>
            <AnimatePresence mode="popLayout">
              {activeWorkers.map((chat) => (
                <motion.div
                  key={chat}
                  layout
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={SPRING_SNAPPY}
                  style={{
                    padding: "0.3rem 0.65rem",
                    borderRadius: "7px",
                    border: `1px solid ${strategy === "lazy" ? "var(--teal-line)" : "var(--copper-line)"}`,
                    background: strategy === "lazy" ? "var(--teal-bg)" : "var(--copper-bg)",
                    fontSize: "0.79rem",
                    fontWeight: 500,
                    color: "var(--fg)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                  }}
                >
                  <span>{chat}</span>
                  <span style={{ fontSize: "0.72rem", color: "var(--fg-muted)" }}>281 MB</span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Live RAM meter */}
      <div style={{ height: "8px", borderRadius: "999px", background: "var(--bg)", overflow: "hidden" }}>
        <motion.div
          animate={{
            width: `${Math.max(3, (totalMb / maxBarMb) * 100)}%`,
            backgroundColor: totalMb > 900 ? "var(--crimson)" : strategy === "lazy" ? "var(--teal)" : "var(--copper)",
          }}
          transition={SPRING_GENTLE}
          style={{ height: "100%", borderRadius: "999px" }}
        />
      </div>
    </Scene>
  );
}
