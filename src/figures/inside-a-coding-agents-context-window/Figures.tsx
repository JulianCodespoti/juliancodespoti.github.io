import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { CanvasStage, clamp, drawArrowHead, drawLabel, fillRoundRect, stepSpring, type SpringScalar } from "../../runtime";
import { ChipButton, Figure, IconButton, Toggle } from "../../ui";
import {
  buildTurnTriangle,
  CAUSAL_BLOCKS,
  createCausalCache,
  editCausalBlock,
  getCausalCacheStats,
  getSessionSlices,
  SESSION_TOTAL_TOKENS,
  simulateHarness20Turns,
  stepCausalCache,
  TRIANGLE_TURNS,
  type HarnessConfig,
  type SliceCategory,
  type TriangleMode,
} from "./model";

/* ==========================================================================
   Figure 1: Magnetic Scrubbable Session Anatomy + Live Log-Cropping Spring
   ========================================================================== */

export function SessionAnatomyFigure() {
  const [selectedIdx, setSelectedIdx] = useState(6);
  const [cropped, setCropped] = useState(false);
  const slices = useMemo(() => getSessionSlices(cropped), [cropped]);
  const totalTokens = useMemo(() => slices.reduce((acc, s) => acc + s.tokens, 0), [slices]);
  const centersRef = useRef<number[]>([]);
  const logTokensSpringRef = useRef<SpringScalar>({ value: 19_800, velocity: 0 });
  const draggingRef = useRef(false);

  const active = slices[selectedIdx];
  const pct = ((active.tokens / totalTokens) * 100).toFixed(1);

  const pickNearestSlice = (x: number) => {
    const centers = centersRef.current;
    if (centers.length === 0) return;
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < centers.length; i++) {
      const d = Math.abs(x - centers[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    setSelectedIdx(bestIdx);
  };

  return (
    <Figure
      caption={`${active.label}: ${active.tokens.toLocaleString()} tokens (${pct}% of the prompt) - ${active.preview}`}
      controls={
        <>
          <ChipButton
            status={cropped ? "good" : "bad"}
            active={cropped}
            onClick={() => setCropped((c) => !c)}
          >
            {cropped ? "Test log capped (120 lines)" : "Uncropped test log (19.8K)"}
          </ChipButton>
          <div style={{ display: "inline-flex", gap: "0.35rem" }}>
            <IconButton
              label="Previous prompt slice"
              onClick={() => setSelectedIdx((i) => (i - 1 + slices.length) % slices.length)}
            >
              <ChevronLeft size={14} />
            </IconButton>
            <IconButton
              label="Next prompt slice"
              onClick={() => setSelectedIdx((i) => (i + 1) % slices.length)}
            >
              <ChevronRight size={14} />
            </IconButton>
          </div>
        </>
      }
    >
      <CanvasStage
        height={146}
        cursor="ew-resize"
        touchAction="pan-y"
        label="Proportional horizontal tape of a 47.2K token coding agent session showing user prompts, tool schemas, file reads, and an uncropped 19.8K test failure log"
        onPointerDown={(p) => {
          draggingRef.current = true;
          pickNearestSlice(p.x);
        }}
        onPointerMove={(p) => {
          if (p.pointerType === "mouse" || draggingRef.current) {
            pickNearestSlice(p.x);
          }
        }}
        onPointerUp={() => {
          draggingRef.current = false;
        }}
        onPointerLeave={() => {
          draggingRef.current = false;
        }}
        onFrame={({ ctx, width, height, dt, theme }) => {
          const targetLog = cropped ? 1_400 : 19_800;
          stepSpring(logTokensSpringRef.current, targetLog, dt, 180, 22);
          const animLogTokens = Math.max(1_000, logTokensSpringRef.current.value);

          const animSlices = slices.map((s) => (s.id === "t1" ? { ...s, tokens: animLogTokens } : s));
          const animTotal = animSlices.reduce((acc, s) => acc + s.tokens, 0);

          ctx.clearRect(0, 0, width, height);
          const compact = width < 480;
          const padX = compact ? 12 : 20;
          const hudH = 34;

          // Dedicated HUD header
          ctx.fillStyle = theme.surfaceSub;
          ctx.fillRect(0, 0, width, hudH);
          ctx.beginPath();
          ctx.moveTo(0, hudH + 0.5);
          ctx.lineTo(width, hudH + 0.5);
          ctx.strokeStyle = theme.line;
          ctx.lineWidth = 1;
          ctx.stroke();

          const freedK = (SESSION_TOTAL_TOKENS - animTotal) / 1000;
          const leftHeader =
            freedK > 0.5
              ? `${(animTotal / 1000).toFixed(1)}K tokens (-${freedK.toFixed(1)}K saved)`
              : `${(animTotal / 1000).toFixed(1)}K tokens total`;
          const shortActive =
            compact && active.label.length > 18 ? `${active.label.slice(0, 16)}...` : active.label;

          drawLabel(ctx, leftHeader, padX, hudH / 2, {
            color: freedK > 0.5 ? theme.sage : theme.muted,
            font: theme.fontMono,
            size: compact ? 10.5 : 11.2,
            weight: freedK > 0.5 ? 600 : 500,
          });
          drawLabel(ctx, `${shortActive} (${pct}%)`, width - padX, hudH / 2, {
            color: active.category === "logs" ? theme.copper : active.category === "code" ? theme.sage : theme.teal,
            font: theme.fontSans,
            size: compact ? 10.5 : 11.8,
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

          const barW = width - padX * 2;
          const barY = 56;
          const barH = 44;

          // Outer 47.2K capacity reference shell so shrinking the log visibly frees empty space!
          fillRoundRect(ctx, padX, barY, barW, barH, 8, theme.bg, theme.line, 1);

          const gap = 2;
          const innerW = barW - 8;
          const usedRatio = clamp(animTotal / SESSION_TOTAL_TOKENS, 0.3, 1);
          const usableW = Math.max(40, innerW * usedRatio - gap * (animSlices.length - 1));
          let x = padX + 4;
          const centers: number[] = [];
          let activeCenter = x;

          animSlices.forEach((s, i) => {
            const w = Math.max(4.5, (s.tokens / animTotal) * usableW);
            const isActive = i === selectedIdx;
            const col = colorFor(s.category);

            ctx.globalAlpha = isActive ? 1 : 0.66;
            fillRoundRect(
              ctx,
              x,
              isActive ? barY + 2 : barY + 6,
              w,
              isActive ? barH - 4 : barH - 12,
              4,
              col,
              isActive ? theme.ink : undefined,
              isActive ? 1.6 : 0,
            );
            ctx.globalAlpha = 1;

            if (w > 54) {
              drawLabel(ctx, `${(s.tokens / 1000).toFixed(1)}K`, x + w / 2, barY + barH / 2, {
                color: theme.bg,
                font: theme.fontMono,
                size: 10.5,
                weight: 600,
                align: "center",
              });
            }

            const cx = x + w / 2;
            centers.push(cx);
            if (isActive) activeCenter = cx;
            x += w + gap;
          });
          centersRef.current = centers;

          // Subtle freed-headroom label when log is capped
          const freeSpaceLeft = x + 6;
          const freeSpaceW = padX + barW - 6 - freeSpaceLeft;
          if (freeSpaceW > 74) {
            drawLabel(ctx, `-${freedK.toFixed(1)}K freed`, freeSpaceLeft + freeSpaceW / 2, barY + barH / 2, {
              color: theme.sage,
              font: theme.fontMono,
              size: 10.5,
              weight: 600,
              align: "center",
            });
          }

          // Pointer caret above selected slice so tiny 180-token User slices are unmistakably indicated
          ctx.fillStyle = theme.ink;
          ctx.beginPath();
          ctx.moveTo(activeCenter, barY - 2);
          ctx.lineTo(activeCenter - 4.5, barY - 8);
          ctx.lineTo(activeCenter + 4.5, barY - 8);
          ctx.closePath();
          ctx.fill();

          // Quiet bottom legend
          const ly = height - 15;
          let lx = padX;
          const legendFontSize = compact ? 10 : 10.8;
          const legendGap = compact ? 14 : 24;
          for (const [label, col] of [
            ["System", theme.muted],
            ["Tools", theme.teal],
            ["User", theme.ink],
            ["Code", theme.sage],
            [compact ? "Logs" : "Logs & grep", theme.copper],
          ] as const) {
            fillRoundRect(ctx, lx, ly - 4, 7.5, 7.5, 2, col);
            drawLabel(ctx, label, lx + 10.5, ly, { color: theme.dim, font: theme.fontSans, size: legendFontSize });
            lx += ctx.measureText(label).width + legendGap;
          }
        }}
      />
    </Figure>
  );
}

/* ==========================================================================
   Figure 2: Causal Attention Arcs with Arrowheads & Block Token Weights
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

  const pickByX = (x: number) => {
    const idx = rectsRef.current.findIndex((r) => x >= r.x - 4 && x <= r.x + r.w + 4);
    if (idx >= 0) selectBlock(idx);
  };

  const stats = getCausalCacheStats(simRef.current);
  const edited = CAUSAL_BLOCKS[simRef.current.editedIndex];
  const mult = stats.costCents / Math.max(0.01, stats.bestCostCents);

  return (
    <Figure
      caption={
        simRef.current.editedIndex === CAUSAL_BLOCKS.length - 1
          ? `Only "${edited.label}" changed: every block to its left stays cached (${Math.round(stats.hitRate * 100)}% hit, ${stats.costCents.toFixed(2)}c). Tap or scrub earlier blocks.`
          : `Editing "${edited.label}" forces ${stats.recomputedK}K tokens to recompute (${mult.toFixed(1)}x cost vs append-only, ${Math.round(stats.hitRate * 100)}% hit).`
      }
    >
      <CanvasStage
        height={(w) => (w < 480 ? 206 : 210)}
        cursor="pointer"
        touchAction="pan-y"
        label="Causal attention arcs flowing left-to-right across 6 prompt blocks showing why editing an early block invalidates every block after it"
        onPointerDown={(p) => pickByX(p.x)}
        onPointerMove={(p) => {
          if (p.pointerType === "mouse") pickByX(p.x);
        }}
        onFrame={({ ctx, width, height, dt, theme }) => {
          const sim = simRef.current;
          stepCausalCache(sim, dt);
          const s = getCausalCacheStats(sim);
          const costMult = s.costCents / Math.max(0.01, s.bestCostCents);
          ctx.clearRect(0, 0, width, height);

          const compact = width < 480;
          const padX = compact ? 10 : 20;
          const hudH = 34;

          ctx.fillStyle = theme.surfaceSub;
          ctx.fillRect(0, 0, width, hudH);
          ctx.beginPath();
          ctx.moveTo(0, hudH + 0.5);
          ctx.lineTo(width, hudH + 0.5);
          ctx.strokeStyle = theme.line;
          ctx.lineWidth = 1;
          ctx.stroke();

          drawLabel(ctx, compact ? "Causal: left -> right" : "Causal attention flows left -> right", padX, hudH / 2, {
            color: theme.muted,
            font: theme.fontSans,
            size: compact ? 10.5 : 11.5,
          });
          drawLabel(
            ctx,
            compact
              ? `${s.costCents.toFixed(2)}c (${Math.round(s.hitRate * 100)}% hit)`
              : `Turn cost: ${s.costCents.toFixed(2)}c (${costMult.toFixed(1)}x)  ·  ${Math.round(s.hitRate * 100)}% cached`,
            width - padX,
            hudH / 2,
            {
              color: s.hitRate > 0.7 ? theme.sage : theme.crimson,
              font: theme.fontMono,
              size: compact ? 10.5 : 11.5,
              weight: 600,
              align: "right",
            },
          );

          const n = CAUSAL_BLOCKS.length;
          const gap = compact ? 5 : 8;
          const blockW = (width - padX * 2 - gap * (n - 1)) / n;
          const blockH = 56;
          const blockY = height - blockH - 18;

          const centers: { cx: number; topY: number }[] = [];
          const rects: { x: number; y: number; w: number; h: number }[] = [];

          for (let i = 0; i < n; i++) {
            const x = padX + i * (blockW + gap);
            rects.push({ x, y: blockY, w: blockW, h: blockH });
            centers.push({ cx: x + blockW / 2, topY: blockY });
          }
          rectsRef.current = rects;

          // Ambient causal attention arcs
          for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
              if (i === sim.editedIndex) continue;
              const from = centers[i];
              const to = centers[j];
              const span = j - i;
              const archH = 18 + span * 15;
              const midX = (from.cx + to.cx) / 2;
              const ctrlY = blockY - archH;

              ctx.beginPath();
              ctx.moveTo(from.cx, from.topY - 2);
              ctx.quadraticCurveTo(midX, ctrlY, to.cx, to.topY - 2);
              ctx.strokeStyle = j < sim.editedIndex ? theme.sage : theme.lineStrong;
              ctx.globalAlpha = j < sim.editedIndex ? 0.36 : 0.25;
              ctx.lineWidth = 1.1;
              ctx.stroke();
            }
          }
          ctx.globalAlpha = 1;

          // Crimson rightward invalidation arcs with directional arrowheads
          const origin = centers[sim.editedIndex];
          for (let j = sim.editedIndex + 1; j < n; j++) {
            const to = centers[j];
            const span = j - sim.editedIndex;
            const archH = 22 + span * 16;
            const midX = (origin.cx + to.cx) / 2;
            const ctrlY = blockY - archH;

            const arcStart = (span - 1) * 0.13;
            const arcProg = clamp((sim.ripple - arcStart) / 0.45, 0, 1);
            if (arcProg <= 0) continue;

            ctx.beginPath();
            ctx.moveTo(origin.cx, origin.topY - 2);
            const steps = 22;
            let lastX = origin.cx;
            let lastY = origin.topY - 2;
            let prevX = lastX;
            let prevY = lastY;
            for (let k = 1; k <= steps; k++) {
              const t = (k / steps) * arcProg;
              const inv = 1 - t;
              const px = inv * inv * origin.cx + 2 * inv * t * midX + t * t * to.cx;
              const py = inv * inv * (origin.topY - 2) + 2 * inv * t * ctrlY + t * t * (to.topY - 2);
              ctx.lineTo(px, py);
              prevX = lastX;
              prevY = lastY;
              lastX = px;
              lastY = py;
            }
            ctx.strokeStyle = theme.crimson;
            ctx.lineWidth = 1.9;
            ctx.stroke();

            if (arcProg > 0.2) {
              const ang = Math.atan2(lastY - prevY, lastX - prevX);
              drawArrowHead(ctx, lastX, lastY, ang, 6.5, theme.crimson);
            }
          }

          // Prompt blocks with token count badges
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

            drawLabel(ctx, compact ? b.shortLabel : b.label, r.x + r.w / 2, r.y + 15, {
              color: theme.ink,
              font: theme.fontSans,
              size: compact ? 10.5 : 11.5,
              weight: 600,
              align: "center",
            });
            drawLabel(ctx, `${b.tokensK}K`, r.x + r.w / 2, r.y + 31, {
              color: theme.muted,
              font: theme.fontMono,
              size: compact ? 9.5 : 10,
              align: "center",
            });
            drawLabel(ctx, isEdited ? "edited" : cached ? "cached" : "miss", r.x + r.w / 2, r.y + 45, {
              color: cached ? theme.sage : theme.crimson,
              font: theme.fontSans,
              size: compact ? 9.5 : 10,
              weight: 600,
              align: "center",
            });
          });
        }}
      />
    </Figure>
  );
}

/* ==========================================================================
   Figure 3: Interactive 2D Quadratic Turn x Token Triangle
   ========================================================================== */

export function TurnTriangleFigure() {
  const [mode, setMode] = useState<TriangleMode>("cached");
  const [inspectRow, setInspectRow] = useState<number | null>(null);
  const revealRef = useRef(TRIANGLE_TURNS);
  const rowBoundsRef = useRef<{ y: number; h: number }[]>([]);
  const data = useMemo(() => buildTurnTriangle(mode), [mode]);
  const cachedBaseline = useMemo(() => buildTurnTriangle("cached"), []);

  const switchMode = (next: TriangleMode) => {
    setMode(next);
    setInspectRow(null);
    revealRef.current = 0.5;
  };

  const replay = () => {
    revealRef.current = 0.5;
  };

  const inspected = inspectRow !== null ? data.rows[inspectRow] : null;

  return (
    <Figure
      caption={
        inspected
          ? `Turn ${inspected.turn}: ${inspected.cachedK}K cached (0.1x) + ${inspected.fullK}K full-price (1.0x) = ${inspected.turnCostCents.toFixed(2)}c.`
          : mode === "uncached"
            ? `Without caching, you re-pay the entire 2D triangle (${data.totalCostCents.toFixed(1)}c across 12 turns, ${(data.totalCostCents / cachedBaseline.totalCostCents).toFixed(1)}x more than prefix cache).`
            : mode === "cached"
              ? `Prefix caching turns the interior green (0.1x), leaving only the thin copper diagonal at full price (${data.totalCostCents.toFixed(1)}c). Tap or hover any row to inspect.`
              : `Summarizing on turns 4, 8, and 12 shrinks rows slightly, but crimson cache-miss resets push total cost to ${data.totalCostCents.toFixed(1)}c (${(data.totalCostCents / cachedBaseline.totalCostCents).toFixed(1)}x vs warm cache).`
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
              { value: "summarize", label: "Summarize every 4" },
            ]}
          />
          <IconButton accent label="Replay 12-turn session" onClick={replay}>
            <RotateCcw size={14} />
          </IconButton>
        </>
      }
    >
      <CanvasStage
        height={292}
        cursor="pointer"
        touchAction="pan-y"
        label="2D triangle of 12 coding agent turns showing quadratic token growth, green prefix cache interior, and crimson cache-miss rows on mid-session summarization"
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
          if (revealRef.current < TRIANGLE_TURNS) {
            revealRef.current = Math.min(TRIANGLE_TURNS, revealRef.current + dt * 9);
          }
          const visibleRows = Math.ceil(revealRef.current);
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

          let runningCost = 0;
          for (let r = 0; r < visibleRows; r++) {
            runningCost += data.rows[r].turnCostCents;
          }

          drawLabel(ctx, compact ? "1 sq = 2K tokens" : "1 square = 2K input tokens", padX, hudH / 2, {
            color: theme.muted,
            font: theme.fontSans,
            size: compact ? 10.5 : 11.5,
          });
          drawLabel(
            ctx,
            mode === "cached"
              ? `12-turn total: ${runningCost.toFixed(1)}c`
              : `${runningCost.toFixed(1)}c (vs ${cachedBaseline.totalCostCents.toFixed(1)}c cached)`,
            width - padX,
            hudH / 2,
            {
              color: mode === "cached" ? theme.sage : mode === "summarize" ? theme.crimson : theme.copper,
              font: theme.fontMono,
              size: compact ? 10.5 : 11.5,
              weight: 600,
              align: "right",
            },
          );

          const labelW = compact ? 28 : 42;
          const maxCols = 15;
          const availW = width - padX * 2 - labelW;
          const gap = compact ? 3 : 4;
          const cellSize = Math.min(13.5, Math.max(8, Math.floor((availW - gap * (maxCols - 1)) / maxCols)));
          const pitch = cellSize + gap;
          const startX = padX + labelW;
          const startY = hudH + 14;
          const rowStep = cellSize + 4;
          const bounds: { y: number; h: number }[] = [];

          for (let r = 0; r < visibleRows; r++) {
            const row = data.rows[r];
            const rowProg = clamp(revealRef.current - r, 0, 1);
            const rowEase = 1 - Math.pow(1 - rowProg, 3);
            const y = startY + r * rowStep;
            bounds.push({ y: y - 2, h: rowStep });
            const hasMiss = row.cells.includes("miss");
            const isHovered = inspectRow === r;

            if (isHovered) {
              fillRoundRect(ctx, padX - 4, y - 2, width - padX * 2 + 8, cellSize + 4, 4, theme.surfaceSub);
            }

            ctx.save();
            ctx.globalAlpha = rowEase;
            drawLabel(ctx, `T${row.turn}`, padX, y + cellSize / 2, {
              color: isHovered ? theme.ink : hasMiss ? theme.crimson : theme.dim,
              font: theme.fontMono,
              size: compact ? 9.8 : 10.5,
              weight: hasMiss || isHovered ? 600 : 500,
            });

            row.cells.forEach((cell, c) => {
              const x = startX + c * pitch;
              const fill = cell === "cached" ? theme.sage : cell === "miss" ? theme.crimson : theme.copper;
              const sc = 0.65 + 0.35 * rowEase;
              const off = (cellSize * (1 - sc)) / 2;
              ctx.globalAlpha = rowEase * (inspectRow !== null && !isHovered ? 0.55 : 1);
              fillRoundRect(ctx, x + off, y + off, cellSize * sc, cellSize * sc, 2.5, fill);
            });
            ctx.restore();

            if (hasMiss && rowEase > 0.7) {
              const tagText = compact ? "miss" : "summarized (cache miss)";
              const endX = startX + row.cells.length * pitch + 7;
              ctx.font = `600 ${compact ? 9.5 : 10.5}px ${theme.fontSans}`;
              const textW = ctx.measureText(tagText).width;
              if (endX + textW <= width - padX + 2) {
                drawLabel(ctx, tagText, endX, y + cellSize / 2, {
                  color: theme.crimson,
                  font: theme.fontSans,
                  size: compact ? 9.5 : 10.5,
                  weight: 600,
                });
              }
            } else if (isHovered && !compact) {
              drawLabel(ctx, `${row.turnCostCents.toFixed(2)}c`, width - padX, y + cellSize / 2, {
                color: theme.ink,
                font: theme.fontMono,
                size: 10.5,
                weight: 600,
                align: "right",
              });
            }
          }
          rowBoundsRef.current = bounds;

          // Subtle diagonal hypotenuse guide emphasizing O(N^2) triangle area in cached/uncached modes
          if (mode !== "summarize" && visibleRows >= 4) {
            const firstEnd = startX + data.rows[0].cells.length * pitch + 5;
            const lastRow = data.rows[visibleRows - 1];
            const lastEnd = startX + lastRow.cells.length * pitch + 5;
            ctx.save();
            ctx.setLineDash([3, 3]);
            ctx.strokeStyle = mode === "cached" ? theme.copperLine : theme.lineStrong;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(firstEnd, startY + cellSize / 2);
            ctx.lineTo(lastEnd, startY + (visibleRows - 1) * rowStep + cellSize / 2);
            ctx.stroke();
            ctx.restore();
          }

          const ly = height - 14;
          let lx = padX;
          const legendGap = compact ? 14 : 26;
          for (const [label, col] of [
            ["Cached (0.1x)", theme.sage],
            [compact ? "New (1.0x)" : "New tokens (1.0x)", theme.copper],
            [compact ? "Miss (1.0x)" : "Recomputed prefix (1.0x)", theme.crimson],
          ] as const) {
            fillRoundRect(ctx, lx, ly - 4, 8, 8, 2, col);
            drawLabel(ctx, label, lx + 11, ly, {
              color: theme.dim,
              font: theme.fontSans,
              size: compact ? 10 : 10.8,
            });
            lx += ctx.measureText(label).width + legendGap;
          }
        }}
      />
    </Figure>
  );
}

/* ==========================================================================
   Figure 4: Spring-Animated Stacked Turn-Cost Harness Sandbox (20 Turns)
   ========================================================================== */

export function HarnessBudgetSandbox() {
  const [cfg, setCfg] = useState<HarnessConfig>({
    staticSystem: false,
    leanTools: false,
    capLogs: false,
  });
  const [hoveredTurn, setHoveredTurn] = useState<number | null>(null);

  const res = useMemo(() => simulateHarness20Turns(cfg), [cfg]);
  const worst = useMemo(
    () => simulateHarness20Turns({ staticSystem: false, leanTools: false, capLogs: false }),
    [],
  );

  // Per-bar spring scalars for silky physical collapse as levers flip
  const cachedSpringsRef = useRef<SpringScalar[]>(
    worst.turnCachedCostsUsd.map((v) => ({ value: v, velocity: 0 })),
  );
  const uncachedSpringsRef = useRef<SpringScalar[]>(
    worst.turnUncachedCostsUsd.map((v) => ({ value: v, velocity: 0 })),
  );
  const barXRef = useRef<{ x: number; w: number }[]>([]);

  const toggle = (key: keyof HarnessConfig) => setCfg((prev) => ({ ...prev, [key]: !prev[key] }));

  const inspectedTurn = hoveredTurn !== null ? hoveredTurn : null;

  return (
    <Figure
      caption={
        inspectedTurn !== null
          ? `Turn ${inspectedTurn + 1}: $${res.turnCachedCostsUsd[inspectedTurn].toFixed(3)} cached + $${res.turnUncachedCostsUsd[inspectedTurn].toFixed(3)} uncached = $${res.turnCostsUsd[inspectedTurn].toFixed(3)} (worst case: $${worst.turnCostsUsd[inspectedTurn].toFixed(3)}).`
          : `20-turn session: $${res.totalCostUsd.toFixed(2)} total input cost (${Math.round(res.cachedHitRate * 100)}% cached, ${Math.round(res.finalContextK)}K final context).`
      }
      controls={
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0.42rem" }}>
          <ChipButton
            status={cfg.staticSystem ? "good" : "bad"}
            active={cfg.staticSystem}
            onClick={() => toggle("staticSystem")}
          >
            {cfg.staticSystem ? "Static system prompt" : "Live timestamp in system"}
          </ChipButton>
          <ChipButton
            status={cfg.leanTools ? "good" : "bad"}
            active={cfg.leanTools}
            onClick={() => toggle("leanTools")}
          >
            {cfg.leanTools ? "8 core tools" : "45 MCP tools"}
          </ChipButton>
          <ChipButton
            status={cfg.capLogs ? "good" : "bad"}
            active={cfg.capLogs}
            onClick={() => toggle("capLogs")}
          >
            {cfg.capLogs ? "Cap test logs" : "Uncropped test logs"}
          </ChipButton>
        </div>
      }
    >
      <CanvasStage
        height={186}
        cursor="pointer"
        touchAction="pan-y"
        label="Spring-animated 20-turn stacked cost bars showing cached versus uncached spend reacting to static system prompts, lean tool counts, and capped test logs"
        onPointerMove={(p) => {
          if (p.pointerType !== "mouse") return;
          const idx = barXRef.current.findIndex((b) => p.x >= b.x - 2 && p.x <= b.x + b.w + 2);
          setHoveredTurn(idx >= 0 ? idx : null);
        }}
        onPointerDown={(p) => {
          const idx = barXRef.current.findIndex((b) => p.x >= b.x - 2 && p.x <= b.x + b.w + 2);
          setHoveredTurn((prev) => (idx >= 0 ? (prev === idx ? null : idx) : null));
        }}
        onPointerLeave={() => setHoveredTurn(null)}
        onFrame={({ ctx, width, height, dt, theme }) => {
          for (let i = 0; i < 20; i++) {
            const stiffness = 175 + i * 4;
            stepSpring(cachedSpringsRef.current[i], res.turnCachedCostsUsd[i], dt, stiffness, 22);
            stepSpring(uncachedSpringsRef.current[i], res.turnUncachedCostsUsd[i], dt, stiffness, 22);
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

          const allGood = cfg.staticSystem && cfg.leanTools && cfg.capLogs;
          const savingsX = worst.totalCostUsd / Math.max(0.01, res.totalCostUsd);

          drawLabel(
            ctx,
            compact ? "20-turn stacked cost" : "Per-turn input cost (20 turns, same model)",
            padX,
            hudH / 2,
            {
              color: theme.muted,
              font: theme.fontSans,
              size: compact ? 10.5 : 11.5,
            },
          );
          drawLabel(
            ctx,
            `$${res.totalCostUsd.toFixed(2)}${savingsX > 1.15 ? ` (${savingsX.toFixed(1)}x cheaper)` : " worst case"}`,
            width - padX,
            hudH / 2,
            {
              color: allGood ? theme.sage : !cfg.staticSystem ? theme.crimson : theme.copper,
              font: theme.fontMono,
              size: compact ? 10.5 : 11.5,
              weight: 600,
              align: "right",
            },
          );

          const topY = hudH + 16;
          const bottomY = height - 30;
          const chartH = bottomY - topY;
          const chartW = width - padX * 2;
          const maxTurn = Math.max(...worst.turnCostsUsd);
          const gap = compact ? 3 : 5;
          const barW = (chartW - gap * 19) / 20;

          ctx.beginPath();
          ctx.moveTo(padX, bottomY + 0.5);
          ctx.lineTo(width - padX, bottomY + 0.5);
          ctx.strokeStyle = theme.lineStrong;
          ctx.lineWidth = 1;
          ctx.stroke();

          const bars: { x: number; w: number }[] = [];

          for (let i = 0; i < 20; i++) {
            const x = padX + i * (barW + gap);
            bars.push({ x, w: barW });
            const isHov = hoveredTurn === i;

            // Ghost worst-case silhouette behind active bar
            const worstH = Math.max(3, (worst.turnCostsUsd[i] / maxTurn) * chartH);
            fillRoundRect(
              ctx,
              x,
              bottomY - worstH,
              barW,
              worstH,
              3,
              isHov ? theme.surfaceSub : theme.bg,
              isHov ? theme.lineStrong : theme.line,
              isHov ? 1.2 : 0.85,
            );

            const cUsd = Math.max(0, cachedSpringsRef.current[i].value);
            const uUsd = Math.max(0, uncachedSpringsRef.current[i].value);
            const totalUsd = cUsd + uUsd;
            const totalH = Math.max(2.5, (totalUsd / maxTurn) * chartH);
            const cachedH = totalUsd > 0 ? (cUsd / totalUsd) * totalH : 0;
            const uncachedH = Math.max(0, totalH - cachedH);

            // Stacked base: cached prefix cost (sage)
            if (cachedH > 0.5) {
              fillRoundRect(ctx, x, bottomY - cachedH, barW, cachedH, 2.5, theme.sage);
            }
            // Stacked cap: full-price uncached tokens (crimson when cache broken, copper when healthy)
            if (uncachedH > 0.5) {
              const capCol = !cfg.staticSystem ? theme.crimson : theme.copper;
              fillRoundRect(ctx, x, bottomY - cachedH - uncachedH, barW, uncachedH, 2.5, capCol);
            }

            if ((i + 1) % 5 === 0 || i === 0) {
              drawLabel(ctx, `T${i + 1}`, x + barW / 2, bottomY + 12, {
                color: isHov ? theme.ink : theme.dim,
                font: theme.fontMono,
                size: 9.5,
                weight: isHov ? 600 : 500,
                align: "center",
              });
            }
          }
          barXRef.current = bars;

          // Mini legend in top-left of chart area
          const legY = topY + 2;
          let lx = padX + 2;
          for (const [label, col] of [
            ["Cached (0.1x)", theme.sage],
            ["Full price (1.0x)", !cfg.staticSystem ? theme.crimson : theme.copper],
          ] as const) {
            fillRoundRect(ctx, lx, legY - 3.5, 7, 7, 1.8, col);
            drawLabel(ctx, label, lx + 10, legY, {
              color: theme.dim,
              font: theme.fontSans,
              size: 10,
            });
            lx += ctx.measureText(label).width + 20;
          }
        }}
      />
    </Figure>
  );
}
