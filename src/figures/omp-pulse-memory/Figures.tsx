import { Pause, Play, RotateCcw, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  CanvasStage,
  clamp,
  drawLabel,
  drawPillBadge,
  drawSparkline,
  fillRoundRect,
} from "../../runtime";
import { ChipButton, Figure, HoldButton, IconButton, Toggle } from "../../ui";
import {
  createBackpressureSim,
  createDeltaWireSim,
  createMemoryPool,
  createTailRace,
  DAEMON_MB,
  DEMO_CHATS,
  emitWireUpdate,
  FILE_SIZE_MB,
  FULL_SCAN_MS,
  GATE_NORM_X,
  getPoolTotalMb,
  getTailRaceSnapshot,
  openPoolChat,
  POOL_CAP,
  replyInPoolChat,
  resetBackpressureSim,
  restartTailRace,
  setPoolStrategy,
  stepBackpressureSim,
  stepDeltaWire,
  stepMemoryPool,
  stepTailRace,
  TAIL_READ_KB,
  TAIL_SEEK_MS,
  type BackpressureMode,
  type PoolStrategy,
  type PrefixDelta,
} from "./model";

/* ==========================================================================
   Figure 1: True-Scale 20:1 Memory Grid (14 MB daemon = 1 cell, 281 MB = 20)
   ========================================================================== */

export function MemoryGridFigure() {
  // Start in eager mode (3 open chats = 857 MB) so the 20:1 contrast is immediate,
  // then switching to Lazy pool drops RSS straight down to 14 MB.
  const simRef = useRef(createMemoryPool("eager"));
  const [strategy, setStrategy] = useState<PoolStrategy>("eager");
  const [selectedChat, setSelectedChat] = useState<string>(DEMO_CHATS[0]);
  const [caption, setCaption] = useState<string>(simRef.current.lastEvent);
  const lastRetargetSlotRef = useRef<{ slot: number; age: number } | null>(null);
  const [, bump] = useState(0);

  const syncUi = () => {
    setSelectedChat(simRef.current.selectedChat);
    setCaption(simRef.current.lastEvent);
    bump((n) => n + 1);
  };

  const handleStrategy = (next: PoolStrategy) => {
    setStrategy(next);
    lastRetargetSlotRef.current = null;
    setPoolStrategy(simRef.current, next);
    syncUi();
  };

  const handleChat = (chat: string) => {
    openPoolChat(simRef.current, chat);
    syncUi();
  };

  const handleReply = () => {
    const prevRetargets = simRef.current.retargets;
    replyInPoolChat(simRef.current);
    if (simRef.current.retargets > prevRetargets) {
      const reused = simRef.current.workers[simRef.current.workers.length - 1];
      lastRetargetSlotRef.current = { slot: reused.physicalSlot, age: 0 };
    }
    syncUi();
  };

  const handleReset = () => {
    simRef.current = createMemoryPool(strategy);
    lastRetargetSlotRef.current = null;
    syncUi();
  };

  return (
    <Figure
      caption={caption}
      controls={
        <>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0.35rem" }}>
            {DEMO_CHATS.map((chat) => (
              <ChipButton key={chat} active={selectedChat === chat} onClick={() => handleChat(chat)}>
                {chat}
              </ChipButton>
            ))}
            {strategy === "lazy" && (
              <ChipButton accent onClick={handleReply} label={`Reply in ${selectedChat}`}>
                <Send size={12} />
                Reply
              </ChipButton>
            )}
          </div>
          <Toggle
            label="Worker pool mode"
            value={strategy}
            onChange={handleStrategy}
            options={[
              { value: "eager", label: "Always spawn" },
              { value: "lazy", label: "Lazy pool (max 3)" },
            ]}
          />
          <IconButton label="Reset memory pool" onClick={handleReset}>
            <RotateCcw size={14} />
          </IconButton>
        </>
      }
    >
      <CanvasStage
        height={(w) => (w < 480 ? 204 : 196)}
        label="True 20 to 1 proportional memory visualization comparing the 14 MB daemon to 281 MB worker blocks"
        onFrame={({ ctx, width, height, dt, theme }) => {
          const sim = simRef.current;
          stepMemoryPool(sim, dt);
          if (lastRetargetSlotRef.current && dt > 0) {
            lastRetargetSlotRef.current.age += dt;
            if (lastRetargetSlotRef.current.age > 2.2) lastRetargetSlotRef.current = null;
          }

          ctx.clearRect(0, 0, width, height);

          const compact = width < 480;
          const padX = compact ? 12 : 20;
          const hudH = 34;
          const totalMb = getPoolTotalMb(sim);

          ctx.fillStyle = theme.surfaceSub;
          ctx.fillRect(0, 0, width, hudH);
          ctx.beginPath();
          ctx.moveTo(0, hudH + 0.5);
          ctx.lineTo(width, hudH + 0.5);
          ctx.strokeStyle = theme.line;
          ctx.lineWidth = 1;
          ctx.stroke();

          drawLabel(ctx, compact ? "1 sq = 14 MB (20:1)" : "1 square = 14 MB  ·  true 20:1 scale", padX, hudH / 2, {
            color: theme.muted,
            font: theme.fontSans,
            size: compact ? 10.5 : 11.5,
          });
          drawLabel(ctx, `${totalMb.toLocaleString()} MB total`, width - padX, hudH / 2, {
            color: totalMb > 900 ? theme.crimson : sim.strategy === "lazy" ? theme.sage : theme.copper,
            font: theme.fontMono,
            size: compact ? 11 : 12,
            weight: 600,
            align: "right",
          });

          const slotsToShow = sim.strategy === "lazy" ? POOL_CAP : Math.max(3, sim.workers.length);
          const daemonSpan = compact ? 46 : 58;
          const gapBetweenBlocks = compact ? (slotsToShow > 3 ? 10 : 14) : 18;
          const availW = width - padX * 2 - daemonSpan;
          const maxBlockW = (availW - gapBetweenBlocks * (slotsToShow - 1)) / slotsToShow;
          const cellPitch = Math.min(18, Math.max(8, Math.floor(maxBlockW / 4)));
          const cellGap = cellPitch <= 9 ? 2 : 3;
          const cellSize = cellPitch - cellGap;
          const blockW = cellPitch * 4 - cellGap;
          const blockH = cellPitch * 5 - cellGap;

          const workersW = slotsToShow * blockW + (slotsToShow - 1) * gapBetweenBlocks;
          const startX = Math.max(padX, Math.round((width - (daemonSpan + workersW)) / 2));
          const bodyMidY = hudH + (height - hudH - 34) / 2;
          const gridTop = Math.round(bodyMidY - blockH / 2);

          // Single 14 MB sage daemon square on left
          const daemonX = startX + Math.round((daemonSpan - 18 - cellSize) / 2);
          const daemonY = gridTop + blockH - cellSize;
          fillRoundRect(ctx, daemonX, daemonY, cellSize, cellSize, 2.5, theme.sage);
          drawLabel(ctx, "Daemon", daemonX + cellSize / 2, gridTop + blockH + 15, {
            color: theme.sage,
            font: theme.fontSans,
            size: compact ? 10 : 11,
            weight: 600,
            align: "center",
          });
          drawLabel(ctx, `${DAEMON_MB} MB`, daemonX + cellSize / 2, gridTop + blockH + 28, {
            color: theme.dim,
            font: theme.fontMono,
            size: 9.5,
            align: "center",
          });

          // Hairline divider between daemon and worker arena
          const arenaX = startX + daemonSpan;
          ctx.beginPath();
          ctx.moveTo(arenaX - (compact ? 10 : 16), gridTop - 4);
          ctx.lineTo(arenaX - (compact ? 10 : 16), gridTop + blockH + 4);
          ctx.strokeStyle = theme.line;
          ctx.lineWidth = 1;
          ctx.stroke();

          for (let s = 0; s < slotsToShow; s++) {
            const bx = arenaX + s * (blockW + gapBetweenBlocks);
            const worker = sim.workers.find((w) => w.physicalSlot === s);

            ctx.save();
            ctx.setLineDash([4, 4]);
            fillRoundRect(ctx, bx - 4, gridTop - 4, blockW + 8, blockH + 8, 7, undefined, theme.line, 1);
            ctx.restore();

            if (!worker) {
              drawLabel(ctx, compact ? "Idle" : "Idle slot", bx + blockW / 2, gridTop + blockH / 2, {
                color: theme.dim,
                font: theme.fontSans,
                size: 10.5,
                align: "center",
              });
              continue;
            }

            const sc = Math.max(0.05, worker.scale.value);
            const cx = bx + blockW / 2;
            const cy = gridTop + blockH / 2;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(sc, sc);
            ctx.translate(-cx, -cy);

            const baseFill = sim.strategy === "lazy" ? theme.teal : theme.copper;
            for (let r = 0; r < 5; r++) {
              for (let c = 0; c < 4; c++) {
                const x = bx + c * cellPitch;
                const y = gridTop + r * cellPitch;
                fillRoundRect(ctx, x, y, cellSize, cellSize, 2.5, baseFill);
              }
            }

            if (worker.flash > 0.02) {
              ctx.globalAlpha = worker.flash * 0.9;
              fillRoundRect(ctx, bx - 4, gridTop - 4, blockW + 8, blockH + 8, 7, undefined, theme.ink, 1.6);
              ctx.globalAlpha = 1;
            }
            ctx.restore();

            if (lastRetargetSlotRef.current && lastRetargetSlotRef.current.slot === s) {
              drawPillBadge(ctx, "59 ms", cx, gridTop - 11, {
                bg: theme.sageBg,
                stroke: theme.sage,
                color: theme.sage,
                font: theme.fontMono,
                size: 9.5,
                padX: 6,
                height: 16,
              });
            }

            const shortChat = compact && slotsToShow > 3 ? worker.chat.replace("Chat ", "C") : worker.chat;
            drawLabel(ctx, shortChat, cx, gridTop + blockH + 15, {
              color: theme.ink,
              font: theme.fontSans,
              size: compact && slotsToShow > 3 ? 10 : 11,
              weight: 500,
              align: "center",
            });
            drawLabel(ctx, compact && slotsToShow > 4 ? "281M" : "281 MB", cx, gridTop + blockH + 28, {
              color: theme.dim,
              font: theme.fontMono,
              size: 9.5,
              align: "center",
            });
          }
        }}
      />
    </Figure>
  );
}

/* ==========================================================================
   Figure 2: Real-Time 62:1 Scaled File Race + Interactive Timeline Scrub
   ========================================================================== */

export function TailRaceFigure() {
  const raceRef = useRef(createTailRace());
  const hasAutoStartedRef = useRef(false);
  const draggingRef = useRef(false);
  const lastRunningRef = useRef(true);
  const [paused, setPaused] = useState(false);

  const replay = () => {
    restartTailRace(raceRef.current);
    lastRunningRef.current = true;
    setPaused(false);
  };

  const freezeAtTailFinish = () => {
    raceRef.current.elapsedRealMs = TAIL_SEEK_MS;
    raceRef.current.running = false;
    lastRunningRef.current = false;
    setPaused(true);
  };

  const togglePlay = () => {
    if (raceRef.current.elapsedRealMs >= FULL_SCAN_MS - 0.05) {
      replay();
      return;
    }
    const nextPaused = !paused;
    setPaused(nextPaused);
    raceRef.current.running = !nextPaused;
    lastRunningRef.current = !nextPaused;
  };

  const scrubToX = (x: number, width: number) => {
    const padX = width < 480 ? 14 : 20;
    const norm = clamp((x - padX) / Math.max(40, width - padX * 2), 0, 1);
    raceRef.current.elapsedRealMs = norm * FULL_SCAN_MS;
    raceRef.current.running = false;
    setPaused(true);
  };

  return (
    <Figure
      caption="Both read heads share the exact same 60x slow-motion clock. Drag across the track to scrub time, or freeze right at 0.59 ms."
      controls={
        <>
          <IconButton accent label={paused ? "Play race" : "Pause race"} onClick={togglePlay}>
            {paused ? <Play size={14} /> : <Pause size={14} />}
          </IconButton>
          <ChipButton onClick={freezeAtTailFinish}>Freeze at 0.59 ms</ChipButton>
          <IconButton label="Replay file read race" onClick={replay}>
            <RotateCcw size={14} />
          </IconButton>
        </>
      }
    >
      <CanvasStage
        height={186}
        cursor="ew-resize"
        touchAction="pan-y"
        label="Real-time scaled race comparing reading a 44 MB file from start in 36.4 ms versus seeking from the end in 0.59 ms"
        onVisibleChange={(vis) => {
          if (vis && !hasAutoStartedRef.current) {
            hasAutoStartedRef.current = true;
            restartTailRace(raceRef.current);
            setPaused(false);
          }
        }}
        onPointerDown={(p) => {
          draggingRef.current = true;
          scrubToX(p.x, p.width);
        }}
        onPointerMove={(p) => {
          if (!draggingRef.current) return;
          scrubToX(p.x, p.width);
        }}
        onPointerUp={() => {
          draggingRef.current = false;
        }}
        onPointerLeave={() => {
          draggingRef.current = false;
        }}
        onFrame={({ ctx, width, height, dt, theme }) => {
          stepTailRace(raceRef.current, dt);
          if (lastRunningRef.current && !raceRef.current.running) {
            lastRunningRef.current = false;
            window.queueMicrotask(() => setPaused(true));
          }
          const snap = getTailRaceSnapshot(raceRef.current);
          ctx.clearRect(0, 0, width, height);

          const compact = width < 480;
          const padX = compact ? 14 : 20;
          const hudH = 34;

          ctx.fillStyle = theme.surfaceSub;
          ctx.fillRect(0, 0, width, hudH);
          ctx.beginPath();
          ctx.moveTo(0, hudH + 0.5);
          ctx.lineTo(width, hudH + 0.5);
          ctx.strokeStyle = theme.line;
          ctx.lineWidth = 1;
          ctx.stroke();

          drawLabel(ctx, compact ? "60x slow-mo clock" : "Shared 60x slow-motion clock", padX, hudH / 2, {
            color: theme.muted,
            font: theme.fontSans,
            size: compact ? 10.5 : 11.5,
          });
          drawLabel(
            ctx,
            `t = ${raceRef.current.elapsedRealMs.toFixed(2)} / ${FULL_SCAN_MS.toFixed(1)} ms`,
            width - padX,
            hudH / 2,
            {
              color: theme.ink,
              font: theme.fontMono,
              size: compact ? 10.5 : 11.5,
              weight: 600,
              align: "right",
            },
          );

          const trackW = width - padX * 2;
          const trackH = 26;
          const lanes = [
            {
              y: hudH + 34,
              title: "Read whole file",
              color: theme.copper,
              bg: theme.copperBg,
              stat: `${snap.fullMbRead.toFixed(1)} MB  |  ${snap.fullMs.toFixed(1)} ms`,
              done: snap.fullDone,
              isTail: false,
            },
            {
              y: hudH + 98,
              title: "Seek from end",
              color: theme.sage,
              bg: theme.sageBg,
              stat: `${Math.round(snap.tailKbRead)} KB  |  ${snap.tailMs.toFixed(2)} ms`,
              done: snap.tailDone,
              isTail: true,
            },
          ];

          for (const lane of lanes) {
            drawLabel(ctx, lane.title, padX, lane.y - 13, {
              color: lane.color,
              font: theme.fontSans,
              size: compact ? 11.5 : 12,
              weight: 600,
            });
            drawLabel(ctx, lane.stat, width - padX, lane.y - 13, {
              color: lane.done ? lane.color : theme.muted,
              font: theme.fontMono,
              size: compact ? 10.8 : 11.5,
              weight: lane.done ? 600 : 500,
              align: "right",
            });

            fillRoundRect(ctx, padX, lane.y, trackW, trackH, 6, theme.bg, theme.line, 1);

            const tickCount = Math.floor(trackW / 7);
            ctx.strokeStyle = theme.line;
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.55;
            ctx.beginPath();
            for (let i = 1; i < tickCount; i++) {
              const tx = padX + (i / tickCount) * trackW;
              ctx.moveTo(tx, lane.y + 5);
              ctx.lineTo(tx, lane.y + trackH - 5);
            }
            ctx.stroke();
            ctx.globalAlpha = 1;

            const tailSliverW = Math.max(11, trackW * 0.025);
            fillRoundRect(ctx, padX + trackW - tailSliverW - 2, lane.y + 2, tailSliverW, trackH - 4, 4, theme.sageBg);

            if (!lane.isTail) {
              const sweepW = Math.max(4, snap.fullProgress * (trackW - 4));
              fillRoundRect(ctx, padX + 2, lane.y + 3, sweepW, trackH - 6, 4, lane.bg);
              const headX = padX + 2 + sweepW;
              fillRoundRect(ctx, headX - 3, lane.y - 2, 5, trackH + 4, 2.5, lane.color);
            } else {
              const tailW = Math.max(3, snap.tailProgress * tailSliverW);
              const rx = padX + trackW - 2 - tailW;
              fillRoundRect(ctx, rx, lane.y + 3, tailW, trackH - 6, 4, lane.color);

              if (snap.tailDone) {
                drawPillBadge(ctx, "62x faster", padX + trackW - tailSliverW - 46, lane.y + trackH / 2, {
                  bg: theme.sageBg,
                  stroke: theme.sage,
                  color: theme.sage,
                  font: theme.fontMono,
                  size: 10,
                  padX: 7,
                  height: 18,
                });
              }
            }
          }

          drawLabel(ctx, "0 MB", padX, height - 11, { color: theme.dim, font: theme.fontMono, size: 10 });
          drawLabel(ctx, `${FILE_SIZE_MB} MB (${TAIL_READ_KB} KB tail)`, width - padX, height - 11, {
            color: theme.dim,
            font: theme.fontMono,
            size: 10,
            align: "right",
          });
        }}
      />
    </Figure>
  );
}

/* ==========================================================================
   Figure 3: Live Type-It-Yourself UTF-16 Delta Wire + Visual Payload Diff
   ========================================================================== */

const AUTO_REPLY = "All 9 Vitest suites pass on arm64 in 0.59 ms.";

export function LiveDeltaWireFigure() {
  const simRef = useRef(createDeltaWireSim());
  const prevTextRef = useRef("");
  const [text, setText] = useState("");
  const [autoTyping, setAutoTyping] = useState(true);
  const [lastDelta, setLastDelta] = useState<PrefixDelta | null>(null);
  const [totals, setTotals] = useState({ full: 0, delta: 0 });

  const pushText = (next: string) => {
    const prev = prevTextRef.current;
    if (next === prev) return;
    const d = emitWireUpdate(simRef.current, prev, next);
    prevTextRef.current = next;
    setText(next);
    setLastDelta(d);
    setTotals({ full: simRef.current.totalFullBytes, delta: simRef.current.totalDeltaBytes });
  };

  useEffect(() => {
    if (!autoTyping) return;
    let cursor = prevTextRef.current.length;
    if (cursor >= AUTO_REPLY.length) {
      prevTextRef.current = "";
      setText("");
      cursor = 0;
    }

    const id = window.setInterval(() => {
      cursor += Math.min(3, AUTO_REPLY.length - cursor);
      pushText(AUTO_REPLY.slice(0, cursor));
      if (cursor >= AUTO_REPLY.length) {
        setAutoTyping(false);
        window.clearInterval(id);
      }
    }, 185);
    return () => window.clearInterval(id);
  }, [autoTyping]);

  const restart = () => {
    simRef.current = createDeltaWireSim();
    prevTextRef.current = "";
    setText("");
    setLastDelta(null);
    setTotals({ full: 0, delta: 0 });
    setAutoTyping(true);
  };

  const triggerAppend = () => {
    setAutoTyping(false);
    const cur = prevTextRef.current || "All tests pass";
    pushText(cur.length > 96 ? cur.slice(0, 60) + " ok" : cur + " ok");
  };

  const triggerMiddleEdit = () => {
    setAutoTyping(false);
    const cur = prevTextRef.current || AUTO_REPLY;
    if (cur.includes("Vitest")) pushText(cur.replace("Vitest", "Cargo"));
    else if (cur.includes("Cargo")) pushText(cur.replace("Cargo", "Vitest"));
    else pushText(cur.slice(0, Math.floor(cur.length / 2)) + " [edited] " + cur.slice(Math.floor(cur.length / 2)));
  };

  const triggerEmojiSwap = () => {
    setAutoTyping(false);
    const cur = prevTextRef.current || "Pulse live ";
    if (cur.includes("🚀")) pushText(cur.replace("🚀", "🎉"));
    else if (cur.includes("🎉")) pushText(cur.replace("🎉", "🚀"));
    else pushText(`${cur.trimEnd()} 🚀`);
  };

  const ratio = totals.delta > 0 ? totals.full / totals.delta : 1;
  const keptPrefix = lastDelta ? text.slice(0, lastDelta.keep) : "";
  const shownKept = keptPrefix.length > 22 ? `...${keptPrefix.slice(-20)}` : keptPrefix;
  const shownAppend =
    lastDelta && lastDelta.append.length > 20
      ? `${lastDelta.append.slice(0, 18)}...`
      : lastDelta?.append ?? "";

  return (
    <Figure
      controls={
        <>
          <ChipButton onClick={triggerAppend}>Append token</ChipButton>
          <ChipButton onClick={triggerMiddleEdit}>Edit middle</ChipButton>
          <ChipButton onClick={triggerEmojiSwap}>Swap emoji 🚀 / 🎉</ChipButton>
        </>
      }
      caption={
        lastDelta
          ? `Last frame: keep ${lastDelta.keep} UTF-16 units (${lastDelta.deltaBytes} B delta vs ${lastDelta.fullBytes} B full). Cumulative: ${ratio.toFixed(1)}x smaller.`
          : "Type above or tap a quick edit below to send live packets through the real UTF-16 delta encoder."
      }
    >
      <div className="toy-row">
        <input
          type="text"
          className="toy-input"
          value={text}
          maxLength={120}
          placeholder="Type anything here (try editing or adding an emoji)..."
          aria-label="Live streaming reply text"
          onChange={(e) => {
            setAutoTyping(false);
            pushText(e.target.value);
          }}
        />
        <IconButton
          accent
          label={autoTyping ? "Pause auto-typing" : "Auto-type sample reply"}
          onClick={() => setAutoTyping((v) => !v)}
        >
          {autoTyping ? <Pause size={14} /> : <Play size={14} />}
        </IconButton>
        <IconButton label="Clear wire counters" onClick={restart}>
          <RotateCcw size={14} />
        </IconButton>
      </div>

      <CanvasStage
        height={138}
        label="Two live wires showing growing copper full-resend packets versus tiny constant sage delta packets"
        onFrame={({ ctx, width, dt, theme }) => {
          const sim = simRef.current;
          stepDeltaWire(sim, dt);
          ctx.clearRect(0, 0, width, 138);

          const padX = width < 480 ? 14 : 20;
          const wireLeft = padX;
          const wireRight = width - padX;
          const wireW = wireRight - wireLeft;

          const drawLane = (y: number, label: string, bytes: number, color: string, lane: "full" | "delta") => {
            drawLabel(ctx, label, padX, y - 19, {
              color,
              font: theme.fontSans,
              size: 12,
              weight: 600,
            });
            drawLabel(ctx, `${bytes.toLocaleString()} B`, width - padX, y - 19, {
              color: theme.ink,
              font: theme.fontMono,
              size: 11.5,
              weight: 600,
              align: "right",
            });

            ctx.beginPath();
            ctx.moveTo(wireLeft, y);
            ctx.lineTo(wireRight, y);
            ctx.strokeStyle = theme.line;
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = theme.lineStrong;
            ctx.beginPath();
            ctx.arc(wireLeft, y, 3.5, 0, Math.PI * 2);
            ctx.arc(wireRight, y, 3.5, 0, Math.PI * 2);
            ctx.fill();

            ctx.save();
            ctx.beginPath();
            ctx.rect(wireLeft, y - 14, wireW, 28);
            ctx.clip();

            for (const p of sim.packets) {
              if (p.lane !== lane) continue;
              const px = wireLeft + p.x * (wireW + p.widthPx) - p.widthPx;
              const ph = lane === "full" ? 16 : 12;
              fillRoundRect(ctx, px, y - ph / 2, p.widthPx, ph, 4, color);
            }
            ctx.restore();
          };

          drawLane(44, "Full resends", sim.totalFullBytes, theme.copper, "full");
          drawLane(106, "Prefix deltas", sim.totalDeltaBytes, theme.sage, "delta");
        }}
      />

      {lastDelta ? (
        <div className="delta-preview-bar" aria-live="polite">
          <span>
            <span className="delta-token-keep">keep({lastDelta.keep}): "{shownKept}"</span>{" "}
            <span className="delta-token-append">+ "{shownAppend}"</span>
          </span>
          <span>
            {lastDelta.deltaBytes} B vs {lastDelta.fullBytes} B ({ratio.toFixed(1)}x saved)
          </span>
        </div>
      ) : null}
    </Figure>
  );
}

/* ==========================================================================
   Figure 4: Hold-to-Lose-Signal Back-Pressure Particle Pipe
   ========================================================================== */

export function BackpressurePipeFigure() {
  const simRef = useRef(createBackpressureSim("latch"));
  const [mode, setMode] = useState<BackpressureMode>("latch");
  const [offline, setOffline] = useState(false);
  const phoneBoxRef = useRef({ x: 0, y: 0, w: 0, h: 0 });

  const handleMode = (next: BackpressureMode) => {
    setMode(next);
    resetBackpressureSim(simRef.current, next);
  };

  const handleHold = (held: boolean) => {
    setOffline(held);
    simRef.current.offline = held;
  };

  const handleReset = () => {
    setOffline(false);
    simRef.current.offline = false;
    resetBackpressureSim(simRef.current, mode);
  };

  return (
    <Figure
      caption="Press and hold Lose signal (or tap the Phone box directly) to simulate losing reception in a tunnel."
      controls={
        <>
          <HoldButton
            label="Hold: Lose signal"
            activeLabel="Phone offline (release to reconnect)"
            held={offline}
            onHoldChange={handleHold}
          />
          <Toggle
            label="Backpressure strategy"
            value={mode}
            onChange={handleMode}
            options={[
              { value: "clear", label: "Clear queue" },
              { value: "latch", label: "Stall latch" },
            ]}
          />
          <IconButton label="Reset pipe simulation" onClick={handleReset}>
            <RotateCcw size={14} />
          </IconButton>
        </>
      }
    >
      <CanvasStage
        height={(w) => (w < 480 ? 232 : 196)}
        cursor="pointer"
        touchAction="pan-y"
        label="Interactive 60fps particle pipeline showing back-pressure, swinging intake gate, buffer tank, and live memory sparkline"
        onPointerDown={(p) => {
          const b = phoneBoxRef.current;
          if (p.x >= b.x - 8 && p.x <= b.x + b.w + 8 && p.y >= b.y - 8 && p.y <= b.y + b.h + 8) {
            handleHold(!simRef.current.offline);
          }
        }}
        onFrame={({ ctx, width, height, dt, theme }) => {
          const sim = simRef.current;
          stepBackpressureSim(sim, dt);
          ctx.clearRect(0, 0, width, height);

          const compact = width < 480;
          const padX = compact ? 12 : 20;
          const midY = compact ? 76 : 74;

          // Generous pipe clearance on both 390px mobile and wide desktop
          const nodeW = compact ? 62 : Math.min(88, Math.max(72, width * 0.135));
          const nodeH = compact ? 52 : 56;
          const leftX = padX;
          const rightX = width - padX - nodeW;

          const tankW = compact ? Math.min(120, Math.max(96, width * 0.34)) : Math.min(210, Math.max(150, width * 0.34));
          const tankH = compact ? 62 : 68;
          const tankX = Math.round((width - tankW) / 2) + (compact ? 4 : 8);
          const tankY = midY - tankH / 2;

          const intakeStart = leftX + nodeW;
          const intakeEnd = tankX;
          const drainStart = tankX + tankW;
          const drainEnd = rightX;

          // Intake pipe
          ctx.beginPath();
          ctx.moveTo(intakeStart, midY);
          ctx.lineTo(intakeEnd, midY);
          ctx.strokeStyle = theme.lineStrong;
          ctx.lineWidth = 3;
          ctx.stroke();

          // Output pipe (dashed crimson while phone is offline)
          ctx.save();
          if (sim.offline) ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(drainStart, midY);
          ctx.lineTo(drainEnd, midY);
          ctx.strokeStyle = sim.offline ? theme.crimson : theme.lineStrong;
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.restore();

          // Moving particles
          for (const p of sim.particles) {
            ctx.save();
            ctx.globalAlpha = Math.max(0, p.opacity);
            let px = 0;
            const py = midY + p.yOffset;
            let color = theme.copper;

            if (p.phase === "intake" || p.phase === "bounce") {
              px = intakeStart + p.x * (intakeEnd - intakeStart);
              color = p.phase === "bounce" ? theme.dim : theme.copper;
            } else {
              px = drainStart + p.x * (drainEnd - drainStart);
              color = theme.sage;
            }

            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(px, py, compact ? 4.4 : 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }

          // Swinging intake gate (exact GATE_NORM_X shared with physics bounce!)
          const gateX = intakeStart + (intakeEnd - intakeStart) * GATE_NORM_X;
          const gatePivotY = midY - 26;
          const rad = (sim.gateAngle.value * Math.PI) / 180;
          ctx.save();
          ctx.translate(gateX, gatePivotY);
          ctx.rotate(rad);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(0, 36);
          ctx.strokeStyle = sim.latched ? theme.sage : theme.muted;
          ctx.lineWidth = 3.8;
          ctx.lineCap = "round";
          ctx.stroke();
          ctx.restore();

          ctx.fillStyle = theme.ink;
          ctx.beginPath();
          ctx.arc(gateX, gatePivotY, 3.8, 0, Math.PI * 2);
          ctx.fill();

          drawLabel(ctx, sim.latched ? "Closed" : "Open", gateX, gatePivotY - 13, {
            color: sim.latched ? theme.sage : theme.muted,
            font: theme.fontSans,
            size: 10.5,
            weight: 600,
            align: "center",
          });

          // Watcher node
          const watcherBorder = sim.latched ? theme.sage : theme.lineStrong;
          fillRoundRect(ctx, leftX, midY - nodeH / 2, nodeW, nodeH, 9, theme.surfaceSub, watcherBorder, 1.3);
          drawLabel(ctx, "Watcher", leftX + nodeW / 2, midY - 7, {
            color: sim.latched ? theme.muted : theme.ink,
            font: theme.fontSans,
            size: compact ? 11 : 12,
            weight: 600,
            align: "center",
          });
          drawLabel(ctx, sim.latched ? "paused" : "reading", leftX + nodeW / 2, midY + 10, {
            color: sim.latched ? theme.sage : theme.dim,
            font: theme.fontSans,
            size: compact ? 9.8 : 10.5,
            align: "center",
          });

          // Buffer tank
          const tankBorder =
            sim.flash > 0.1 || (sim.mode === "clear" && sim.overflows > 1)
              ? theme.crimson
              : sim.latched
                ? theme.sage
                : theme.lineStrong;
          fillRoundRect(ctx, tankX, tankY, tankW, tankH, 10, theme.bg, tankBorder, 1.5);

          const slotGap = compact ? 4 : 6;
          const innerPad = compact ? 8 : 10;
          const slotW = (tankW - innerPad * 2 - slotGap * (sim.capacity - 1)) / sim.capacity;
          for (let i = 0; i < sim.capacity; i++) {
            const active = i < sim.queueFill;
            const isResync = i === 0 && sim.overflows > 0 && sim.queueFill === 1;
            const sx = tankX + innerPad + i * (slotW + slotGap);
            const sh = active ? tankH - 20 : 6;
            const sy = tankY + tankH - 10 - sh;
            const fill = !active
              ? theme.line
              : isResync
                ? sim.mode === "latch"
                  ? theme.sage
                  : theme.crimson
                : theme.copper;
            fillRoundRect(ctx, sx, sy, slotW, sh, 3.5, fill);
          }

          if (sim.overflows > 0 && sim.queueFill === 1) {
            drawLabel(ctx, "1 resync", tankX + tankW / 2 + 10, tankY + tankH / 2, {
              color: sim.mode === "latch" ? theme.sage : theme.crimson,
              font: theme.fontMono,
              size: compact ? 9.5 : 10.5,
              weight: 600,
              align: "center",
            });
          }

          // Phone node (directly tappable!)
          const phoneY = midY - nodeH / 2;
          phoneBoxRef.current = { x: rightX, y: phoneY, w: nodeW, h: nodeH };
          fillRoundRect(
            ctx,
            rightX,
            phoneY,
            nodeW,
            nodeH,
            9,
            sim.offline ? theme.crimsonBg : theme.surfaceSub,
            sim.offline ? theme.crimson : theme.lineStrong,
            1.35,
          );
          drawLabel(ctx, "Phone", rightX + nodeW / 2, midY - 7, {
            color: theme.ink,
            font: theme.fontSans,
            size: compact ? 11 : 12,
            weight: 600,
            align: "center",
          });
          drawLabel(ctx, sim.offline ? "offline" : "online", rightX + nodeW / 2, midY + 10, {
            color: sim.offline ? theme.crimson : theme.sage,
            font: theme.fontSans,
            size: compact ? 9.8 : 10.5,
            weight: 600,
            align: "center",
          });

          // Bottom memory sparkline band: full-width dedicated strip on mobile, clean right-aligned on desktop
          const memColor = sim.rssMb > 40 ? theme.crimson : theme.sage;
          if (compact) {
            const bandTop = 136;
            ctx.beginPath();
            ctx.moveTo(padX, bandTop);
            ctx.lineTo(width - padX, bandTop);
            ctx.strokeStyle = theme.line;
            ctx.lineWidth = 1;
            ctx.stroke();

            drawLabel(ctx, `Overflows: ${sim.overflows}`, padX, bandTop + 18, {
              color: sim.overflows > 1 ? theme.crimson : theme.muted,
              font: theme.fontMono,
              size: 11,
              weight: 500,
            });
            drawLabel(ctx, `Daemon RSS: ${sim.rssMb} MB`, width - padX, bandTop + 18, {
              color: memColor,
              font: theme.fontMono,
              size: 11,
              weight: 600,
              align: "right",
            });

            drawSparkline(
              ctx,
              sim.rssHistory,
              padX,
              bandTop + 34,
              width - padX * 2,
              46,
              340,
              memColor,
              sim.rssMb > 40 ? theme.crimsonBg : theme.sageBg,
            );
          } else {
            const sparkY = height - 42;
            const sparkW = Math.min(240, width * 0.38);
            const sparkX = width - padX - sparkW;

            drawLabel(ctx, `Overflows: ${sim.overflows}`, padX, height - 22, {
              color: sim.overflows > 1 ? theme.crimson : theme.muted,
              font: theme.fontMono,
              size: 11.5,
              weight: 500,
            });
            drawLabel(ctx, `Daemon RSS: ${sim.rssMb} MB`, sparkX - 16, height - 22, {
              color: memColor,
              font: theme.fontMono,
              size: 11.5,
              weight: 600,
              align: "right",
            });
            drawSparkline(
              ctx,
              sim.rssHistory,
              sparkX,
              sparkY,
              sparkW,
              30,
              340,
              memColor,
              sim.rssMb > 40 ? theme.crimsonBg : theme.sageBg,
            );
          }
        }}
      />
    </Figure>
  );
}
