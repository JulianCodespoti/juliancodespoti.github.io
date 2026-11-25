import { useRef } from "react";
import { CanvasStage, fillRoundRect } from "../../runtime";

/** Miniature preview showing doubling floating-point tick gaps across octaves (164 x 104). */
export function FloatPreview() {
  const tRef = useRef(0);

  return (
    <CanvasStage
      height={104}
      framed={false}
      label="Miniature preview of floating-point bits and doubling number-line tick spacing"
      onFrame={({ ctx, width, height, dt, theme }) => {
        tRef.current = (tRef.current + dt * 0.45) % 1;
        const t = tRef.current;
        ctx.clearRect(0, 0, width, height);

        // Top row: miniature 16-bit IEEE 754 strip (1 copper, 5 teal, 10 sage)
        const pad = 14;
        const cell = 6;
        const gap = 2.5;
        const totalW = 16 * cell + 15 * gap;
        const sx = Math.round((width - totalW) / 2);
        const bitPattern = [0, 0, 1, 0, 1, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0]; // 0.1
        for (let i = 0; i < 16; i++) {
          const x = sx + i * (cell + gap);
          const col = i === 0 ? theme.copper : i < 6 ? theme.teal : theme.sage;
          fillRoundRect(ctx, x, 22, cell, 12, 1.5, bitPattern[i] ? col : theme.line);
        }

        // Bottom: number line where tick spacing visibly doubles across 3 octaves
        const lineY = height - 30;
        ctx.strokeStyle = theme.lineStrong;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(pad, lineY);
        ctx.lineTo(width - pad, lineY);
        ctx.stroke();

        const span = width - pad * 2;
        const drawTicks = (x0: number, x1: number, count: number, color: string) => {
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.4;
          for (let i = 0; i <= count; i++) {
            const x = x0 + (i / count) * (x1 - x0);
            ctx.beginPath();
            ctx.moveTo(x, lineY - 7);
            ctx.lineTo(x, lineY + 7);
            ctx.stroke();
          }
        };

        drawTicks(pad, pad + span * 0.33, 8, theme.sage);
        drawTicks(pad + span * 0.33, pad + span * 0.66, 4, theme.teal);
        drawTicks(pad + span * 0.66, width - pad, 2, theme.copper);

        // Traveling highlight dot
        const dotX = pad + t * span;
        ctx.fillStyle = theme.copper;
        ctx.beginPath();
        ctx.arc(dotX, lineY, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }}
    />
  );
}
