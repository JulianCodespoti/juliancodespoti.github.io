import { useRef } from "react";
import { CanvasStage, clamp, drawArrowHead, fillRoundRect } from "../../runtime";

const BLOCK_WEIGHTS = [0.42, 0.58, 0.72, 0.88, 1.0, 0.5];
const EDIT_SEQUENCE = [5, 3, 1, 0, 2];

/**
 * Miniature causal attention arch preview:
 * Sweeping left-to-right bezier dependency arches overhead while an edit cursor
 * ripples crimson cache invalidation strictly rightward across prompt blocks.
 */
export function ContextWindowPreview() {
  const tRef = useRef(0);

  return (
    <CanvasStage
      height={(w) => (w > 220 ? 120 : 112)}
      framed={false}
      label="Miniature preview of causal attention arcs rippling prefix cache invalidation left to right"
      onFrame={({ ctx, width, height, dt, theme }) => {
        tRef.current += dt;
        const stepDur = 1.45;
        const totalSeq = EDIT_SEQUENCE.length;
        const rawPos = (tRef.current / stepDur) % totalSeq;
        const seqIdx = Math.floor(rawPos);
        const localT = rawPos - seqIdx;
        const editedIdx = EDIT_SEQUENCE[seqIdx];
        const ripple = clamp(localT / 0.55, 0, 1);

        ctx.clearRect(0, 0, width, height);

        const padX = Math.max(16, (width - Math.min(width - 28, 224)) / 2);
        const n = BLOCK_WEIGHTS.length;
        const gap = 5;
        const availW = width - padX * 2;
        const barW = (availW - gap * (n - 1)) / n;
        const baseY = height - 14;
        const maxBarH = 20;

        const centers: { x: number; topY: number; h: number }[] = [];
        for (let i = 0; i < n; i++) {
          const x = padX + i * (barW + gap);
          const h = 10 + BLOCK_WEIGHTS[i] * (maxBarH - 10);
          centers.push({ x: x + barW / 2, topY: baseY - h, h });
        }

        // Ambient causal dependency arches (left -> right)
        const archBaseY = baseY - maxBarH - 2;
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            if (i === editedIdx) continue;
            const from = centers[i];
            const to = centers[j];
            const span = j - i;
            const archH = 12 + span * 12.5;
            const midX = (from.x + to.x) / 2;

            ctx.beginPath();
            ctx.moveTo(from.x, archBaseY);
            ctx.quadraticCurveTo(midX, archBaseY - archH, to.x, archBaseY);
            ctx.strokeStyle = j < editedIdx ? theme.sage : theme.lineStrong;
            ctx.globalAlpha = j < editedIdx ? 0.34 : 0.22;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;

        // Animated crimson invalidation arcs fanning strictly rightward from edited block
        const origin = centers[editedIdx];
        for (let j = editedIdx + 1; j < n; j++) {
          const to = centers[j];
          const span = j - editedIdx;
          const archH = 15 + span * 13;
          const midX = (origin.x + to.x) / 2;
          const ctrlY = archBaseY - archH;

          const startAt = (span - 1) * 0.12;
          const prog = clamp((ripple - startAt) / 0.48, 0, 1);
          if (prog <= 0) continue;

          ctx.beginPath();
          ctx.moveTo(origin.x, archBaseY);
          const steps = 18;
          let lx = origin.x;
          let ly = archBaseY;
          let px = lx;
          let py = ly;
          for (let k = 1; k <= steps; k++) {
            const u = (k / steps) * prog;
            const inv = 1 - u;
            const cx = inv * inv * origin.x + 2 * inv * u * midX + u * u * to.x;
            const cy = inv * inv * archBaseY + 2 * inv * u * ctrlY + u * u * archBaseY;
            ctx.lineTo(cx, cy);
            px = lx;
            py = ly;
            lx = cx;
            ly = cy;
          }
          ctx.strokeStyle = theme.crimson;
          ctx.lineWidth = 1.65;
          ctx.stroke();

          if (prog > 0.25) {
            drawArrowHead(ctx, lx, ly, Math.atan2(ly - py, lx - px), 4.6, theme.crimson);
          }
        }

        // Bottom prompt token bars (varied proportional heights, zero tiny square grids)
        for (let i = 0; i < n; i++) {
          const x = padX + i * (barW + gap);
          const { h } = centers[i];
          const y = baseY - h;
          const cached = i < editedIdx;
          const isEdit = i === editedIdx;
          fillRoundRect(
            ctx,
            x,
            y,
            barW,
            h,
            3.5,
            cached ? theme.sageBg : theme.crimsonBg,
            cached ? theme.sage : theme.crimson,
            isEdit ? 1.8 : 1.1,
          );
        }
      }}
    />
  );
}
