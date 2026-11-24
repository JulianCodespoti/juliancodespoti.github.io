import { useRef } from "react";
import { CanvasStage, fillRoundRect } from "../../runtime";

/** Miniature live canvas preview for the homepage post card (164 x 104). */
export function OmpPulsePreview() {
  const phaseRef = useRef(0);

  return (
    <CanvasStage
      height={104}
      framed={false}
      label="Miniature preview of memory blocks and streaming deltas"
      onFrame={({ ctx, width, height, dt, theme }) => {
        phaseRef.current = (phaseRef.current + dt * 0.55) % 1;
        const t = phaseRef.current;
        ctx.clearRect(0, 0, width, height);

        // Top half: 1 tiny sage daemon square + 2 miniature 20-cell teal worker blocks
        const cell = 6;
        const pitch = 8;
        const blockW = pitch * 4 - 2;
        const blockH = pitch * 5 - 2;
        const topY = 14;
        const startX = Math.round((width - (14 + 12 + blockW * 2 + 10)) / 2);

        // Tiny sage daemon square (14 MB)
        fillRoundRect(ctx, startX, topY + blockH - cell, cell, cell, 1.5, theme.sage);

        // Two 20-cell worker blocks
        const blocksX = [startX + 18, startX + 18 + blockW + 10];
        blocksX.forEach((bx, bi) => {
          const pulse = bi === 1 ? 0.55 + 0.45 * Math.sin(t * Math.PI * 2) : 0.9;
          ctx.globalAlpha = pulse;
          for (let r = 0; r < 5; r++) {
            for (let c = 0; c < 4; c++) {
              fillRoundRect(ctx, bx + c * pitch, topY + r * pitch, cell, cell, 1.5, theme.teal);
            }
          }
          ctx.globalAlpha = 1;
        });

        // Bottom half: two mini streaming wires (wide copper vs tiny sage spark)
        const wireL = 16;
        const wireR = width - 16;
        const wireW = wireR - wireL;

        const y1 = height - 28;
        const y2 = height - 14;

        ctx.strokeStyle = theme.line;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(wireL, y1);
        ctx.lineTo(wireR, y1);
        ctx.moveTo(wireL, y2);
        ctx.lineTo(wireR, y2);
        ctx.stroke();

        ctx.save();
        ctx.beginPath();
        ctx.rect(wireL, y1 - 6, wireW, 28);
        ctx.clip();

        // Wide copper packet
        const cw = 34;
        fillRoundRect(ctx, wireL + t * (wireW + cw) - cw, y1 - 3, cw, 6, 2, theme.copper);

        // Tiny fast sage delta spark
        const t2 = (t * 1.4) % 1;
        const sw = 10;
        fillRoundRect(ctx, wireL + t2 * (wireW + sw) - sw, y2 - 2.5, sw, 5, 2, theme.sage);
        ctx.restore();
      }}
    />
  );
}
