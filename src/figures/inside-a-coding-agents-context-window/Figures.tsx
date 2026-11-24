import { RotateCcw } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { CanvasStage, drawLabel, fillRoundRect } from "../../runtime";
import { ChipButton, Figure, IconButton, Slider, Toggle } from "../../ui";
import {
  appendTapeAction,
  computeToolSchemaTax,
  CONTEXT_WINDOW_TOKENS,
  createContextTape,
  createPrefixCacheState,
  getPrefixCacheMetrics,
  getTapeTotals,
  mutatePrefixAt,
  PREFIX_BLOCKS,
  simulateCompaction,
  stepContextTape,
  stepPrefixCache,
  type CompactionStrategy,
  type SegmentKind,
} from "./model";

/* ==========================================================================
   Figure 1: Proportional 200K Context Tape (Click real agent actions)
   ========================================================================== */

export function ContextTapeFigure() {
  const simRef = useRef(createContextTape());
  const [caption, setCaption] = useState(simRef.current.lastEvent);
  const [, bump] = useState(0);

  const act = (kind: "file" | "logs" | "subagent") => {
    appendTapeAction(simRef.current, kind);
    setCaption(simRef.current.lastEvent);
    bump((n) => n + 1);
  };

  const reset = () => {
    simRef.current = createContextTape();
    setCaption(simRef.current.lastEvent);
    bump((n) => n + 1);
  };

  return (
    <Figure
      caption={caption}
      controls={
        <>
          <ChipButton onClick={() => act("file")}>Read file (+4.5K)</ChipButton>
          <ChipButton accent onClick={() => act("logs")}>Run verbose tests (+22K)</ChipButton>
          <ChipButton onClick={() => act("subagent")}>Subagent search (+0.45K)</ChipButton>
          <IconButton label="Reset context window" onClick={reset}>
            <RotateCcw size={14} />
          </IconButton>
        </>
      }
    >
      <CanvasStage
        height={138}
        label="Proportional 200K token context window tape showing files, verbose test logs, and subagent summaries"
        onFrame={({ ctx, width, height, dt, theme }) => {
          const sim = simRef.current;
          stepContextTape(sim, dt);
          ctx.clearRect(0, 0, width, height);

          const padX = 20;
          const barW = width - padX * 2;
          const barY = 48;
          const barH = 38;
          const { total, noiseRatio, turnCostUsd } = getTapeTotals(sim);

          drawLabel(ctx, `${(total / 1000).toFixed(1)}K / 200K tokens`, padX, 24, {
            color: theme.ink,
            font: theme.fontSans,
            size: 12.5,
            weight: 600,
          });
          drawLabel(
            ctx,
            `Noise: ${Math.round(noiseRatio * 100)}%   |   $${turnCostUsd.toFixed(3)} / uncached turn`,
            width - padX,
            24,
            {
              color: noiseRatio > 0.45 ? theme.copper : theme.muted,
              font: theme.fontSans,
              size: 12,
              weight: 500,
              align: "right",
            },
          );

          // 200K container track
          fillRoundRect(ctx, padX, barY, barW, barH, 8, theme.bg, theme.lineStrong, 1);

          // Subtle 50K tick markers
          for (let q = 1; q < 4; q++) {
            const tx = padX + (q / 4) * barW;
            ctx.beginPath();
            ctx.moveTo(tx, barY + 4);
            ctx.lineTo(tx, barY + barH - 4);
            ctx.strokeStyle = theme.line;
            ctx.lineWidth = 1;
            ctx.stroke();
          }

          const colorFor = (kind: SegmentKind) => {
            if (kind === "system") return theme.muted;
            if (kind === "tools") return theme.teal;
            if (kind === "files") return theme.sage;
            if (kind === "logs") return theme.copper;
            return theme.ink;
          };

          // Animated proportional token segments
          ctx.save();
          ctx.beginPath();
          ctx.rect(padX + 2, barY + 2, barW - 4, barH - 4);
          ctx.clip();

          let cursorX = padX + 3;
          for (const seg of sim.segments) {
            const w = Math.max(2, (seg.animWidth.value / CONTEXT_WINDOW_TOKENS) * (barW - 6));
            fillRoundRect(ctx, cursorX, barY + 4, Math.max(2, w - 2), barH - 8, 4, colorFor(seg.kind));
            cursorX += w;
          }
          ctx.restore();

          // Quiet bottom inline legend
          const legend: [string, string][] = [
            ["System", theme.muted],
            ["Tools", theme.teal],
            ["Files", theme.sage],
            ["Test logs", theme.copper],
            ["Chat", theme.ink],
          ];
          let lx = padX;
          const ly = height - 18;
          for (const [label, col] of legend) {
            fillRoundRect(ctx, lx, ly - 4, 8, 8, 2, col);
            drawLabel(ctx, label, lx + 12, ly, { color: theme.dim, font: theme.fontSans, size: 11 });
            lx += ctx.measureText(label).width + 26;
          }
        }}
      />
    </Figure>
  );
}

/* ==========================================================================
   Figure 2: Tool Schema Tax (Slider 4 .. 60 tools)
   ========================================================================== */

export function ToolSchemaTaxFigure() {
  const [tools, setTools] = useState(12);
  const stats = useMemo(() => computeToolSchemaTax(tools), [tools]);

  return (
    <Figure
      caption={`${stats.toolCount} tools reserve ${(stats.schemaTokens / 1000).toFixed(1)}K tokens on every single turn (${(stats.twentyTurnTokens / 1000).toFixed(0)}K tokens across a 20-turn session).`}
      controls={
        <Slider
          label="Attached tools"
          min={4}
          max={60}
          step={2}
          value={tools}
          displayValue={`${tools}`}
          onChange={setTools}
        />
      }
    >
      <CanvasStage
        height={108}
        running={false}
        label="Visualization showing tool schema definitions eating up a growing slice of the 200K context window"
        onFrame={({ ctx, width, height, theme }) => {
          ctx.clearRect(0, 0, width, height);
          const padX = 20;
          const barW = width - padX * 2;
          const barY = 38;
          const barH = 34;

          drawLabel(ctx, "Fixed prefix before turn 1", padX, 18, {
            color: theme.muted,
            font: theme.fontSans,
            size: 12,
          });
          drawLabel(ctx, `${(stats.shareOfWindow * 100).toFixed(1)}% of 200K window`, width - padX, 18, {
            color: tools > 30 ? theme.copper : theme.teal,
            font: theme.fontSans,
            size: 12,
            weight: 600,
            align: "right",
          });

          fillRoundRect(ctx, padX, barY, barW, barH, 8, theme.bg, theme.lineStrong, 1);

          // System baseline (3.2K)
          const sysW = (3_200 / CONTEXT_WINDOW_TOKENS) * (barW - 6);
          fillRoundRect(ctx, padX + 3, barY + 4, sysW, barH - 8, 4, theme.muted);

          // Individual tool schema blocks packed tightly
          const toolsTotalW = (stats.schemaTokens / CONTEXT_WINDOW_TOKENS) * (barW - 6);
          const toolColor = tools > 30 ? theme.copper : theme.teal;
          fillRoundRect(ctx, padX + 5 + sysW, barY + 4, toolsTotalW, barH - 8, 4, toolColor);

          // Subtle internal dividers per tool
          const perToolW = toolsTotalW / stats.toolCount;
          if (perToolW > 3) {
            ctx.strokeStyle = theme.bg;
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let i = 1; i < stats.toolCount; i++) {
              const x = padX + 5 + sysW + i * perToolW;
              ctx.moveTo(x, barY + 6);
              ctx.lineTo(x, barY + barH - 6);
            }
            ctx.stroke();
          }

          drawLabel(ctx, "Free working room for code and reasoning", padX + barW - 8, barY + barH / 2, {
            color: theme.dim,
            font: theme.fontSans,
            size: 11,
            align: "right",
          });
          drawLabel(ctx, `~450 tokens per JSON tool schema`, padX, height - 14, {
            color: theme.dim,
            font: theme.fontSans,
            size: 10.5,
          });
        }}
      />
    </Figure>
  );
}

/* ==========================================================================
   Figure 3: Click-to-Mutate Prefix Cache Invalidation
   ========================================================================== */

export function PrefixCacheFigure() {
  const simRef = useRef(createPrefixCacheState());
  const blockRectsRef = useRef<{ x: number; w: number }[]>([]);
  const [caption, setCaption] = useState(simRef.current.reason);
  const [, bump] = useState(0);

  const trigger = (idx: number, reason?: string) => {
    mutatePrefixAt(simRef.current, idx, reason);
    setCaption(simRef.current.reason);
    bump((n) => n + 1);
  };

  return (
    <Figure
      caption={caption}
      controls={
        <>
          <ChipButton accent onClick={() => trigger(0, "Live timestamp in System prompt: 0% cache hit, full prefill recompute.")}>
            Timestamp in system
          </ChipButton>
          <ChipButton onClick={() => trigger(1, "Tool list changed mid-session: every turn after System misses cache.")}>
            Add MCP tool
          </ChipButton>
          <ChipButton onClick={() => trigger(PREFIX_BLOCKS.length - 1)}>
            Append cleanly
          </ChipButton>
        </>
      }
    >
      <CanvasStage
        height={138}
        cursor="pointer"
        label="Clickable multi-turn prompt showing cached green prefix blocks versus red recomputed blocks when an early block changes"
        onPointerDown={(p) => {
          const rects = blockRectsRef.current;
          for (let i = 0; i < rects.length; i++) {
            if (p.x >= rects[i].x && p.x <= rects[i].x + rects[i].w) {
              trigger(i);
              return;
            }
          }
        }}
        onFrame={({ ctx, width, height, dt, theme }) => {
          const sim = simRef.current;
          stepPrefixCache(sim, dt);
          const m = getPrefixCacheMetrics(sim);
          ctx.clearRect(0, 0, width, height);

          const padX = 20;
          const trackW = width - padX * 2;
          const y = 48;
          const h = 48;

          drawLabel(ctx, `Cache hit: ${Math.round(m.hitRate * 100)}%`, padX, 24, {
            color: m.hitRate > 0.7 ? theme.sage : theme.crimson,
            font: theme.fontSans,
            size: 12.5,
            weight: 600,
          });
          drawLabel(
            ctx,
            `Turn cost: ${m.costCents.toFixed(2)}c  (vs ${m.naiveCents.toFixed(2)}c uncached)`,
            width - padX,
            24,
            {
              color: theme.muted,
              font: theme.fontSans,
              size: 12,
              align: "right",
            },
          );

          const gap = 5;
          const availW = trackW - gap * (PREFIX_BLOCKS.length - 1);
          const minPillW = 62;
          const rawWidths = PREFIX_BLOCKS.map((b) => Math.max(minPillW, (b.tokens / m.total) * availW));
          const rawSum = rawWidths.reduce((a, w) => a + w, 0);
          const scaleW = availW / rawSum;

          let x = padX;
          const rects: { x: number; w: number }[] = [];

          // Compute start/end of invalidated region for sweep overlay
          let missStartX = width - padX;
          let missEndX = padX;

          PREFIX_BLOCKS.forEach((b, i) => {
            const w = rawWidths[i] * scaleW;
            rects.push({ x, w });
            const cached = i < sim.mutatedFrom;
            if (!cached) {
              missStartX = Math.min(missStartX, x);
              missEndX = Math.max(missEndX, x + w);
            }

            fillRoundRect(
              ctx,
              x,
              y,
              w,
              h,
              7,
              cached ? theme.sageBg : theme.crimsonBg,
              cached ? theme.sage : theme.crimson,
              i === sim.mutatedFrom ? 2 : 1.25,
            );

            drawLabel(ctx, b.label, x + w / 2, y + 17, {
              color: theme.ink,
              font: theme.fontSans,
              size: 11.5,
              weight: 600,
              align: "center",
            });
            drawLabel(ctx, cached ? "0.1x" : "1.0x", x + w / 2, y + 34, {
              color: cached ? theme.sage : theme.crimson,
              font: theme.fontSans,
              size: 10.5,
              weight: 500,
              align: "center",
            });

            x += w + gap;
          });
          blockRectsRef.current = rects;

          // Live prefill recompute scan bar sweeping over the invalidated tail
          if (sim.sweep < 1 && missEndX > missStartX) {
            const scanX = missStartX + sim.sweep * (missEndX - missStartX);
            fillRoundRect(ctx, scanX - 2, y - 4, 4, h + 8, 2, theme.crimson);
          }

          drawLabel(ctx, "Click any block above to mutate it", padX, height - 15, {
            color: theme.dim,
            font: theme.fontSans,
            size: 11,
          });
        }}
      />
    </Figure>
  );
}

/* ==========================================================================
   Figure 4: Compaction Cost Over 14 Turns (Summarize vs. Cap Tool Outputs)
   ========================================================================== */

export function CompactionRaceFigure() {
  const [strategy, setStrategy] = useState<CompactionStrategy>("summarize");
  const sumData = useMemo(() => simulateCompaction("summarize"), []);
  const capData = useMemo(() => simulateCompaction("cap_outputs"), []);

  const activeData = strategy === "summarize" ? sumData : capData;
  const finalCents = activeData.at(-1)!.cumulativeCents;
  const maxTurnCents = Math.max(...sumData.map((d) => d.turnCostCents));

  return (
    <Figure
      caption={
        strategy === "summarize"
          ? `Periodic summarization breaks the prefix cache on turns 4, 8, and 12 (total: ${finalCents.toFixed(1)}c).`
          : `Keeping the prefix immutable and capping noisy tool outputs keeps cache hits steady (total: ${finalCents.toFixed(1)}c).`
      }
      controls={
        <Toggle
          label="Compaction strategy"
          value={strategy}
          onChange={setStrategy}
          options={[
            { value: "summarize", label: "Summarize every 4 turns" },
            { value: "cap_outputs", label: "Immutable prefix + cap logs" },
          ]}
        />
      }
    >
      <CanvasStage
        height={162}
        running={false}
        label="Bar chart comparing per-turn cost spikes from periodic summarization versus flat low costs with an immutable prefix"
        onFrame={({ ctx, width, height, theme }) => {
          ctx.clearRect(0, 0, width, height);

          const padX = 24;
          const topY = 44;
          const bottomY = height - 26;
          const chartH = bottomY - topY;
          const chartW = width - padX * 2;
          const gap = 7;
          const barW = (chartW - gap * (activeData.length - 1)) / activeData.length;

          drawLabel(ctx, "Cost per turn (turns 1 to 14)", padX, 16, {
            color: theme.muted,
            font: theme.fontSans,
            size: 11.5,
          });
          drawLabel(ctx, `14-turn total: ${finalCents.toFixed(1)}c`, width - padX, 16, {
            color: strategy === "cap_outputs" ? theme.sage : theme.crimson,
            font: theme.fontSans,
            size: 12.5,
            weight: 600,
            align: "right",
          });

          // Baseline
          ctx.beginPath();
          ctx.moveTo(padX, bottomY);
          ctx.lineTo(width - padX, bottomY);
          ctx.strokeStyle = theme.line;
          ctx.lineWidth = 1;
          ctx.stroke();

          activeData.forEach((pt, i) => {
            const x = padX + i * (barW + gap);
            const h = Math.max(4, (pt.turnCostCents / maxTurnCents) * chartH);
            const y = bottomY - h;
            const color = pt.cacheBroken
              ? theme.crimson
              : strategy === "cap_outputs"
                ? theme.sage
                : theme.copper;

            fillRoundRect(ctx, x, y, barW, h, 4, color);

            if (pt.cacheBroken) {
              drawLabel(ctx, "miss", x + barW / 2, y - 9, {
                color: theme.crimson,
                font: theme.fontSans,
                size: 9.5,
                weight: 600,
                align: "center",
              });
            }

            drawLabel(ctx, `${pt.turn}`, x + barW / 2, height - 12, {
              color: theme.dim,
              font: theme.fontSans,
              size: 10,
              align: "center",
            });
          });
        }}
      />
    </Figure>
  );
}
