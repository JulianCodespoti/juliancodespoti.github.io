import { RotateCcw } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { CanvasStage, clamp, drawLabel, easeOutCubic, fillRoundRect } from "../../runtime";
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
   Figure 1: Warm Staircase vs. Cold Mountains (Exact Geometry of Handoff Tax)
   ========================================================================== */

export function CachePyramidFigure() {
  const [mode, setMode] = useState<HandoffMode>("swarm");
  const revealRef = useRef(TASK_TURNS);

  const data = useMemo(() => buildHandoffStaircase(mode), [mode]);

  const switchMode = (next: HandoffMode) => {
    setMode(next);
    revealRef.current = 0.5;
  };

  const replay = () => {
    revealRef.current = 0.5;
  };

  return (
    <Figure
      caption={
        mode === "single"
          ? `One warm agent builds a single green staircase (${data.coldPrefillK}K uncached tokens, ${data.totalCostCents.toFixed(1)}c total).`
          : `Every role handoff starts cold with a new system prompt and re-reads shared files (${data.coldPrefillK}K uncached tokens, ${data.totalCostCents.toFixed(1)}c total).`
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
        height={228}
        label="Turn-by-turn token grid comparing one warm single-agent cache staircase against four cold-start rows in a multi-agent role swarm"
        onFrame={({ ctx, width, height, dt, theme }) => {
          if (revealRef.current < TASK_TURNS) {
            revealRef.current = Math.min(TASK_TURNS, revealRef.current + dt * 5.2);
          }
          const visibleRows = Math.ceil(revealRef.current);

          ctx.clearRect(0, 0, width, height);

          const padX = 24;
          const labelW = 84;
          const maxCols = 14;
          const availW = width - padX * 2 - labelW;
          const gap = 4;
          const cellSize = Math.min(15, Math.max(9, Math.floor((availW - gap * (maxCols - 1)) / maxCols)));
          const pitch = cellSize + gap;
          const startX = padX + labelW;
          const startY = 40;

          let runningCost = 0;
          for (let r = 0; r < visibleRows; r++) {
            runningCost += data.rows[r].turnCostCents;
          }

          drawLabel(ctx, "1 square = 2K input tokens", padX, 18, {
            color: theme.dim,
            font: theme.fontSans,
            size: 11.5,
          });
          drawLabel(ctx, `8-turn cost: ${runningCost.toFixed(1)}c`, width - padX, 18, {
            color: mode === "single" ? theme.sage : theme.crimson,
            font: theme.fontSans,
            size: 12.5,
            weight: 600,
            align: "right",
          });

          for (let r = 0; r < visibleRows; r++) {
            const row = data.rows[r];
            const y = startY + r * (cellSize + 4);

            // Subtle divider line whenever ownership switches to a brand-new agent
            if (row.isHandoff) {
              ctx.save();
              ctx.setLineDash([3, 3]);
              ctx.beginPath();
              ctx.moveTo(padX, y - 2);
              ctx.lineTo(width - padX, y - 2);
              ctx.strokeStyle = theme.crimson;
              ctx.globalAlpha = 0.45;
              ctx.lineWidth = 1;
              ctx.stroke();
              ctx.restore();
            }

            drawLabel(ctx, row.owner, padX, y + cellSize / 2, {
              color: row.isHandoff ? theme.crimson : theme.muted,
              font: theme.fontSans,
              size: 11,
              weight: row.isHandoff ? 600 : 500,
            });

            row.cells.forEach((cell, c) => {
              const x = startX + c * pitch;
              const fill =
                cell === "cached" ? theme.sage : cell === "cold" ? theme.crimson : theme.copper;
              fillRoundRect(ctx, x, y, cellSize, cellSize, 3, fill);
            });

            if (row.isHandoff) {
              const endX = startX + row.cells.length * pitch + 8;
              drawLabel(ctx, "cold start", endX, y + cellSize / 2, {
                color: theme.crimson,
                font: theme.fontSans,
                size: 10.5,
                weight: 600,
              });
            }
          }

          // Bottom legend
          const ly = height - 13;
          let lx = padX;
          for (const [label, col] of [
            ["Cached prefix (0.1x)", theme.sage],
            ["New tokens (1.0x)", theme.copper],
            ["Cold prefill (1.0x)", theme.crimson],
          ] as const) {
            fillRoundRect(ctx, lx, ly - 4, 8, 8, 2, col);
            drawLabel(ctx, label, lx + 12, ly, { color: theme.dim, font: theme.fontSans, size: 10.5 });
            lx += ctx.measureText(label).width + 26;
          }
        }}
      />
    </Figure>
  );
}

/* ==========================================================================
   Figure 2: Attention Dilution & Disposable Subagent Extraction (Needle Field)
   ========================================================================== */

// Deterministic scattered positions where the 4 real answers land inside the 80-cell haystack
const ANSWER_POSITIONS = new Set([19, 37, 58, 74]);

export function NeedleGridFigure() {
  const simRef = useRef(createNeedleSim("subagent"));
  const [mode, setMode] = useState<NeedleMode>("subagent");

  const switchMode = (next: NeedleMode) => {
    setMode(next);
    resetNeedleSim(simRef.current, next);
  };

  const replay = () => resetNeedleSim(simRef.current, mode);

  return (
    <Figure
      caption={
        mode === "inline"
          ? "Searching inline dumps 76 noise blocks straight into working memory, burying your 12 real signal blocks at 14% density."
          : "A disposable subagent absorbs the 76 noise blocks in a throwaway window, extracts the 4 teal answers, and disappears."
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
        height={196}
        label="2D token grid showing how inline repo searches dilute signal cells under raw noise versus a disposable subagent extracting only the 4 answer cells"
        onFrame={({ ctx, width, height, dt, theme }) => {
          const sim = simRef.current;
          stepNeedleSim(sim, dt);
          const stats = getNeedleSignalRatio(sim);
          ctx.clearRect(0, 0, width, height);

          const padX = 20;
          const topY = 44;
          const boxH = height - topY - 26;

          drawLabel(ctx, "Main agent context window", padX, 18, {
            color: theme.ink,
            font: theme.fontSans,
            size: 12,
            weight: 600,
          });
          drawLabel(ctx, `Signal density: ${stats.signalPct}%`, width - padX, 18, {
            color: stats.signalPct > 60 ? theme.sage : theme.copper,
            font: theme.fontSans,
            size: 12,
            weight: 600,
            align: "right",
          });

          const mainW = sim.mode === "inline" ? width - padX * 2 : Math.round((width - padX * 2) * 0.44);
          fillRoundRect(
            ctx,
            padX,
            topY,
            mainW,
            boxH,
            10,
            theme.bg,
            stats.signalPct > 60 ? theme.sage : theme.copper,
            1.4,
          );

          const cell = 11;
          const gap = 4;
          const pitch = cell + gap;
          const innerPad = 12;

          if (sim.mode === "inline") {
            // Everything floods into the Main box: 8 sage spec cells + 80 search cells (4 teal needles buried in 76 noise)
            const cols = Math.max(8, Math.floor((mainW - innerPad * 2 + gap) / pitch));
            const visibleSearch = Math.round(clamp(sim.progress / 0.78, 0, 1) * (NOISE_CELLS + ANSWER_CELLS));
            const totalToDraw = SPEC_CELLS + visibleSearch;

            for (let i = 0; i < totalToDraw; i++) {
              const col = i % cols;
              const row = Math.floor(i / cols);
              const x = padX + innerPad + col * pitch;
              const y = topY + innerPad + row * pitch;
              if (y + cell > topY + boxH - 6) break;

              let fill = theme.lineStrong;
              if (i < SPEC_CELLS) {
                fill = theme.sage;
              } else {
                const searchIdx = i - SPEC_CELLS;
                fill = ANSWER_POSITIONS.has(searchIdx) ? theme.teal : theme.copperBg;
              }
              fillRoundRect(ctx, x, y, cell, cell, 2.5, fill);
            }
          } else {
            // Left: Clean Main window holding 8 sage spec cells (+ 4 teal answer cells once extracted!)
            const mainCols = Math.max(4, Math.floor((mainW - innerPad * 2 + gap) / pitch));
            for (let i = 0; i < SPEC_CELLS; i++) {
              const c = i % mainCols;
              const r = Math.floor(i / mainCols);
              fillRoundRect(ctx, padX + innerPad + c * pitch, topY + innerPad + r * pitch, cell, cell, 2.5, theme.sage);
            }

            // Right: Temporary Subagent sandbox absorbing all 76 noise + 4 teal answer cells
            const subX = padX + mainW + 24;
            const subW = width - padX - subX;
            const subCols = Math.max(6, Math.floor((subW - innerPad * 2 + gap) / pitch));

            // Compute start & end coordinates of the 4 teal answer cells so they physically fly across!
            const answerStarts: { x: number; y: number }[] = [];
            const answerTargets: { x: number; y: number }[] = [];
            for (let a = 0; a < ANSWER_CELLS; a++) {
              const idx = SPEC_CELLS + a;
              answerTargets.push({
                x: padX + innerPad + (idx % mainCols) * pitch,
                y: topY + innerPad + Math.floor(idx / mainCols) * pitch,
              });
            }

            if (sim.subSandboxAlpha.value > 0.03) {
              ctx.save();
              ctx.globalAlpha = Math.max(0, Math.min(1, sim.subSandboxAlpha.value));
              ctx.setLineDash([4, 4]);
              fillRoundRect(ctx, subX, topY, subW, boxH, 10, theme.bg, theme.lineStrong, 1.2);
              ctx.setLineDash([]);

              drawLabel(ctx, "Disposable subagent", subX + 2, topY - 12, {
                color: theme.dim,
                font: theme.fontSans,
                size: 11,
              });

              const visibleSearch = Math.round(clamp(sim.progress / 0.48, 0, 1) * (NOISE_CELLS + ANSWER_CELLS));
              for (let s = 0; s < visibleSearch; s++) {
                const c = s % subCols;
                const r = Math.floor(s / subCols);
                const x = subX + innerPad + c * pitch;
                const y = topY + innerPad + r * pitch;
                if (y + cell > topY + boxH - 6) break;

                if (ANSWER_POSITIONS.has(s)) {
                  answerStarts.push({ x, y });
                  if (sim.progress < 0.52) {
                    fillRoundRect(ctx, x, y, cell, cell, 2.5, theme.teal);
                  }
                } else {
                  fillRoundRect(ctx, x, y, cell, cell, 2.5, theme.copperBg);
                }
              }
              ctx.restore();
            } else {
              drawLabel(ctx, "Subagent discarded (76 noise blocks dropped)", subX + subW / 2, topY + boxH / 2, {
                color: theme.dim,
                font: theme.fontSans,
                size: 11.5,
                align: "center",
              });
            }

            // Smoothly fly the 4 extracted teal answer cells from the noisy subagent into the clean main box!
            if (sim.progress >= 0.52) {
              const flyT = easeOutCubic(clamp((sim.progress - 0.52) / 0.24, 0, 1));
              for (let a = 0; a < ANSWER_CELLS; a++) {
                const from = answerStarts[a] ?? { x: subX + 20, y: topY + 30 + a * 16 };
                const to = answerTargets[a];
                const x = from.x + (to.x - from.x) * flyT;
                const y = from.y + (to.y - from.y) * flyT;
                fillRoundRect(ctx, x, y, cell, cell, 2.5, theme.teal);
              }
            }
          }

          // Quiet bottom legend
          const ly = height - 11;
          let lx = padX;
          for (const [label, col] of [
            ["Task spec", theme.sage],
            ["Found answers", theme.teal],
            ["Raw grep/log noise", theme.copperBg],
          ] as const) {
            fillRoundRect(ctx, lx, ly - 4, 8, 8, 2, col, col === theme.copperBg ? theme.copper : undefined, 1);
            drawLabel(ctx, label, lx + 12, ly, { color: theme.dim, font: theme.fontSans, size: 10.5 });
            lx += ctx.measureText(label).width + 26;
          }
        }}
      />
    </Figure>
  );
}
