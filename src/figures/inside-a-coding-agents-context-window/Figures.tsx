import { RotateCcw } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { CanvasStage, drawLabel, fillRoundRect } from "../../runtime";
import { Figure, IconButton, Toggle } from "../../ui";
import {
  buildTurnTriangle,
  CAUSAL_BLOCKS,
  createCausalCache,
  editCausalBlock,
  getCausalCacheStats,
  stepCausalCache,
  TRIANGLE_TURNS,
  type TriangleMode,
} from "./model";

/* ==========================================================================
   Figure 1: Causal Attention Arcs (Why Prefix Caching Breaks Strictly Rightward)
   ========================================================================== */

export function CausalCacheFigure() {
  const simRef = useRef(createCausalCache(1));
  const rectsRef = useRef<{ x: number; y: number; w: number; h: number }[]>([]);
  const [, bump] = useState(0);

  const selectBlock = (i: number) => {
    if (simRef.current.editedIndex === i) return;
    editCausalBlock(simRef.current, i);
    bump((n) => n + 1);
  };

  const stats = getCausalCacheStats(simRef.current);
  const edited = CAUSAL_BLOCKS[simRef.current.editedIndex];

  return (
    <Figure
      caption={
        simRef.current.editedIndex === CAUSAL_BLOCKS.length - 1
          ? `Only "${edited.label}" changed: every block to its left stays cached (${Math.round(stats.hitRate * 100)}% hit). Click or hover any earlier block.`
          : `Editing "${edited.label}" invalidates every KV state to its right because causal attention depends on all prior tokens (${Math.round(stats.hitRate * 100)}% hit).`
      }
    >
      <CanvasStage
        height={186}
        cursor="pointer"
        label="Causal attention arcs flowing left-to-right across 6 prompt blocks showing why editing an early block invalidates every block after it"
        onPointerDown={(p) => {
          rectsRef.current.forEach((r, i) => {
            if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y - 12 && p.y <= r.y + r.h + 12) {
              selectBlock(i);
            }
          });
        }}
        onPointerMove={(p) => {
          rectsRef.current.forEach((r, i) => {
            if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
              selectBlock(i);
            }
          });
        }}
        onFrame={({ ctx, width, height, dt, theme }) => {
          const sim = simRef.current;
          stepCausalCache(sim, dt);
          const s = getCausalCacheStats(sim);
          ctx.clearRect(0, 0, width, height);

          const padX = 20;
          const n = CAUSAL_BLOCKS.length;
          const gap = 8;
          const blockW = (width - padX * 2 - gap * (n - 1)) / n;
          const blockH = 48;
          const blockY = height - blockH - 22;

          const centers: { cx: number; topY: number }[] = [];
          const rects: { x: number; y: number; w: number; h: number }[] = [];

          for (let i = 0; i < n; i++) {
            const x = padX + i * (blockW + gap);
            rects.push({ x, y: blockY, w: blockW, h: blockH });
            centers.push({ cx: x + blockW / 2, topY: blockY });
          }
          rectsRef.current = rects;

          // Subtle top status
          drawLabel(ctx, `Causal attention flows left -> right`, padX, 18, {
            color: theme.dim,
            font: theme.fontSans,
            size: 11.5,
          });
          drawLabel(
            ctx,
            `Turn input cost: ${s.costCents.toFixed(2)}c  (${Math.round(s.hitRate * 100)}% cached)`,
            width - padX,
            18,
            {
              color: s.hitRate > 0.7 ? theme.sage : theme.crimson,
              font: theme.fontSans,
              size: 12,
              weight: 600,
              align: "right",
            },
          );

          // 1. Background faint causal arcs (all left -> right dependencies)
          for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
              const from = centers[i];
              const to = centers[j];
              const span = j - i;
              const archH = 18 + span * 15;
              const midX = (from.cx + to.cx) / 2;
              const ctrlY = blockY - archH;

              const isBrokenArc = i === sim.editedIndex;
              if (isBrokenArc) continue; // draw broken arcs on top

              ctx.beginPath();
              ctx.moveTo(from.cx, from.topY - 2);
              ctx.quadraticCurveTo(midX, ctrlY, to.cx, to.topY - 2);
              ctx.strokeStyle = j < sim.editedIndex ? theme.sage : theme.line;
              ctx.globalAlpha = j < sim.editedIndex ? 0.35 : 0.45;
              ctx.lineWidth = 1.1;
              ctx.stroke();
            }
          }
          ctx.globalAlpha = 1;

          // 2. Highlighted crimson causal arcs rippling strictly rightward from the edited block
          const origin = centers[sim.editedIndex];
          for (let j = sim.editedIndex + 1; j < n; j++) {
            const to = centers[j];
            const span = j - sim.editedIndex;
            const archH = 20 + span * 16;
            const midX = (origin.cx + to.cx) / 2;
            const ctrlY = blockY - archH;

            // Animate each arc sequentially along sim.ripple
            const arcStart = (span - 1) * 0.14;
            const arcProg = Math.max(0, Math.min(1, (sim.ripple - arcStart) / 0.45));
            if (arcProg <= 0) continue;

            ctx.beginPath();
            ctx.moveTo(origin.cx, origin.topY - 2);
            // Draw partial quadratic Bezier cleanly via small segments for smooth rightward ripple
            const steps = 20;
            for (let k = 1; k <= steps; k++) {
              const t = (k / steps) * arcProg;
              const inv = 1 - t;
              const px = inv * inv * origin.cx + 2 * inv * t * midX + t * t * to.cx;
              const py = inv * inv * (origin.topY - 2) + 2 * inv * t * ctrlY + t * t * (to.topY - 2);
              ctx.lineTo(px, py);
            }
            ctx.strokeStyle = theme.crimson;
            ctx.lineWidth = 1.85;
            ctx.stroke();

            // Tiny arrowhead dot arriving on the downstream block
            if (arcProg > 0.92) {
              ctx.fillStyle = theme.crimson;
              ctx.beginPath();
              ctx.arc(to.cx, to.topY - 3, 2.8, 0, Math.PI * 2);
              ctx.fill();
            }
          }

          // 3. Prompt blocks along the bottom
          CAUSAL_BLOCKS.forEach((b, i) => {
            const r = rects[i];
            const cached = i < sim.editedIndex;
            const isEdited = i === sim.editedIndex;

            fillRoundRect(
              ctx,
              r.x,
              r.y,
              r.w,
              r.h,
              7,
              cached ? theme.sageBg : theme.crimsonBg,
              cached ? theme.sage : theme.crimson,
              isEdited ? 2.2 : 1.25,
            );

            drawLabel(ctx, b.label, r.x + r.w / 2, r.y + 17, {
              color: theme.ink,
              font: theme.fontSans,
              size: 11.5,
              weight: 600,
              align: "center",
            });
            drawLabel(ctx, isEdited ? "edited" : cached ? "cached" : "invalid", r.x + r.w / 2, r.y + 34, {
              color: cached ? theme.sage : theme.crimson,
              font: theme.fontSans,
              size: 10.5,
              weight: 500,
              align: "center",
            });
          });
        }}
      />
    </Figure>
  );
}

/* ==========================================================================
   Figure 2: The 2D Quadratic Turn x Token Triangle (O(N^2) vs O(N) vs Compact)
   ========================================================================== */

export function TurnTriangleFigure() {
  const [mode, setMode] = useState<TriangleMode>("cached");
  const revealRef = useRef(TRIANGLE_TURNS);

  const data = useMemo(() => buildTurnTriangle(mode), [mode]);

  const switchMode = (next: TriangleMode) => {
    setMode(next);
    revealRef.current = 0.5; // smoothly grow row-by-row when toggling!
  };

  const replay = () => {
    revealRef.current = 0.5;
  };

  return (
    <Figure
      caption={
        mode === "uncached"
          ? `Without caching, you re-pay the entire 2D triangle every session (${data.totalCostCents.toFixed(1)}c across 12 turns).`
          : mode === "cached"
            ? `Prefix caching turns the whole interior green (0.1x), leaving only the thin copper diagonal at full price (${data.totalCostCents.toFixed(1)}c).`
            : `Summarizing on turns 4, 8, and 12 shrinks the rows slightly, but those crimson cache-miss rows push the total to ${data.totalCostCents.toFixed(1)}c.`
      }
      controls={
        <>
          <Toggle
            label="Caching and compaction mode"
            value={mode}
            onChange={switchMode}
            options={[
              { value: "uncached", label: "No cache" },
              { value: "cached", label: "Prefix cache" },
              { value: "summarize", label: "Summarize every 4 turns" },
            ]}
          />
          <IconButton accent label="Replay 12-turn session" onClick={replay}>
            <RotateCcw size={14} />
          </IconButton>
        </>
      }
    >
      <CanvasStage
        height={272}
        label="2D triangle of 12 coding agent turns showing quadratic token growth, green prefix cache interior, and crimson cache-miss rows on mid-session summarization"
        onFrame={({ ctx, width, height, dt, theme }) => {
          if (revealRef.current < TRIANGLE_TURNS) {
            revealRef.current = Math.min(TRIANGLE_TURNS, revealRef.current + dt * 7.5);
          }
          const visibleRows = Math.ceil(revealRef.current);

          ctx.clearRect(0, 0, width, height);

          const padX = 24;
          const labelW = 48;
          const maxCols = 16;
          const availW = width - padX * 2 - labelW;
          const gap = 4;
          const cellSize = Math.min(13, Math.max(8, Math.floor((availW - gap * (maxCols - 1)) / maxCols)));
          const pitch = cellSize + gap;
          const startX = padX + labelW;
          const startY = 38;

          // Compute live running cost up to visibleRows
          let runningCost = 0;
          for (let r = 0; r < visibleRows; r++) {
            runningCost += data.rows[r].turnCostCents;
          }

          drawLabel(ctx, "1 square = 2K input tokens", padX, 18, {
            color: theme.dim,
            font: theme.fontSans,
            size: 11.5,
          });
          drawLabel(ctx, `12-turn total: ${runningCost.toFixed(1)}c`, width - padX, 18, {
            color: mode === "cached" ? theme.sage : mode === "summarize" ? theme.crimson : theme.copper,
            font: theme.fontSans,
            size: 12.5,
            weight: 600,
            align: "right",
          });

          for (let r = 0; r < visibleRows; r++) {
            const row = data.rows[r];
            const y = startY + r * (cellSize + 3);
            const hasMiss = row.cells.includes("miss");

            drawLabel(ctx, `T${row.turn}`, padX, y + cellSize / 2, {
              color: hasMiss ? theme.crimson : theme.dim,
              font: theme.fontSans,
              size: 10.5,
              weight: hasMiss ? 600 : 500,
            });

            row.cells.forEach((cell, c) => {
              const x = startX + c * pitch;
              const fill =
                cell === "cached" ? theme.sage : cell === "miss" ? theme.crimson : theme.copper;
              fillRoundRect(ctx, x, y, cellSize, cellSize, 2.5, fill);
            });

            if (hasMiss) {
              const endX = startX + row.cells.length * pitch + 6;
              drawLabel(ctx, "summarized (cache miss)", endX, y + cellSize / 2, {
                color: theme.crimson,
                font: theme.fontSans,
                size: 10.5,
                weight: 600,
              });
            }
          }

          // Clean bottom legend
          const ly = height - 13;
          let lx = padX;
          for (const [label, col] of [
            ["Cached (0.1x)", theme.sage],
            ["New tokens (1.0x)", theme.copper],
            ["Recomputed prefix (1.0x)", theme.crimson],
          ] as const) {
            fillRoundRect(ctx, lx, ly - 4, 8, 8, 2, col);
            drawLabel(ctx, label, lx + 12, ly, { color: theme.dim, font: theme.fontSans, size: 10.5 });
            lx += ctx.measureText(label).width + 28;
          }
        }}
      />
    </Figure>
  );
}
