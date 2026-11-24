import { Pause, Play, RotateCcw, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CanvasStage, drawLabel, drawSparkline, fillRoundRect } from "../../runtime";
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
  type BackpressureMode,
  type PoolStrategy,
} from "./model";

/* ==========================================================================
   Figure 1: True-Scale 20:1 Memory Grid (14 MB daemon = 1 cell, 281 MB = 20)
   ========================================================================== */

export function MemoryGridFigure() {
  const simRef = useRef(createMemoryPool("lazy"));
  const [strategy, setStrategy] = useState<PoolStrategy>("lazy");
  const [selectedChat, setSelectedChat] = useState<string>(DEMO_CHATS[0]);
  const [caption, setCaption] = useState<string>(simRef.current.lastEvent);
  const [, bump] = useState(0);

  const syncUi = () => {
    setSelectedChat(simRef.current.selectedChat);
    setCaption(simRef.current.lastEvent);
    bump((n) => n + 1);
  };

  const handleStrategy = (next: PoolStrategy) => {
    setStrategy(next);
    setPoolStrategy(simRef.current, next);
    syncUi();
  };

  const handleChat = (chat: string) => {
    openPoolChat(simRef.current, chat);
    syncUi();
  };

  const handleReply = () => {
    replyInPoolChat(simRef.current);
    syncUi();
  };

  const handleReset = () => {
    simRef.current = createMemoryPool(strategy);
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
        height={178}
        label="True 20 to 1 proportional memory visualization comparing the 14 MB daemon to 281 MB worker blocks"
        onFrame={({ ctx, width, height, dt, theme }) => {
          const sim = simRef.current;
          stepMemoryPool(sim, dt);
          ctx.clearRect(0, 0, width, height);

          const padX = 20;
          const topY = 22;
          const totalMb = getPoolTotalMb(sim);

          // Subtle top readout inside the canvas (no heavy header chrome)
          drawLabel(ctx, "1 square = 14 MB", padX, topY, {
            color: theme.dim,
            font: theme.fontSans,
            size: 11.5,
          });
          drawLabel(ctx, `${totalMb.toLocaleString()} MB total`, width - padX, topY, {
            color: totalMb > 900 ? theme.crimson : sim.strategy === "lazy" ? theme.sage : theme.copper,
            font: theme.fontSans,
            size: 13,
            weight: 600,
            align: "right",
          });

          // True-scale geometry: 1 cell = 14 MB. Each 281 MB worker = 4 cols x 5 rows = 20 cells!
          const slotsToShow = sim.strategy === "lazy" ? POOL_CAP : Math.max(3, sim.workers.length);
          const availW = width - padX * 2 - 56;
          const gapBetweenBlocks = 16;
          const maxBlockW = (availW - gapBetweenBlocks * (slotsToShow - 1)) / slotsToShow;
          const cellPitch = Math.min(18, Math.max(10, Math.floor(maxBlockW / 4)));
          const cellSize = cellPitch - 3;
          const blockW = cellPitch * 4 - 3;
          const blockH = cellPitch * 5 - 3;

          const daemonSpan = 56;
          const workersW = slotsToShow * blockW + (slotsToShow - 1) * gapBetweenBlocks;
          const startX = Math.max(padX, Math.round((width - (daemonSpan + workersW)) / 2));
          const gridTop = Math.round((height - blockH) / 2) + 4;

          // Daemon: literally ONE single 14 MB square on the left!
          const daemonX = startX + 8;
          const daemonY = gridTop + blockH - cellSize;
          fillRoundRect(ctx, daemonX, daemonY, cellSize, cellSize, 3, theme.sage);
          drawLabel(ctx, "Daemon", daemonX + cellSize / 2, gridTop + blockH + 16, {
            color: theme.sage,
            font: theme.fontSans,
            size: 11,
            weight: 600,
            align: "center",
          });
          drawLabel(ctx, `${DAEMON_MB} MB`, daemonX + cellSize / 2, gridTop + blockH + 29, {
            color: theme.dim,
            font: theme.fontSans,
            size: 10,
            align: "center",
          });

          // Divider hairline between daemon and worker arena
          const arenaX = startX + daemonSpan;
          ctx.beginPath();
          ctx.moveTo(arenaX - 16, gridTop - 4);
          ctx.lineTo(arenaX - 16, gridTop + blockH + 4);
          ctx.strokeStyle = theme.line;
          ctx.lineWidth = 1;
          ctx.stroke();

          // Render worker slots (3 capped slots in lazy mode, or unbounded slots in eager mode)
          for (let s = 0; s < slotsToShow; s++) {
            const bx = arenaX + s * (blockW + gapBetweenBlocks);
            const worker = sim.workers[s];

            // Subtle slot outline
            ctx.save();
            ctx.setLineDash([4, 4]);
            fillRoundRect(ctx, bx - 4, gridTop - 4, blockW + 8, blockH + 8, 7, undefined, theme.line, 1);
            ctx.restore();

            if (!worker) {
              drawLabel(ctx, "Idle slot", bx + blockW / 2, gridTop + blockH / 2, {
                color: theme.dim,
                font: theme.fontSans,
                size: 11,
                align: "center",
              });
              continue;
            }

            // Draw the 20 proportional 14 MB cells for this 281 MB worker
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
                fillRoundRect(ctx, x, y, cellSize, cellSize, 3, baseFill);
              }
            }

            // Subtle retarget/spawn flash border
            if (worker.flash > 0.02) {
              ctx.globalAlpha = worker.flash * 0.85;
              fillRoundRect(ctx, bx - 4, gridTop - 4, blockW + 8, blockH + 8, 7, undefined, theme.ink, 1.5);
              ctx.globalAlpha = 1;
            }
            ctx.restore();

            drawLabel(ctx, worker.chat, bx + blockW / 2, gridTop + blockH + 16, {
              color: theme.ink,
              font: theme.fontSans,
              size: 11,
              weight: 500,
              align: "center",
            });
            drawLabel(ctx, "281 MB", bx + blockW / 2, gridTop + blockH + 29, {
              color: theme.dim,
              font: theme.fontSans,
              size: 10,
              align: "center",
            });
          }
        }}
      />
    </Figure>
  );
}

/* ==========================================================================
   Figure 2: Real-Time 62:1 Scaled File Race (Click anywhere or Replay)
   ========================================================================== */

export function TailRaceFigure() {
  const raceRef = useRef(createTailRace());

  const replay = () => {
    restartTailRace(raceRef.current);
  };

  return (
    <Figure
      caption="Both read heads run on the same 60x slow-motion clock. Click anywhere on the strip to replay."
      controls={
        <IconButton accent label="Replay file read race" onClick={replay}>
          <RotateCcw size={14} />
        </IconButton>
      }
    >
      <CanvasStage
        height={146}
        cursor="pointer"
        label="Real-time scaled race comparing reading a 44 MB file from start in 36.4 ms versus seeking from the end in 0.59 ms"
        onPointerDown={replay}
        onFrame={({ ctx, width, height, dt, theme }) => {
          stepTailRace(raceRef.current, dt);
          const snap = getTailRaceSnapshot(raceRef.current);
          ctx.clearRect(0, 0, width, height);

          const padX = 20;
          const trackW = width - padX * 2;
          const trackH = 26;
          const lanes = [
            {
              y: 34,
              title: "Read whole file",
              color: theme.copper,
              bg: theme.copperBg,
              stat: `${snap.fullMbRead.toFixed(1)} MB  |  ${snap.fullMs.toFixed(1)} ms`,
              done: snap.fullDone,
              isTail: false,
            },
            {
              y: 98,
              title: "Seek from end",
              color: theme.sage,
              bg: theme.sageBg,
              stat: `${Math.round(snap.tailKbRead)} KB  |  ${snap.tailMs.toFixed(2)} ms`,
              done: snap.tailDone,
              isTail: true,
            },
          ];

          for (const lane of lanes) {
            // Lane labels
            drawLabel(ctx, lane.title, padX, lane.y - 13, {
              color: lane.color,
              font: theme.fontSans,
              size: 12,
              weight: 600,
            });
            drawLabel(ctx, lane.stat, width - padX, lane.y - 13, {
              color: lane.done ? lane.color : theme.muted,
              font: theme.fontSans,
              size: 12,
              weight: lane.done ? 600 : 500,
              align: "right",
            });

            // 44 MB file track background
            fillRoundRect(ctx, padX, lane.y, trackW, trackH, 6, theme.bg, theme.line, 1);

            // Faint vertical JSONL record ticks across the 44 MB file
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

            // Target 70 KB tail sliver at far right (exaggerated slightly to 12px so it is visible)
            const tailSliverW = Math.max(10, trackW * 0.024);
            fillRoundRect(ctx, padX + trackW - tailSliverW - 2, lane.y + 2, tailSliverW, trackH - 4, 4, theme.sageBg);

            if (!lane.isTail) {
              const sweepW = Math.max(4, snap.fullProgress * (trackW - 4));
              fillRoundRect(ctx, padX + 2, lane.y + 3, sweepW, trackH - 6, 4, lane.bg);
              // Bright moving read head
              const headX = padX + 2 + sweepW;
              fillRoundRect(ctx, headX - 3, lane.y - 2, 5, trackH + 4, 2.5, lane.color);
            } else {
              const tailW = Math.max(3, snap.tailProgress * tailSliverW);
              const rx = padX + trackW - 2 - tailW;
              fillRoundRect(ctx, rx, lane.y + 3, tailW, trackH - 6, 4, lane.color);
            }
          }

          // Subtle scale marker at bottom
          drawLabel(ctx, `0 MB`, padX, height - 10, { color: theme.dim, font: theme.fontSans, size: 10 });
          drawLabel(ctx, `${FILE_SIZE_MB} MB (${TAIL_READ_KB} KB tail)`, width - padX, height - 10, {
            color: theme.dim,
            font: theme.fontSans,
            size: 10,
            align: "right",
          });
        }}
      />
    </Figure>
  );
}

/* ==========================================================================
   Figure 3: Live Type-It-Yourself UTF-16 Delta Wire (Toy + 60fps Canvas)
   ========================================================================== */

const AUTO_REPLY = "All 9 Vitest suites pass on arm64 in 0.59 ms.";

export function LiveDeltaWireFigure() {
  const simRef = useRef(createDeltaWireSim());
  const prevTextRef = useRef("");
  const [text, setText] = useState("");
  const [autoTyping, setAutoTyping] = useState(true);
  const [lastInfo, setLastInfo] = useState<string>("Type above to emit live packets through the real UTF-16 delta encoder.");

  const pushText = (next: string) => {
    const prev = prevTextRef.current;
    if (next === prev) return;
    const d = emitWireUpdate(simRef.current, prev, next);
    prevTextRef.current = next;
    setText(next);
    const shownAppend = d.append.length > 18 ? `${d.append.slice(0, 18)}...` : d.append;
    setLastInfo(`Last frame: keep ${d.keep}, append "${shownAppend}" (${d.deltaBytes} B delta vs ${d.fullBytes} B full)`);
  };

  // Gentle auto-typer on initial view so the wire is immediately alive; stops the instant the user types
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
    setAutoTyping(true);
  };

  return (
    <Figure caption={lastInfo}>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.65rem" }}>
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
        height={132}
        label="Two live wires showing growing copper full-resend packets versus tiny constant sage delta packets"
        onFrame={({ ctx, width, dt, theme }) => {
          const sim = simRef.current;
          stepDeltaWire(sim, dt);
          ctx.clearRect(0, 0, width, 132);

          const padX = 20;
          const wireLeft = padX;
          const wireRight = width - padX;
          const wireW = wireRight - wireLeft;

          const drawLane = (y: number, label: string, bytes: number, color: string, lane: "full" | "delta") => {
            drawLabel(ctx, label, padX, y - 18, {
              color,
              font: theme.fontSans,
              size: 12,
              weight: 600,
            });
            drawLabel(ctx, `${bytes.toLocaleString()} B`, width - padX, y - 18, {
              color: theme.ink,
              font: theme.fontSans,
              size: 12,
              weight: 600,
              align: "right",
            });

            // Wire line + terminal endpoints
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

            // Packets clipped cleanly inside the wire span
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

          drawLane(42, "Full resends", sim.totalFullBytes, theme.copper, "full");
          drawLane(102, "Prefix deltas", sim.totalDeltaBytes, theme.sage, "delta");
        }}
      />
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
      caption="Press and hold to simulate losing signal in a tunnel. Release to reconnect and drain."
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
        height={178}
        label="Interactive 60fps particle pipeline showing back-pressure, swinging intake gate, buffer tank, and live memory sparkline"
        onFrame={({ ctx, width, height, dt, theme }) => {
          const sim = simRef.current;
          stepBackpressureSim(sim, dt);
          ctx.clearRect(0, 0, width, height);

          const padX = 20;
          const midY = 74;

          // Proportional layout across any viewport width
          const nodeW = Math.min(84, Math.max(66, width * 0.13));
          const nodeH = 54;
          const leftX = padX;
          const rightX = width - padX - nodeW;

          const tankW = Math.min(206, Math.max(132, width * 0.34));
          const tankH = 66;
          const tankX = Math.round((width - tankW) / 2) + 8;
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

          // Particles
          for (const p of sim.particles) {
            ctx.save();
            ctx.globalAlpha = Math.max(0, p.opacity);
            let px = 0;
            let py = midY + p.yOffset;
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
            ctx.arc(px, py, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }

          // Swinging intake gate
          const gateX = intakeStart + (intakeEnd - intakeStart) * 0.72;
          const gatePivotY = midY - 26;
          const rad = (sim.gateAngle.value * Math.PI) / 180;
          ctx.save();
          ctx.translate(gateX, gatePivotY);
          ctx.rotate(rad);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(0, 38);
          ctx.strokeStyle = sim.latched ? theme.sage : theme.muted;
          ctx.lineWidth = 4;
          ctx.lineCap = "round";
          ctx.stroke();
          ctx.restore();

          ctx.fillStyle = theme.ink;
          ctx.beginPath();
          ctx.arc(gateX, gatePivotY, 4, 0, Math.PI * 2);
          ctx.fill();

          drawLabel(ctx, sim.latched ? "Closed" : "Open", gateX, gatePivotY - 13, {
            color: sim.latched ? theme.sage : theme.dim,
            font: theme.fontSans,
            size: 10.5,
            weight: 600,
            align: "center",
          });

          // Watcher node
          const watcherBorder = sim.latched ? theme.sage : theme.lineStrong;
          fillRoundRect(ctx, leftX, midY - nodeH / 2, nodeW, nodeH, 9, theme.surfaceSub, watcherBorder, 1.25);
          drawLabel(ctx, "Watcher", leftX + nodeW / 2, midY - 7, {
            color: sim.latched ? theme.muted : theme.ink,
            font: theme.fontSans,
            size: 12,
            weight: 600,
            align: "center",
          });
          drawLabel(ctx, sim.latched ? "paused" : "reading", leftX + nodeW / 2, midY + 10, {
            color: sim.latched ? theme.sage : theme.dim,
            font: theme.fontSans,
            size: 10.5,
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

          const slotGap = 6;
          const innerPad = 10;
          const slotW = (tankW - innerPad * 2 - slotGap * (sim.capacity - 1)) / sim.capacity;
          for (let i = 0; i < sim.capacity; i++) {
            const active = i < sim.queueFill;
            const isResync = i === 0 && sim.overflows > 0 && sim.queueFill === 1;
            const sx = tankX + innerPad + i * (slotW + slotGap);
            const sh = active ? tankH - 22 : 6;
            const sy = tankY + tankH - 11 - sh;
            const fill = !active
              ? theme.line
              : isResync
                ? sim.mode === "latch"
                  ? theme.sage
                  : theme.crimson
                : theme.copper;
            fillRoundRect(ctx, sx, sy, slotW, sh, 4, fill);
          }

          // Phone node
          fillRoundRect(
            ctx,
            rightX,
            midY - nodeH / 2,
            nodeW,
            nodeH,
            9,
            theme.surfaceSub,
            sim.offline ? theme.crimson : theme.lineStrong,
            1.25,
          );
          drawLabel(ctx, "Phone", rightX + nodeW / 2, midY - 7, {
            color: theme.ink,
            font: theme.fontSans,
            size: 12,
            weight: 600,
            align: "center",
          });
          drawLabel(ctx, sim.offline ? "offline" : "online", rightX + nodeW / 2, midY + 10, {
            color: sim.offline ? theme.crimson : theme.sage,
            font: theme.fontSans,
            size: 10.5,
            align: "center",
          });

          // Bottom inline memory sparkline (quietly embedded inside the canvas)
          const sparkY = height - 34;
          const sparkW = Math.min(220, width * 0.36);
          const sparkX = width - padX - sparkW;
          const memColor = sim.rssMb > 40 ? theme.crimson : theme.sage;

          drawLabel(ctx, `Overflows: ${sim.overflows}`, padX, height - 18, {
            color: sim.overflows > 1 ? theme.crimson : theme.muted,
            font: theme.fontSans,
            size: 11.5,
            weight: 500,
          });
          drawLabel(ctx, `Memory: ${sim.rssMb} MB`, sparkX - 14, height - 18, {
            color: memColor,
            font: theme.fontSans,
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
            24,
            340,
            memColor,
            sim.rssMb > 40 ? theme.crimsonBg : theme.sageBg,
          );
        }}
      />
    </Figure>
  );
}
