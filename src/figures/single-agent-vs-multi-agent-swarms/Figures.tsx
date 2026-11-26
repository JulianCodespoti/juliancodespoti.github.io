import { RotateCcw } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { CanvasStage, clamp, drawArrowHead, drawLabel, easeOutCubic, fillRoundRect } from "../../runtime";
import { Figure, IconButton, Toggle } from "../../ui";
import {
  ANSWER_CELLS,
  buildHandoffStaircase,
  createNeedleSim,
  getNeedleSignalRatio,
  NOISE_CELLS,
  resetNeedleSim,
  SPEC_CELLS,
  stepNeedleSim,
  TASK_TURNS,
  type HandoffMode,
  type NeedleMode,
} from "./model";

/* ==========================================================================
   Figure 1: Proportional Handoff Waterfall (Single Warm Loop vs 4-Role Chain)
   ========================================================================== */

export function CachePyramidFigure() {
  const [mode, setMode] = useState<HandoffMode>("swarm");
  const [inspectRow, setInspectRow] = useState<number | null>(null);
  const revealRef = useRef(TASK_TURNS);
  const rowBoundsRef = useRef<{ y: number; h: number }[]>([]);

  const data = useMemo(() => buildHandoffStaircase(mode), [mode]);
  const singleBaseline = useMemo(() => buildHandoffStaircase("single"), []);

  const switchMode = (next: HandoffMode) => {
    setMode(next);
    setInspectRow(null);
    revealRef.current = 0.05;
  };

  const replay = () => {
    revealRef.current = 0.05;
  };

  const inspected = inspectRow !== null ? data.rows[inspectRow] : null;
  const costRatio = data.totalCostCents / Math.max(0.1, singleBaseline.totalCostCents);

  return (
    <Figure
      caption={
        inspected
          ? inspected.isHandoff
            ? `Turn ${inspected.turn} (${inspected.owner}): cold handoff - new system prompt + brief + re-read files (${inspected.cells.length * 2}K cold tokens, ${inspected.turnCostCents.toFixed(1)}c).`
            : `Turn ${inspected.turn} (${inspected.owner}): ${inspected.cells.filter((c) => c === "cached").length * 2}K cached + ${inspected.cells.filter((c) => c !== "cached").length * 2}K full-price (${inspected.turnCostCents.toFixed(1)}c).`
          : mode === "single"
            ? `One continuous agent keeps its KV prefix warm across all 8 turns (${data.coldPrefillK}K uncached tokens, ${data.totalCostCents.toFixed(1)}c total). Tap or hover any row.`
            : `Each role switch breaks prefix caching and triggers a heavier cold prefill rebuild (${data.coldPrefillK}K uncached, ${costRatio.toFixed(1)}x cost of one agent).`
      }
      controls={
        <>
          <Toggle
            label="Agent topology"
            value={mode}
            onChange={switchMode}
            options={[
              { value: "single", label: "Single agent" },
              { value: "swarm", label: "4-agent swarm" },
            ]}
          />
          <IconButton accent label="Replay 8-turn task" onClick={replay}>
            <RotateCcw size={14} />
          </IconButton>
        </>
      }
    >
      <CanvasStage
        height={264}
        cursor="pointer"
        touchAction="pan-y"
        label="Proportional waterfall timeline comparing one warm single-agent prefix bar against four cold-start handoff resets across a 4-agent role swarm"
        onPointerMove={(p) => {
          if (p.pointerType !== "mouse") return;
          const idx = rowBoundsRef.current.findIndex((b) => p.y >= b.y && p.y <= b.y + b.h);
          setInspectRow(idx >= 0 ? idx : null);
        }}
        onPointerDown={(p) => {
          const idx = rowBoundsRef.current.findIndex((b) => p.y >= b.y && p.y <= b.y + b.h);
          setInspectRow((prev) => (idx >= 0 ? (prev === idx ? null : idx) : null));
        }}
        onPointerLeave={() => setInspectRow(null)}
        onFrame={({ ctx, width, height, dt, theme }) => {
          if (revealRef.current < TASK_TURNS) {
            revealRef.current = Math.min(TASK_TURNS, revealRef.current + dt * 6.5);
          }

          ctx.clearRect(0, 0, width, height);

          const compact = width < 480;
          const padX = compact ? 12 : 22;
          const hudH = 34;

          ctx.fillStyle = theme.surfaceSub;
          ctx.fillRect(0, 0, width, hudH);
          ctx.beginPath();
          ctx.moveTo(0, hudH + 0.5);
          ctx.lineTo(width, hudH + 0.5);
          ctx.strokeStyle = theme.line;
          ctx.lineWidth = 1;
          ctx.stroke();

          const visibleRows = Math.min(TASK_TURNS, Math.ceil(revealRef.current));
          let runningCost = 0;
          for (let r = 0; r < visibleRows; r++) {
            runningCost += data.rows[r].turnCostCents;
          }

          drawLabel(ctx, compact ? "8-turn token waterfall" : "8-turn prefill waterfall (proportional width)", padX, hudH / 2, {
            color: theme.muted,
            font: theme.fontSans,
            size: compact ? 10.5 : 11.5,
          });
          drawLabel(
            ctx,
            mode === "swarm"
              ? `${runningCost.toFixed(1)}c (${costRatio.toFixed(1)}x vs single)`
              : `8-turn cost: ${runningCost.toFixed(1)}c`,
            width - padX,
            hudH / 2,
            {
              color: mode === "single" ? theme.sage : theme.crimson,
              font: theme.fontMono,
              size: compact ? 10.5 : 11.5,
              weight: 600,
              align: "right",
            },
          );

          const spineW = mode === "swarm" ? (compact ? 14 : 18) : 0;
          const labelW = compact ? 66 : 82;
          const rightStatW = compact ? 40 : 76;
          const trackX = padX + spineW + labelW;
          const trackW = Math.max(80, width - padX - trackX - rightStatW);
          const maxTokensK = 28; // 14 cells * 2K max width reference

          const startY = hudH + 16;
          const barH = 16;
          const rowStep = 23;
          const bounds: { y: number; h: number }[] = [];

          // Subtle vertical 10K / 20K scale hairlines behind bars
          for (const markK of [10, 20]) {
            const mx = trackX + (markK / maxTokensK) * trackW;
            ctx.strokeStyle = theme.line;
            ctx.globalAlpha = 0.45;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(mx, startY - 4);
            ctx.lineTo(mx, startY + TASK_TURNS * rowStep - 6);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;

          for (let r = 0; r < visibleRows; r++) {
            const row = data.rows[r];
            const rowProg = easeOutCubic(clamp(revealRef.current - r, 0, 1));
            const y = startY + r * rowStep;
            bounds.push({ y: y - 3, h: rowStep });
            const isHovered = inspectRow === r;

            if (isHovered) {
              fillRoundRect(ctx, padX - 4, y - 3, width - padX * 2 + 8, barH + 6, 5, theme.surfaceSub);
            }

            // Curved handoff transfer arrow along left swimlane spine when ownership switches!
            if (row.isHandoff) {
              ctx.save();
              ctx.setLineDash([3, 3]);
              ctx.beginPath();
              ctx.moveTo(padX + spineW, y - 3.5);
              ctx.lineTo(width - padX, y - 3.5);
              ctx.strokeStyle = theme.crimson;
              ctx.globalAlpha = 0.4;
              ctx.lineWidth = 1;
              ctx.stroke();
              ctx.restore();

              const sx = padX + 4;
              const prevY = y - rowStep + barH / 2;
              const curY = y + barH / 2;
              ctx.strokeStyle = theme.crimson;
              ctx.lineWidth = 1.4;
              ctx.beginPath();
              ctx.moveTo(sx + 6, prevY);
              ctx.quadraticCurveTo(sx - 2, (prevY + curY) / 2, sx + 7, curY);
              ctx.stroke();
              drawArrowHead(ctx, sx + 9, curY, 0, 4.8, theme.crimson);
            }

            // Role owner label
            drawLabel(ctx, row.owner, padX + spineW, y + barH / 2, {
              color: isHovered ? theme.ink : row.isHandoff ? theme.crimson : theme.muted,
              font: theme.fontSans,
              size: compact ? 10.2 : 11.2,
              weight: row.isHandoff || isHovered ? 600 : 500,
            });

            // Compute proportional segment lengths (cached, cold, new)
            const cachedK = row.cells.filter((c) => c === "cached").length * 2;
            const coldK = row.cells.filter((c) => c === "cold").length * 2;
            const newK = row.cells.filter((c) => c === "new").length * 2;
            const totalK = cachedK + coldK + newK;

            const animScale = (trackW / maxTokensK) * rowProg;
            const cachedW = cachedK * animScale;
            const coldW = coldK * animScale;
            const newW = newK * animScale;
            const totalBarW = cachedW + coldW + newW;

            ctx.save();
            ctx.globalAlpha = inspectRow !== null && !isHovered ? 0.5 : 1;

            // Quiet full-track trough behind bar
            fillRoundRect(ctx, trackX, y + 1, trackW, barH - 2, 4, theme.bg);

            let cursorX = trackX;
            if (cachedW > 0.5) {
              fillRoundRect(ctx, cursorX, y, Math.max(4, cachedW - (newW > 0 ? 1.5 : 0)), barH, 4, theme.sage);
              cursorX += cachedW;
            }
            if (coldW > 0.5) {
              fillRoundRect(ctx, cursorX, y, Math.max(4, coldW), barH, 4, theme.crimson);
              // Subtle diagonal stripe texture on cold-start rebuild bars to distinguish at a glance
              ctx.save();
              ctx.beginPath();
              ctx.rect(cursorX, y, coldW, barH);
              ctx.clip();
              ctx.strokeStyle = theme.bg;
              ctx.globalAlpha = 0.22;
              ctx.lineWidth = 1.5;
              for (let sx = cursorX - barH; sx < cursorX + coldW + barH; sx += 9) {
                ctx.beginPath();
                ctx.moveTo(sx, y + barH);
                ctx.lineTo(sx + barH, y);
                ctx.stroke();
              }
              ctx.restore();
              cursorX += coldW;
            }
            if (newW > 0.5) {
              fillRoundRect(ctx, cursorX + 1.5, y, Math.max(4, newW - 1.5), barH, 4, theme.copper);
            }
            ctx.restore();

            // Crisp right-aligned token / cold-start readout
            const statX = Math.min(width - padX, trackX + totalBarW + 8);
            if (rowProg > 0.65) {
              const tag = row.isHandoff
                ? compact
                  ? `${totalK}K`
                  : `${totalK}K cold`
                : `${totalK}K`;
              drawLabel(ctx, tag, compact ? width - padX : statX, y + barH / 2, {
                color: row.isHandoff ? theme.crimson : isHovered ? theme.ink : theme.dim,
                font: theme.fontMono,
                size: compact ? 9.8 : 10.5,
                weight: row.isHandoff || isHovered ? 600 : 500,
                align: compact ? "right" : "left",
              });
            }
          }
          rowBoundsRef.current = bounds;

          // Bottom legend
          const ly = height - 14;
          let lx = padX;
          const legendGap = compact ? 14 : 26;
          for (const [label, col] of [
            ["Cached (0.1x)", theme.sage],
            [compact ? "New (1.0x)" : "New tokens (1.0x)", theme.copper],
            [compact ? "Cold (1.0x)" : "Cold handoff (1.0x)", theme.crimson],
          ] as const) {
            fillRoundRect(ctx, lx, ly - 4, 12, 7, 2.5, col);
            drawLabel(ctx, label, lx + 16, ly, {
              color: theme.dim,
              font: theme.fontSans,
              size: compact ? 10 : 10.8,
            });
            lx += ctx.measureText(label).width + legendGap + 4;
          }
        }}
      />
    </Figure>
  );
}

/* ==========================================================================
   Figure 2: Attention Dilution & Disposable Subagent Extraction (Needle Field)
   ========================================================================== */

const ANSWER_POSITIONS = new Map<number, string>([
  [19, "src/server/ws.rs:260  self.q.lock()"],
  [37, "src/server/ws.rs:300  push() acquires lock"],
  [58, "src/server/http/socket.rs:88  attach()"],
  [74, "src/sessions/watcher.rs:142  has_audience()"],
]);

const SPEC_LABELS = [
  "System rules",
  "Tool schemas",
  "Task: fix lock contention",
  "Constraint: keep API compat",
  "Constraint: no lock across .await",
  "Target: src/server/ws.rs",
  "Test: cargo test ws::",
  "Prior finding: stall latch",
];

const NOISE_SAMPLES = [
  "target/debug/... unrelated match",
  "tests/fixtures/large.jsonl:412",
  "web/dist/assets/index.js:1",
  "docs/archive/old_notes.md:88",
  "Cargo.lock:1920 checksum line",
  "node_modules/vitest/... PASS",
];

interface CellHit {
  x: number;
  y: number;
  size: number;
  label: string;
}

export function NeedleGridFigure() {
  const simRef = useRef(createNeedleSim("subagent"));
  const [mode, setMode] = useState<NeedleMode>("subagent");
  const [selectedCell, setSelectedCell] = useState<CellHit | null>(null);
  const cellHitsRef = useRef<CellHit[]>([]);

  const switchMode = (next: NeedleMode) => {
    setMode(next);
    setSelectedCell(null);
    resetNeedleSim(simRef.current, next);
  };

  const replay = () => {
    setSelectedCell(null);
    resetNeedleSim(simRef.current, mode);
  };

  const findCell = (x: number, y: number, pointerType: string) => {
    const pad = pointerType === "touch" ? 5 : 2;
    return (
      cellHitsRef.current.find(
        (c) => x >= c.x - pad && x <= c.x + c.size + pad && y >= c.y - pad && y <= c.y + c.size + pad,
      ) ?? null
    );
  };

  return (
    <Figure
      caption={
        selectedCell
          ? `Inspecting block: ${selectedCell.label}`
          : mode === "inline"
            ? "Searching inline dumps 76 noise blocks into working memory, burying your 12 signal blocks at 14% density. Tap or hover any cell."
            : "A disposable subagent absorbs 76 noise blocks in a throwaway window, hands back the 4 teal answers, and disappears. Tap or hover any cell."
      }
      controls={
        <>
          <Toggle
            label="Search isolation"
            value={mode}
            onChange={switchMode}
            options={[
              { value: "inline", label: "Search inline" },
              { value: "subagent", label: "Disposable subagent" },
            ]}
          />
          <IconButton accent label="Replay search extraction" onClick={replay}>
            <RotateCcw size={14} />
          </IconButton>
        </>
      }
    >
      <CanvasStage
        height={(w) => (w < 500 ? 296 : 226)}
        cursor="pointer"
        touchAction="pan-y"
        label="2D token grid showing how inline repo searches dilute signal cells under raw noise versus a disposable subagent extracting only the 4 answer cells"
        onPointerMove={(p) => {
          if (p.pointerType !== "mouse") return;
          setSelectedCell(findCell(p.x, p.y, p.pointerType));
        }}
        onPointerDown={(p) => {
          setSelectedCell(findCell(p.x, p.y, p.pointerType));
        }}
        onPointerLeave={() => setSelectedCell(null)}
        onFrame={({ ctx, width, height, dt, theme }) => {
          const sim = simRef.current;
          stepNeedleSim(sim, dt);
          const stats = getNeedleSignalRatio(sim);
          ctx.clearRect(0, 0, width, height);

          const stacked = width < 500;
          const padX = stacked ? 12 : 20;
          const hudH = 34;

          ctx.fillStyle = theme.surfaceSub;
          ctx.fillRect(0, 0, width, hudH);
          ctx.beginPath();
          ctx.moveTo(0, hudH + 0.5);
          ctx.lineTo(width, hudH + 0.5);
          ctx.strokeStyle = theme.line;
          ctx.lineWidth = 1;
          ctx.stroke();

          drawLabel(ctx, stacked ? "Main context" : "Main agent context window", padX, hudH / 2, {
            color: theme.ink,
            font: theme.fontSans,
            size: stacked ? 11 : 12,
            weight: 600,
          });
          drawLabel(ctx, `Signal density: ${stats.signalPct}%`, width - padX, hudH / 2, {
            color: stats.signalPct > 60 ? theme.sage : theme.copper,
            font: theme.fontMono,
            size: stacked ? 11 : 11.8,
            weight: 600,
            align: "right",
          });

          const hits: CellHit[] = [];
          const legendH = 28;
          const contentTop = hudH + 14;
          const contentBottom = height - legendH;
          const contentH = contentBottom - contentTop;

          if (sim.mode === "inline") {
            const mainW = width - padX * 2;
            const boxH = contentH;
            fillRoundRect(ctx, padX, contentTop, mainW, boxH, 10, theme.bg, theme.copper, 1.4);

            const innerPad = 12;
            const availW = mainW - innerPad * 2;
            const availH = boxH - innerPad * 2;
            const totalCells = SPEC_CELLS + NOISE_CELLS + ANSWER_CELLS;
            const cols = stacked ? 11 : Math.max(14, Math.floor(availW / 16));
            const rows = Math.ceil(totalCells / cols);
            const gap = stacked ? 3.5 : 4;
            const cellW = (availW - gap * (cols - 1)) / cols;
            const cellH = (availH - gap * (rows - 1)) / rows;
            const cell = Math.min(13, Math.max(7, Math.floor(Math.min(cellW, cellH))));
            const pitch = cell + gap;

            const visibleSearch = Math.round(clamp(sim.progress / 0.78, 0, 1) * (NOISE_CELLS + ANSWER_CELLS));
            const totalToDraw = SPEC_CELLS + visibleSearch;

            for (let i = 0; i < totalToDraw; i++) {
              const col = i % cols;
              const row = Math.floor(i / cols);
              const x = padX + innerPad + col * pitch;
              const y = contentTop + innerPad + row * pitch;

              let fill = theme.lineStrong;
              let stroke: string | undefined;
              let label = "";
              if (i < SPEC_CELLS) {
                fill = theme.sage;
                label = SPEC_LABELS[i % SPEC_LABELS.length];
              } else {
                const searchIdx = i - SPEC_CELLS;
                const ans = ANSWER_POSITIONS.get(searchIdx);
                if (ans) {
                  fill = theme.teal;
                  label = ans;
                } else {
                  fill = theme.copperBg;
                  stroke = theme.copperLine;
                  label = NOISE_SAMPLES[searchIdx % NOISE_SAMPLES.length];
                }
              }
              const isSel = selectedCell && Math.abs(selectedCell.x - x) < 1 && Math.abs(selectedCell.y - y) < 1;
              fillRoundRect(ctx, x, y, cell, cell, 2.5, fill, isSel ? theme.ink : stroke, isSel ? 1.8 : stroke ? 0.7 : 0);
              hits.push({ x, y, size: cell, label });
            }
          } else {
            const mainBox = stacked
              ? { x: padX, y: contentTop + 14, w: width - padX * 2, h: 66 }
              : { x: padX, y: contentTop + 16, w: Math.round((width - padX * 2) * 0.4), h: contentH - 16 };

            const subBox = stacked
              ? { x: padX, y: mainBox.y + mainBox.h + 24, w: width - padX * 2, h: contentBottom - (mainBox.y + mainBox.h + 24) }
              : { x: mainBox.x + mainBox.w + 22, y: contentTop + 16, w: width - padX - (mainBox.x + mainBox.w + 22), h: contentH - 16 };

            drawLabel(ctx, "Working memory (clean)", mainBox.x + 2, mainBox.y - 10, {
              color: theme.sage,
              font: theme.fontSans,
              size: 10.5,
              weight: 600,
            });
            fillRoundRect(ctx, mainBox.x, mainBox.y, mainBox.w, mainBox.h, 10, theme.bg, theme.sage, 1.4);

            const innerPad = 10;
            const mainCell = 12;
            const mainGap = 4;
            const mainPitch = mainCell + mainGap;
            const mainCols = Math.max(4, Math.floor((mainBox.w - innerPad * 2 + mainGap) / mainPitch));

            for (let i = 0; i < SPEC_CELLS; i++) {
              const c = i % mainCols;
              const r = Math.floor(i / mainCols);
              const x = mainBox.x + innerPad + c * mainPitch;
              const y = mainBox.y + innerPad + r * mainPitch;
              const isSel = selectedCell && Math.abs(selectedCell.x - x) < 1 && Math.abs(selectedCell.y - y) < 1;
              fillRoundRect(ctx, x, y, mainCell, mainCell, 2.5, theme.sage, isSel ? theme.ink : undefined, isSel ? 1.8 : 0);
              hits.push({ x, y, size: mainCell, label: SPEC_LABELS[i % SPEC_LABELS.length] });
            }

            const subAvailW = subBox.w - innerPad * 2;
            const subAvailH = subBox.h - innerPad * 2;
            const totalSub = NOISE_CELLS + ANSWER_CELLS;
            const subCols = 16;
            const subRows = Math.ceil(totalSub / subCols);
            const subGap = 3.5;
            const subCell = Math.min(
              11.5,
              Math.max(6.5, Math.floor(Math.min((subAvailW - subGap * (subCols - 1)) / subCols, (subAvailH - subGap * (subRows - 1)) / subRows))),
            );
            const subPitch = subCell + subGap;
            const subGridW = subCols * subPitch - subGap;
            const subGridH = subRows * subPitch - subGap;
            const subGridX = subBox.x + Math.round((subBox.w - subGridW) / 2);
            const subGridY = subBox.y + Math.round((subBox.h - subGridH) / 2);

            const answerStarts: { x: number; y: number; label: string }[] = [];
            const answerTargets: { x: number; y: number }[] = [];
            const answerLabels = Array.from(ANSWER_POSITIONS.values());
            for (let a = 0; a < ANSWER_CELLS; a++) {
              const idx = SPEC_CELLS + a;
              answerTargets.push({
                x: mainBox.x + innerPad + (idx % mainCols) * mainPitch,
                y: mainBox.y + innerPad + Math.floor(idx / mainCols) * mainPitch,
              });
            }

            // Precompute all 4 answer origins so staggered launch always knows exact coordinates
            for (const [sIdx, ansLabel] of ANSWER_POSITIONS.entries()) {
              answerStarts.push({
                x: subGridX + (sIdx % subCols) * subPitch,
                y: subGridY + Math.floor(sIdx / subCols) * subPitch,
                label: ansLabel,
              });
            }

            // Discovery halo pulse right before answers lift off (progress 0.42..0.54)
            const lockOnPulse =
              sim.progress >= 0.42 && sim.progress < 0.56
                ? Math.sin(((sim.progress - 0.42) / 0.14) * Math.PI)
                : 0;

            if (sim.subSandboxAlpha.value > 0.04) {
              const subScale = 0.94 + 0.06 * clamp(sim.subSandboxAlpha.value, 0, 1);
              ctx.save();
              ctx.globalAlpha = clamp(sim.subSandboxAlpha.value, 0, 1);
              const labelAlpha = stacked && sim.progress >= 0.5 ? clamp(1 - (sim.progress - 0.5) / 0.14, 0, 1) : 1;
              if (labelAlpha > 0.02) {
                ctx.save();
                ctx.globalAlpha = clamp(sim.subSandboxAlpha.value, 0, 1) * labelAlpha;
                drawLabel(ctx, "Disposable subagent (throwaway)", subBox.x + 2, subBox.y - 10, {
                  color: theme.muted,
                  font: theme.fontSans,
                  size: 10.5,
                  weight: 500,
                });
                ctx.restore();
              }

              // Subtle shrink as subagent dissolves away
              const scx = subBox.x + subBox.w / 2;
              const scy = subBox.y + subBox.h / 2;
              ctx.translate(scx, scy);
              ctx.scale(subScale, subScale);
              ctx.translate(-scx, -scy);

              ctx.setLineDash([4, 4]);
              fillRoundRect(ctx, subBox.x, subBox.y, subBox.w, subBox.h, 10, theme.bg, theme.lineStrong, 1.2);
              ctx.setLineDash([]);

              const visibleSearch = Math.round(clamp(sim.progress / 0.42, 0, 1) * totalSub);
              let answerCursor = 0;
              for (let s = 0; s < visibleSearch; s++) {
                const c = s % subCols;
                const r = Math.floor(s / subCols);
                const x = subGridX + c * subPitch;
                const y = subGridY + r * subPitch;

                const ans = ANSWER_POSITIONS.get(s);
                if (ans) {
                  const launchAt = 0.52 + answerCursor * 0.045;
                  answerCursor++;
                  if (sim.progress < launchAt) {
                    if (lockOnPulse > 0.05) {
                      ctx.strokeStyle = theme.teal;
                      ctx.lineWidth = 1.5;
                      fillRoundRect(ctx, x - 2.5, y - 2.5, subCell + 5, subCell + 5, 3.5, theme.tealBg, theme.teal, 1.2);
                    }
                    const isSel = selectedCell && Math.abs(selectedCell.x - x) < 1 && Math.abs(selectedCell.y - y) < 1;
                    fillRoundRect(ctx, x, y, subCell, subCell, 2.2, theme.teal, isSel ? theme.ink : undefined, isSel ? 1.6 : 0);
                    hits.push({ x, y, size: subCell, label: ans });
                  }
                } else {
                  const isSel = selectedCell && Math.abs(selectedCell.x - x) < 1 && Math.abs(selectedCell.y - y) < 1;
                  fillRoundRect(ctx, x, y, subCell, subCell, 2.2, theme.copperBg, isSel ? theme.ink : theme.copperLine, isSel ? 1.5 : 0.65);
                  hits.push({ x, y, size: subCell, label: NOISE_SAMPLES[s % NOISE_SAMPLES.length] });
                }
              }
              ctx.restore();
            } else {
              ctx.save();
              ctx.setLineDash([3, 4]);
              fillRoundRect(ctx, subBox.x, subBox.y, subBox.w, subBox.h, 10, undefined, theme.line, 1);
              ctx.restore();
              drawLabel(ctx, "Subagent discarded", subBox.x + subBox.w / 2, subBox.y + subBox.h / 2 - 8, {
                color: theme.muted,
                font: theme.fontSans,
                size: 11.5,
                weight: 600,
                align: "center",
              });
              drawLabel(ctx, "76 noise blocks dropped cleanly", subBox.x + subBox.w / 2, subBox.y + subBox.h / 2 + 10, {
                color: theme.dim,
                font: theme.fontSans,
                size: 10.5,
                align: "center",
              });
            }

            // Staggered curved extraction arcs carrying each teal answer cleanly into Main context
            for (let a = 0; a < ANSWER_CELLS; a++) {
              const launchAt = 0.52 + a * 0.045;
              if (sim.progress < launchAt) continue;
              const flyT = easeOutCubic(clamp((sim.progress - launchAt) / 0.22, 0, 1));
              const from = answerStarts[a];
              const to = answerTargets[a];
              const ctrlX = (from.x + to.x) / 2 + (stacked ? (a - 1.5) * 18 : 0);
              const ctrlY = Math.min(from.y, to.y) - (stacked ? 12 : 24);
              const inv = 1 - flyT;
              const x = inv * inv * from.x + 2 * inv * flyT * ctrlX + flyT * flyT * to.x;
              const y = inv * inv * from.y + 2 * inv * flyT * ctrlY + flyT * flyT * to.y;

              if (flyT < 0.98) {
                ctx.save();
                ctx.strokeStyle = theme.teal;
                ctx.globalAlpha = 0.38 * (1 - flyT * 0.65);
                ctx.lineWidth = 1.3;
                ctx.beginPath();
                ctx.moveTo(from.x + subCell / 2, from.y + subCell / 2);
                ctx.quadraticCurveTo(ctrlX + mainCell / 2, ctrlY + mainCell / 2, x + mainCell / 2, y + mainCell / 2);
                ctx.stroke();
                ctx.restore();
              }

              const sz = subCell + (mainCell - subCell) * flyT;
              const isSel = selectedCell && Math.abs(selectedCell.x - x) < 2 && Math.abs(selectedCell.y - y) < 2;
              fillRoundRect(ctx, x, y, sz, sz, 2.5, theme.teal, isSel ? theme.ink : undefined, isSel ? 1.8 : 0);
              hits.push({ x, y, size: sz, label: answerLabels[a] });
            }
          }

          cellHitsRef.current = hits;

          const ly = height - 13;
          let lx = padX;
          const legendGap = stacked ? 14 : 24;
          for (const [label, col, border] of [
            ["Task spec", theme.sage, undefined],
            ["Found answers", theme.teal, undefined],
            [stacked ? "Log noise" : "Raw grep/log noise", theme.copperBg, theme.copper],
          ] as const) {
            fillRoundRect(ctx, lx, ly - 4, 8, 8, 2, col, border, border ? 1 : 0);
            drawLabel(ctx, label, lx + 11, ly, {
              color: theme.dim,
              font: theme.fontSans,
              size: stacked ? 10 : 10.8,
            });
            lx += ctx.measureText(label).width + legendGap;
          }
        }}
      />
    </Figure>
  );
}
