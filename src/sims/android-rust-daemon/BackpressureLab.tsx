import { Pause, Play, RotateCcw, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ActionButton, LabStage, MetricPill, Segmented, Toggle, useStageVisibility } from "../../kit";

type Encoding = "full" | "delta";
type BpMode = "unbounded" | "clear-only" | "three-ceiling";
type LinkSpeed = "wifi" | "cellular" | "tunnel";

interface Packet {
  x: number; // 0..1 progress from producer -> queue or queue -> client
  lane: "in" | "out";
  sizeKb: number;
  kind: "full" | "delta" | "resync";
  yJitter: number;
}

const LINK_DRAIN_KBS: Record<LinkSpeed, number> = {
  wifi: 480,
  cellular: 65,
  tunnel: 0,
};

const MAX_FRAMES = 64;
const MAX_BYTES_KB = 8192; // 8 MiB catch-up/byte ceiling

export function BackpressureLab() {
  const { ref: stageRef, visible, reducedMotion } = useStageVisibility();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [encoding, setEncoding] = useState<Encoding>("delta");
  const [bpMode, setBpMode] = useState<BpMode>("three-ceiling");
  const [linkSpeed, setLinkSpeed] = useState<LinkSpeed>("cellular");
  const [phoneVisible, setPhoneVisible] = useState(true);
  const [running, setRunning] = useState(true);

  const [hud, setHud] = useState({
    wireKb: 0,
    rssMb: 14,
    queueFrames: 0,
    queueKb: 0,
    oscillations: 0,
    stalled: false,
    watcherParked: false,
    pendingResync: false,
    seq: 1,
  });

  // Mutable simulation state inside ref for smooth 60fps canvas loop
  const simRef = useRef({
    packets: [
      { x: 0.25, lane: "in" as const, sizeKb: 0.51, kind: "delta" as const, yJitter: -4 },
      { x: 0.72, lane: "in" as const, sizeKb: 0.51, kind: "delta" as const, yJitter: 5 },
      { x: 0.4, lane: "out" as const, sizeKb: 0.51, kind: "delta" as const, yJitter: -3 },
    ] as Packet[],
    wireKb: 12,
    rssMb: 14,
    queueFrames: 3,
    queueKb: 2,
    oscillations: 0,
    stalled: false,
    pendingResync: false,
    seq: 24,
    emitAcc: 0,
    drainAcc: 0,
    burstRemainingKb: 0,
    hudAcc: 0,
    lastTs: 0,
  });

  const cfgRef = useRef({ encoding, bpMode, linkSpeed, phoneVisible, running });
  cfgRef.current = { encoding, bpMode, linkSpeed, phoneVisible, running };

  // When phone unlocks in three-ceiling mode and missed skipped updates, trigger one clean resync
  useEffect(() => {
    const s = simRef.current;
    if (phoneVisible && s.pendingResync) {
      s.pendingResync = false;
      s.stalled = false;
      s.queueFrames = 1;
      s.queueKb = 12;
      s.packets.push({ x: 0, lane: "out", sizeKb: 12, kind: "resync", yJitter: 0 });
    }
  }, [phoneVisible]);

  const resetSim = () => {
    simRef.current = {
      packets: [],
      wireKb: 0,
      rssMb: 14,
      queueFrames: 0,
      queueKb: 0,
      oscillations: 0,
      stalled: false,
      pendingResync: false,
      seq: 1,
      emitAcc: 0,
      drainAcc: 0,
      burstRemainingKb: 0,
      hudAcc: 0,
      lastTs: 0,
    };
    setHud({
      wireKb: 0,
      rssMb: 14,
      queueFrames: 0,
      queueKb: 0,
      oscillations: 0,
      stalled: false,
      watcherParked: false,
      pendingResync: false,
      seq: 1,
    });
  };

  const triggerBurst = () => {
    simRef.current.burstRemainingKb += 18000; // Visualized burst representing 150 MiB log storm
  };

  useEffect(() => {
    let raf = 0;

    const readCss = () => {
      const st = getComputedStyle(document.documentElement);
      return {
        fg: st.getPropertyValue("--fg").trim() || "#eef1f7",
        muted: st.getPropertyValue("--fg-muted").trim() || "#8892a8",
        surface: st.getPropertyValue("--surface-2").trim() || "#1a1e2c",
        border: st.getPropertyValue("--border-strong").trim() || "rgba(148,163,184,0.3)",
        accent: st.getPropertyValue("--accent").trim() || "#9b87f5",
        cyan: st.getPropertyValue("--cyan").trim() || "#38bdf8",
        emerald: st.getPropertyValue("--emerald").trim() || "#34d399",
        amber: st.getPropertyValue("--amber").trim() || "#fbbf24",
        rose: st.getPropertyValue("--rose").trim() || "#fb7185",
      };
    };

    const tick = (ts: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const s = simRef.current;
      const cfg = cfgRef.current;

      const dt = s.lastTs ? Math.min(0.05, (ts - s.lastTs) / 1000) : 0.016;
      s.lastTs = ts;

      const active = cfg.running && visible && !reducedMotion;
      const watcherParked = cfg.bpMode === "three-ceiling" && (!cfg.phoneVisible || s.stalled);

      if (active) {
        // 1. Producer emits frames (or parks when no visible client has headroom!)
        const rateHz = s.burstRemainingKb > 0 ? 18 : 6.5;
        s.emitAcc += dt * rateHz;
        while (s.emitAcc >= 1) {
          s.emitAcc -= 1;
          const isBurst = s.burstRemainingKb > 0;
          if (isBurst) s.burstRemainingKb = Math.max(0, s.burstRemainingKb - 900);

          if (watcherParked) {
            if (!cfg.phoneVisible) s.pendingResync = true;
            continue;
          }

          // Real measured amplification ratio: full snapshots ~5.0 KB/frame (244 KB / 50 frames), deltas ~0.52 KB/frame (25 KB / 50 frames)
          const frameKb = isBurst ? 920 : cfg.encoding === "full" ? 4.9 : 0.51;
          s.seq += 1;

          s.packets.push({
            x: 0,
            lane: "in",
            sizeKb: frameKb,
            kind: cfg.encoding === "full" || isBurst ? "full" : "delta",
            yJitter: (Math.random() - 0.5) * 18,
          });

          // Enqueue on hub
          s.queueFrames += 1;
          s.queueKb += frameKb;

          if (cfg.bpMode === "unbounded") {
            s.rssMb = Math.min(340, 14 + s.queueKb / 64);
          } else if (cfg.bpMode === "clear-only") {
            // The 123x oscillation bug! Clearing queue to 1 tiny resync frame immediately restores headroom
            if (s.queueFrames > MAX_FRAMES || s.queueKb > MAX_BYTES_KB) {
              s.oscillations += 1;
              s.rssMb = Math.min(335, s.rssMb + 14);
              s.queueFrames = 1;
              s.queueKb = 0.2; // tiny resync fits instantly, reopening gate!
              s.packets.push({ x: 0, lane: "out", sizeKb: 0.2, kind: "resync", yJitter: 0 });
            }
          } else {
            // Three-ceiling + stall latch: holds gate closed, RSS stays flat!
            if (s.queueFrames > MAX_FRAMES || s.queueKb > MAX_BYTES_KB) {
              s.stalled = true;
              s.queueFrames = 1;
              s.queueKb = 0.2;
              s.packets.push({ x: 0, lane: "out", sizeKb: 0.2, kind: "resync", yJitter: 0 });
            }
            s.rssMb = Math.max(14, Math.min(24, 14 + s.queueKb / 1024));
          }
        }

        // 2. Drain queue over network link
        const drainRateKb = LINK_DRAIN_KBS[cfg.linkSpeed];
        if (drainRateKb > 0 && s.queueFrames > 0) {
          s.drainAcc += dt * drainRateKb;
          while (s.drainAcc > 0 && s.queueFrames > 0) {
            const avgKb = s.queueKb / Math.max(1, s.queueFrames);
            if (s.drainAcc < Math.min(avgKb, 40) && s.queueFrames > 1) break;
            const sentKb = Math.min(s.queueKb, Math.max(avgKb, 0.2));
            s.drainAcc = Math.max(0, s.drainAcc - sentKb);
            s.queueFrames = Math.max(0, s.queueFrames - 1);
            s.queueKb = Math.max(0, s.queueKb - sentKb);
            s.wireKb += sentKb;

            if (s.packets.length < 48) {
              s.packets.push({
                x: 0,
                lane: "out",
                sizeKb: sentKb,
                kind: sentKb < 1.2 ? "delta" : "full",
                yJitter: (Math.random() - 0.5) * 14,
              });
            }
          }
          // Unlatch stall once drained on a live link
          if (s.stalled && s.queueFrames === 0 && cfg.phoneVisible) {
            s.stalled = false;
          }
        } else if (cfg.bpMode === "clear-only") {
          s.rssMb = Math.max(14, s.rssMb - dt * 1.5);
        }

        // 3. Advance animated packets
        const speed = cfg.linkSpeed === "wifi" ? 1.55 : cfg.linkSpeed === "cellular" ? 0.9 : 0.35;
        for (const p of s.packets) {
          p.x += dt * (p.lane === "in" ? 1.35 : speed);
        }
        s.packets = s.packets.filter((p) => p.x < 1);

        // Throttle React HUD updates to ~10 Hz
        s.hudAcc += dt;
        if (s.hudAcc >= 0.1) {
          s.hudAcc = 0;
          setHud({
            wireKb: Math.round(s.wireKb),
            rssMb: Math.round(s.rssMb),
            queueFrames: s.queueFrames,
            queueKb: Math.round(s.queueKb),
            oscillations: s.oscillations,
            stalled: s.stalled,
            watcherParked,
            pendingResync: s.pendingResync,
            seq: s.seq,
          });
        }
      }

      // Draw crisp HiDPI canvas
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(320, Math.round(rect.width));
      const h = 220;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, w, h);
        const c = readCss();

        const leftX = 20;
        const boxW = Math.min(148, w * 0.22);
        const midW = Math.min(210, w * 0.31);
        const midX = (w - midW) / 2;
        const rightX = w - boxW - 20;
        const cy = h / 2;

        // Wire rails
        ctx.strokeStyle = c.border;
        ctx.lineWidth = 2;
        ctx.setLineDash(watcherParked ? [5, 5] : []);
        ctx.beginPath();
        ctx.moveTo(leftX + boxW, cy);
        ctx.lineTo(midX, cy);
        ctx.stroke();

        ctx.setLineDash(cfg.linkSpeed === "tunnel" ? [4, 6] : []);
        ctx.strokeStyle = cfg.linkSpeed === "tunnel" ? c.rose : c.border;
        ctx.beginPath();
        ctx.moveTo(midX + midW, cy);
        ctx.lineTo(rightX, cy);
        ctx.stroke();
        ctx.setLineDash([]);

        // Animated packets
        for (const p of s.packets) {
          const px =
            p.lane === "in"
              ? leftX + boxW + p.x * (midX - (leftX + boxW))
              : midX + midW + p.x * (rightX - (midX + midW));
          const py = cy + p.yJitter;
          const r = p.kind === "resync" ? 5 : p.kind === "delta" ? 4 : Math.min(11, 5.5 + Math.log10(1 + p.sizeKb) * 2.4);
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fillStyle = p.kind === "resync" ? c.amber : p.kind === "delta" ? c.cyan : c.accent;
          ctx.fill();
        }

        const drawNode = (x: number, y: number, bw: number, bh: number, title: string, sub: string, stroke: string) => {
          ctx.fillStyle = c.surface;
          ctx.strokeStyle = stroke;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(x, y, bw, bh, 12);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = c.fg;
          ctx.font = '600 12px "JetBrains Mono Variable", monospace';
          ctx.fillText(title, x + 12, y + 24);
          ctx.fillStyle = c.muted;
          ctx.font = '400 10.5px "JetBrains Mono Variable", monospace';
          ctx.fillText(sub, x + 12, y + 42);
        };

        // Left: Producer
        drawNode(
          leftX,
          cy - 54,
          boxW,
          108,
          "Watcher / RPC",
          watcherParked ? "PARKED (0 CPU)" : cfg.encoding === "delta" ? "UTF-16 deltas" : "Full snapshots",
          watcherParked ? c.emerald : c.border,
        );
        ctx.fillStyle = watcherParked ? c.emerald : c.cyan;
        ctx.font = '500 10px "JetBrains Mono Variable", monospace';
        ctx.fillText(`seq #${s.seq}`, leftX + 12, cy + 32);

        // Center: WsHub Queue
        const overMem = s.rssMb > 80;
        drawNode(
          midX,
          cy - 68,
          midW,
          136,
          "WsHub Queue",
          s.stalled ? "STALL LATCH HELD" : cfg.bpMode === "unbounded" ? "Unbounded!" : "Dual ceiling",
          s.stalled ? c.amber : overMem ? c.rose : c.accent,
        );

        // Queue progress bars inside center node
        const barW = midW - 24;
        const fRatio = Math.min(1, s.queueFrames / MAX_FRAMES);
        const bRatio = Math.min(1, s.queueKb / MAX_BYTES_KB);

        ctx.fillStyle = c.muted;
        ctx.font = '400 10px "JetBrains Mono Variable", monospace';
        ctx.fillText(`Frames: ${s.queueFrames}/${MAX_FRAMES}`, midX + 12, cy - 4);
        ctx.fillStyle = "rgba(148,163,184,0.16)";
        ctx.fillRect(midX + 12, cy + 2, barW, 7);
        ctx.fillStyle = fRatio > 0.8 ? c.rose : c.cyan;
        ctx.fillRect(midX + 12, cy + 2, barW * fRatio, 7);

        ctx.fillStyle = c.muted;
        ctx.fillText(`Bytes: ${Math.round(s.queueKb)} KB / 8 MB`, midX + 12, cy + 27);
        ctx.fillStyle = "rgba(148,163,184,0.16)";
        ctx.fillRect(midX + 12, cy + 33, barW, 7);
        ctx.fillStyle = bRatio > 0.8 ? c.rose : c.accent;
        ctx.fillRect(midX + 12, cy + 33, barW * bRatio, 7);

        ctx.fillStyle = overMem ? c.rose : c.emerald;
        ctx.font = '600 10.5px "JetBrains Mono Variable", monospace';
        ctx.fillText(`Daemon RSS: ~${Math.round(s.rssMb)} MiB`, midX + 12, cy + 56);

        // Right: Phone
        drawNode(
          rightX,
          cy - 54,
          boxW,
          108,
          "Phone Client",
          cfg.phoneVisible ? (cfg.linkSpeed === "tunnel" ? "Offline / stalled" : "Visible · live") : "Screen locked",
          !cfg.phoneVisible ? c.amber : cfg.linkSpeed === "tunnel" ? c.rose : c.emerald,
        );
        ctx.fillStyle = c.muted;
        ctx.font = '500 10px "JetBrains Mono Variable", monospace';
        ctx.fillText(`Wire: ${Math.round(s.wireKb)} KB`, rightX + 12, cy + 32);

        ctx.restore();
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, reducedMotion]);

  return (
    <LabStage
      stageRef={stageRef}
      kicker="Lab 02 · Live 60fps Canvas"
      title="Cellular Back-Pressure, Prefix Deltas & the 123× Oscillation Bug"
      metrics={
        <>
          <MetricPill label="Wire" value={`${hud.wireKb} KB`} tone="cyan" />
          <MetricPill label="RSS" value={`${hud.rssMb} MiB`} tone={hud.rssMb > 60 ? "rose" : "emerald"} />
          {bpMode === "clear-only" ? (
            <MetricPill label="Oscillations" value={hud.oscillations} tone={hud.oscillations > 0 ? "rose" : "neutral"} />
          ) : (
            <MetricPill
              label="Watcher"
              value={hud.watcherParked ? "Parked" : "Streaming"}
              tone={hud.watcherParked ? "emerald" : "accent"}
            />
          )}
        </>
      }
      controls={
        <>
          <Segmented
            label="Wire encoding"
            value={encoding}
            onChange={setEncoding}
            options={[
              { value: "full", label: "Full Snapshots (57.8×)" },
              { value: "delta", label: "UTF-16 Deltas (6.0×)" },
            ]}
          />
          <Segmented
            label="Back-pressure strategy"
            value={bpMode}
            onChange={(v) => {
              setBpMode(v);
              resetSim();
            }}
            options={[
              { value: "unbounded", label: "Unbounded" },
              { value: "clear-only", label: "Clear-Only (Bug)" },
              { value: "three-ceiling", label: "3-Ceiling + Stall Latch" },
            ]}
          />
          <Segmented
            label="Network condition"
            value={linkSpeed}
            onChange={setLinkSpeed}
            options={[
              { value: "wifi", label: "Wi-Fi / 5G" },
              { value: "cellular", label: "Slow 3G" },
              { value: "tunnel", label: "Tunnel Drop" },
            ]}
          />
          <Toggle
            label={phoneVisible ? "Phone: Visible" : "Phone: Locked"}
            checked={phoneVisible}
            onChange={setPhoneVisible}
          />
          <ActionButton variant="danger" onClick={triggerBurst}>
            <Zap size={13} />
            150 MiB Burst
          </ActionButton>
          <ActionButton variant="primary" onClick={() => setRunning((r) => !r)}>
            {running ? <Pause size={13} /> : <Play size={13} />}
            {running ? "Pause" : "Run"}
          </ActionButton>
          <ActionButton onClick={resetSim}>
            <RotateCcw size={13} />
            Reset
          </ActionButton>
        </>
      }
      caption={
        <>
          <strong>Try breaking it:</strong> Switch to <strong>Clear-Only (Bug)</strong>, select <strong>Tunnel Drop</strong>,
          and click <strong>150 MiB Burst</strong>. Watch the queue drop to one tiny <code>resync</code> frame, immediately reopen
          headroom, and oscillate while daemon RSS spikes. Then switch to <strong>3-Ceiling + Stall Latch</strong> or toggle{" "}
          <strong>Phone: Locked</strong> to see the watcher park at <strong>0 MiB</strong> growth.
        </>
      }
    >
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "220px", display: "block" }}
        aria-label="Live animated packet flow from watcher to WsHub bounded queue to phone client"
      />
    </LabStage>
  );
}
