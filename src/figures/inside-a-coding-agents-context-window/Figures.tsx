import { RotateCcw } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { CanvasStage, drawLabel, fillRoundRect } from "../../runtime";
import { ChipButton, Figure, IconButton, Toggle } from "../../ui";
import {
  buildTurnTriangle,
  CAUSAL_BLOCKS,
  createCausalCache,
  editCausalBlock,
  getCausalCacheStats,
  SESSION_SLICES,
  SESSION_TOTAL_TOKENS,
  simulateHarness20Turns,
  stepCausalCache,
  TRIANGLE_TURNS,
  type HarnessConfig,
  type SliceCategory,
  type TriangleMode,
} from "./model";

/* ==========================================================================
   Figure 1: Hoverable 18-Turn Session Anatomy (0 Controls, Direct Discovery)
   ========================================================================== */

export function SessionAnatomyFigure() {
  const [selectedIdx, setSelectedIdx] = useState(6); // Start highlighting the 19.8K uncropped test log!
  const rectsRef = useRef<{ x: number; w: number }[]>([]);
  const active = SESSION_SLICES[selectedIdx];
  const pct = ((active.tokens / SESSION_TOTAL_TOKENS) * 100).toFixed(1);

  return (
    <Figure
      caption={`${active.label}: ${active.tokens.toLocaleString()} tokens (${pct}% of the prompt) - ${active.preview}`}
    >
      <CanvasStage
        height={128}
        running={false}
        cursor="pointer"
        label="Proportional horizontal tape of a 47.2K token coding agent session showing user prompts, tool schemas, file reads, and an uncropped 19.8K test failure log"
        onPointerMove={(p) => {
          rectsRef.current.forEach((r, i) => {
            if (p.x >= r.x && p.x <= r.x + r.w) setSelectedIdx(i);
          });
        }}
        onPointerDown={(p) => {
          rectsRef.current.forEach((r, i) => {
            if (p.x >= r.x && p.x <= r.x + r.w) setSelectedIdx(i);
          });
        }}
        onFrame={({ ctx, width, height, theme }) => {
          ctx.clearRect(0, 0, width, height);
          const padX = 20;
          const barW = width - padX * 2;
          const barY = 44;
          const barH = 40;

          drawLabel(ctx, `Hover or tap any slice (${(SESSION_TOTAL_TOKENS / 1000).toFixed(1)}K tokens total)`, padX, 20, {
            color: theme.muted,
            font: theme.fontSans,
            size: 11.5,
          });
          drawLabel(ctx, `${active.label} (${pct}%)`, width - padX, 20, {
            color: active.category === "logs" ? theme.copper : active.category === "code" ? theme.sage : theme.teal,
            font: theme.fontSans,
            size: 12,
            weight: 600,
            align: "right",
          });

          const colorFor = (cat: SliceCategory) => {
            if (cat === "system") return theme.muted;
            if (cat === "tools") return theme.teal;
            if (cat === "user") return theme.ink;
            if (cat === "code") return theme.sage;
            return theme.copper;
          };

          fillRoundRect(ctx, padX, barY, barW, barH, 8, theme.bg, theme.line, 1);

          const gap = 2;
          const usableW = barW - 8 - gap * (SESSION_SLICES.length - 1);
          let x = padX + 4;
          const rects: { x: number; w: number }[] = [];

          SESSION_SLICES.forEach((s, i) => {
            const w = Math.max(4, (s.tokens / SESSION_TOTAL_TOKENS) * usableW);
            const isActive = i === selectedIdx;
            const col = colorFor(s.category);

            ctx.globalAlpha = isActive ? 1 : 0.62;
            fillRoundRect(
              ctx,
              x,
              isActive ? barY + 2 : barY + 5,
              w,
              isActive ? barH - 4 : barH - 10,
              4,
              col,
              isActive ? theme.ink : undefined,
              isActive ? 1.5 : 0,
            );
            ctx.globalAlpha = 1;

            if (w > 64) {
              drawLabel(ctx, `${(s.tokens / 1000).toFixed(1)}K`, x + w / 2, barY + barH / 2, {
                color: theme.bg,
                font: theme.fontSans,
                size: 10.5,
                weight: 600,
                align: "center",
              });
            }

            rects.push({ x, w: w + gap });
            x += w + gap;
          });
          rectsRef.current = rects;

          // Quiet bottom legend
          const ly = height - 15;
          let lx = padX;
          for (const [label, col] of [
            ["System", theme.muted],
            ["Tools", theme.teal],
            ["User", theme.ink],
            ["Code", theme.sage],
            ["Logs & grep", theme.copper],
          ] as const) {
            fillRoundRect(ctx, lx, ly - 4, 8, 8, 2, col);
            drawLabel(ctx, label, lx + 12, ly, { color: theme.dim, font: theme.fontSans, size: 10.5 });
            lx += ctx.measureText(label).width + 24;
          }
        }}
      />
    </Figure>
  );
}

/* ==========================================================================
   Figure 2: Causal Attention Arcs (Why Prefix Caching Breaks Strictly Rightward)
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

          drawLabel(ctx, "Causal attention flows left -> right", padX, 18, {
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

          for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
              const from = centers[i];
              const to = centers[j];
              const span = j - i;
              const archH = 18 + span * 15;
              const midX = (from.cx + to.cx) / 2;
              const ctrlY = blockY - archH;

              if (i === sim.editedIndex) continue;

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

          const origin = centers[sim.editedIndex];
          for (let j = sim.editedIndex + 1; j < n; j++) {
            const to = centers[j];
            const span = j - sim.editedIndex;
            const archH = 20 + span * 16;
            const midX = (origin.cx + to.cx) / 2;
            const ctrlY = blockY - archH;

            const arcStart = (span - 1) * 0.14;
            const arcProg = Math.max(0, Math.min(1, (sim.ripple - arcStart) / 0.45));
            if (arcProg <= 0) continue;

            ctx.beginPath();
            ctx.moveTo(origin.cx, origin.topY - 2);
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

            if (arcProg > 0.92) {
              ctx.fillStyle = theme.crimson;
              ctx.beginPath();
              ctx.arc(to.cx, to.topY - 3, 2.8, 0, Math.PI * 2);
              ctx.fill();
            }
          }

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
   Figure 3: The 2D Quadratic Turn x Token Triangle (O(N^2) vs O(N) vs Compact)
   ========================================================================== */

export function TurnTriangleFigure() {
  const [mode, setMode] = useState<TriangleMode>("cached");
  const revealRef = useRef(TRIANGLE_TURNS);
  const data = useMemo(() => buildTurnTriangle(mode), [mode]);

  const switchMode = (next: TriangleMode) => {
    setMode(next);
    revealRef.current = 0.5;
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

/* ==========================================================================
   Figure 4: Build-Your-Own Harness Sandbox (20-Turn Compound Cost)
   ========================================================================== */

export function HarnessBudgetSandbox() {
  const [cfg, setCfg] = useState<HarnessConfig>({
    staticSystem: false,
    leanTools: false,
    capLogs: false,
  });

  const res = useMemo(() => simulateHarness20Turns(cfg), [cfg]);
  const worst = useMemo(
    () => simulateHarness20Turns({ staticSystem: false, leanTools: false, capLogs: false }),
    [],
  );

  const toggle = (key: keyof HarnessConfig) => setCfg((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <Figure
      caption={`20-turn session: $${res.totalCostUsd.toFixed(2)} total input cost (${Math.round(res.cachedHitRate * 100)}% cached, ${Math.round(res.finalContextK)}K final context).`}
      controls={
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0.4rem" }}>
          <ChipButton active={cfg.staticSystem} onClick={() => toggle("staticSystem")}>
            {cfg.staticSystem ? "Static system prompt" : "Live timestamp in system"}
          </ChipButton>
          <ChipButton active={cfg.leanTools} onClick={() => toggle("leanTools")}>
            {cfg.leanTools ? "8 core tools" : "45 MCP tools"}
          </ChipButton>
          <ChipButton active={cfg.capLogs} onClick={() => toggle("capLogs")}>
            {cfg.capLogs ? "Cap test logs" : "Uncropped test logs"}
          </ChipButton>
        </div>
      }
    >
      <CanvasStage
        height={158}
        running={false}
        label="20-turn cumulative cost bars reacting to static system prompts, lean tool counts, and capped test logs"
        onFrame={({ ctx, width, height, theme }) => {
          ctx.clearRect(0, 0, width, height);

          const padX = 24;
          const topY = 42;
          const bottomY = height - 24;
          const chartH = bottomY - topY;
          const chartW = width - padX * 2;
          const maxTurn = Math.max(...worst.turnCostsUsd);
          const gap = 4;
          const barW = (chartW - gap * (res.turnCostsUsd.length - 1)) / res.turnCostsUsd.length;

          const allGood = cfg.staticSystem && cfg.leanTools && cfg.capLogs;
          const savingsX = worst.totalCostUsd / Math.max(0.01, res.totalCostUsd);

          drawLabel(ctx, `Per-turn input cost (20 turns, same model)`, padX, 18, {
            color: theme.muted,
            font: theme.fontSans,
            size: 11.5,
          });
          drawLabel(
            ctx,
            `$${res.totalCostUsd.toFixed(2)} total${savingsX > 1.2 ? ` (${savingsX.toFixed(1)}x cheaper)` : ""}`,
            width - padX,
            18,
            {
              color: allGood ? theme.sage : res.cachedHitRate === 0 ? theme.crimson : theme.copper,
              font: theme.fontSans,
              size: 12.5,
              weight: 600,
              align: "right",
            },
          );

          ctx.beginPath();
          ctx.moveTo(padX, bottomY);
          ctx.lineTo(width - padX, bottomY);
          ctx.strokeStyle = theme.line;
          ctx.lineWidth = 1;
          ctx.stroke();

          res.turnCostsUsd.forEach((cost, i) => {
            const x = padX + i * (barW + gap);
            // Subtle ghost bar of worst-case harness behind active bar so savings are felt visually!
            const worstH = Math.max(3, (worst.turnCostsUsd[i] / maxTurn) * chartH);
            fillRoundRect(ctx, x, bottomY - worstH, barW, worstH, 3, theme.bg, theme.line, 0.8);

            const h = Math.max(3, (cost / maxTurn) * chartH);
            const fill = allGood ? theme.sage : !cfg.staticSystem ? theme.crimson : theme.copper;
            fillRoundRect(ctx, x, bottomY - h, barW, h, 3, fill);

            if ((i + 1) % 5 === 0 || i === 0) {
              drawLabel(ctx, `T${i + 1}`, x + barW / 2, height - 10, {
                color: theme.dim,
                font: theme.fontSans,
                size: 9.5,
                align: "center",
              });
            }
          });
        }}
      />
    </Figure>
  );
}
