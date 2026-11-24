import { RotateCcw, Send } from "lucide-react";
import { useState } from "react";
import { ActionButton, LabStage, MetricPill, Segmented, Toggle } from "../../kit";

type ArbMode = "naive" | "pulse";

interface TurnRecord {
  id: number;
  author: "desktop" | "phone";
  text: string;
  lost?: boolean;
}

const INITIAL_TURNS: TurnRecord[] = [
  { id: 1, author: "desktop", text: "Add cursor pagination to GET /todos" },
  { id: 2, author: "desktop", text: "Run vitest suite & fix edge case" },
];

export function OwnershipLab() {
  const [mode, setMode] = useState<ArbMode>("naive");
  const [bridgeActive, setBridgeActive] = useState(true);

  const [desktopRam, setDesktopRam] = useState<TurnRecord[]>(INITIAL_TURNS);
  const [disk, setDisk] = useState<TurnRecord[]>(INITIAL_TURNS);
  const [lostCount, setLostCount] = useState(0);
  const [nextId, setNextId] = useState(3);
  const [eventLog, setEventLog] = useState<string>(
    "Desktop TUI (PID 4182) owns session.jsonl. Try sending a prompt from the Phone, then sending one from the Desktop.",
  );

  const reset = () => {
    setDesktopRam(INITIAL_TURNS);
    setDisk(INITIAL_TURNS);
    setLostCount(0);
    setNextId(3);
    setEventLog("Reset: Desktop TUI (PID 4182) holds turns #1 and #2 in RAM and on disk.");
  };

  const sendFromPhone = () => {
    const id = nextId;
    const rec: TurnRecord = { id, author: "phone", text: `Phone steer #${id}: add RFC 8288 Link header` };

    if (mode === "naive") {
      // Phone spawns its own writer and appends directly to disk — Desktop RAM doesn't know!
      setDisk((prev) => [...prev, rec]);
      setNextId(id + 1);
      setEventLog(
        `Naive phone child appended turn #${id} directly to session.jsonl. Desktop TUI's in-memory tree still only has [${desktopRam.map((t) => `#${t.id}`).join(", ")}]—watch what happens when Desktop writes next!`,
      );
      return;
    }

    // Pulse 3-layer ownership check detects Desktop PID 4182!
    if (!bridgeActive) {
      setEventLog(
        `3-layer check (sidecar + sysinfo + /proc) found Desktop PID 4182 owns session.jsonl and no Bridge/Collab link is active → Pulse REFUSES to spawn a second writer (fail-closed, zero data loss).`,
      );
      return;
    }

    // Routed safely through Desktop Bridge extension -> Desktop remains the sole writer!
    const updated = [...desktopRam, rec];
    setDesktopRam(updated);
    setDisk(updated);
    setNextId(id + 1);
    setEventLog(
      `3-layer check found Desktop PID 4182 → Pulse forwarded turn #${id} through omp-pulse-control bridge. Desktop updated its RAM and flushed cleanly as the single writer.`,
    );
  };

  const sendFromDesktop = () => {
    const id = nextId;
    const rec: TurnRecord = { id, author: "desktop", text: `Desktop turn #${id}: commit & push` };

    if (mode === "naive") {
      // Desktop rewrites session.jsonl WHOLESALE from its own RAM! Any phone-only disk turns are clobbered!
      const desktopIds = new Set(desktopRam.map((t) => t.id));
      const clobbered = disk.filter((t) => !desktopIds.has(t.id) && !t.lost);
      const nextRam = [...desktopRam, rec];
      setDesktopRam(nextRam);
      if (clobbered.length > 0) {
        setLostCount((c) => c + clobbered.length);
        // Show clobbered entries crossed out so the reader sees the exact damage
        setDisk([...nextRam, ...clobbered.map((t) => ({ ...t, lost: true }))]);
        setEventLog(
          `DATA LOSS: Desktop rewrote session.jsonl wholesale from memory! Phone turn(s) ${clobbered.map((t) => `#${t.id}`).join(", ")} were silently overwritten and destroyed.`,
        );
      } else {
        setDisk(nextRam);
        setEventLog(`Desktop flushed turn #${id} to session.jsonl.`);
      }
      setNextId(id + 1);
      return;
    }

    const nextRam = [...desktopRam, rec];
    setDesktopRam(nextRam);
    setDisk(nextRam);
    setNextId(id + 1);
    setEventLog(`Desktop wrote turn #${id} as sole writer and streamed token deltas to Phone over the bridge.`);
  };

  return (
    <LabStage
      kicker="Lab 04 · Dual-Device Arbitration"
      title="Why Two Writers Destroy a JSONL Session File (and How Pulse Prevents It)"
      metrics={
        <>
          <MetricPill
            label="Owner"
            value="Desktop PID 4182"
            tone="cyan"
          />
          <MetricPill
            label="Write Path"
            value={mode === "naive" ? "2 Writers (Unsafe)" : bridgeActive ? "Bridge Relay (1 Writer)" : "Fail-Closed"}
            tone={mode === "naive" ? "rose" : bridgeActive ? "emerald" : "amber"}
          />
          <MetricPill
            label="Lost Turns"
            value={lostCount}
            tone={lostCount > 0 ? "rose" : "emerald"}
          />
        </>
      }
      controls={
        <>
          <Segmented
            label="Ownership mode"
            value={mode}
            onChange={(m) => {
              setMode(m);
              reset();
            }}
            options={[
              { value: "naive", label: "Naive (2 Writers)" },
              { value: "pulse", label: "Pulse 3-Layer Guard" },
            ]}
          />
          {mode === "pulse" ? (
            <Toggle
              label={bridgeActive ? "Desktop Bridge: On" : "Desktop Bridge: Off"}
              checked={bridgeActive}
              onChange={setBridgeActive}
            />
          ) : null}
          <ActionButton variant="primary" onClick={sendFromPhone}>
            <Send size={13} />
            Send from Phone
          </ActionButton>
          <ActionButton onClick={sendFromDesktop}>
            <Send size={13} />
            Send from Desktop
          </ActionButton>
          <ActionButton onClick={reset}>
            <RotateCcw size={13} />
            Reset
          </ActionButton>
        </>
      }
      caption={eventLog}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "0.85rem",
        }}
      >
        {/* Desktop RAM */}
        <div
          style={{
            padding: "0.9rem",
            borderRadius: "10px",
            border: "1px solid var(--cyan-border)",
            background: "var(--surface-1)",
          }}
        >
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--cyan)", fontWeight: 600, marginBottom: "0.55rem" }}>
            DESKTOP TUI (PID 4182 · RAM)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {desktopRam.map((t) => (
              <div
                key={t.id}
                style={{
                  padding: "0.4rem 0.55rem",
                  borderRadius: "6px",
                  background: "var(--surface-2)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.72rem",
                  color: "var(--fg)",
                }}
              >
                <span style={{ color: t.author === "phone" ? "var(--accent-strong)" : "var(--cyan)" }}>#{t.id}</span>{" "}
                {t.text}
              </div>
            ))}
          </div>
        </div>

        {/* Shared JSONL file on disk */}
        <div
          style={{
            padding: "0.9rem",
            borderRadius: "10px",
            border: `1px solid ${lostCount > 0 ? "var(--rose-border)" : "var(--emerald-border)"}`,
            background: "var(--surface-1)",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.72rem",
              color: lostCount > 0 ? "var(--rose)" : "var(--emerald)",
              fontWeight: 600,
              marginBottom: "0.55rem",
            }}
          >
            session.jsonl ON DISK
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {disk.map((t) => (
              <div
                key={`${t.id}-${t.lost ? "lost" : "live"}`}
                style={{
                  padding: "0.4rem 0.55rem",
                  borderRadius: "6px",
                  border: t.lost ? "1px dashed var(--rose)" : "1px solid transparent",
                  background: t.lost ? "var(--rose-bg)" : "var(--surface-2)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.72rem",
                  color: t.lost ? "var(--rose)" : "var(--fg)",
                  textDecoration: t.lost ? "line-through" : "none",
                }}
              >
                #{t.id} {t.text} {t.lost ? " [CLOBBERED]" : ""}
              </div>
            ))}
          </div>
        </div>

        {/* Pulse Authority Check */}
        <div
          style={{
            padding: "0.9rem",
            borderRadius: "10px",
            border: "1px solid var(--border)",
            background: "var(--surface-1)",
          }}
        >
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--accent-strong)", fontWeight: 600, marginBottom: "0.55rem" }}>
            DAEMON AUTHORITY GUARD
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.42rem", fontFamily: "var(--font-mono)", fontSize: "0.72rem" }}>
            {[
              { layer: "1. Sidecar lock", status: mode === "pulse" ? "HIT · PID 4182" : "Bypassed" },
              { layer: "2. sysinfo argv", status: mode === "pulse" ? "HIT · omp session" : "Bypassed" },
              { layer: "3. /proc · libproc", status: mode === "pulse" ? "HIT · open fd" : "Bypassed" },
            ].map((row) => (
              <div
                key={row.layer}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "0.38rem 0.55rem",
                  borderRadius: "6px",
                  background: "var(--surface-2)",
                }}
              >
                <span style={{ color: "var(--fg-muted)" }}>{row.layer}</span>
                <span style={{ color: mode === "pulse" ? "var(--emerald)" : "var(--rose)", fontWeight: 600 }}>
                  {row.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </LabStage>
  );
}
