import { useRef } from "react";
import { CanvasStage, fillRoundRect } from "../../runtime";

/** Miniature Warm Staircase vs. Cold Handoff Mountains preview for the homepage (164 x 104). */
export function MultiAgentPreview() {
  const phaseRef = useRef(0);

  return (
    <CanvasStage
      height={104}
      framed={false}
      label="Miniature preview comparing a warm single-agent cache staircase against cold multi-agent handoff resets"
      onFrame={({ ctx, width, height, dt, theme }) => {
        phaseRef.current = (phaseRef.current + dt * 0.28) % 1;
        const isSwarm = phaseRef.current > 0.5;
        ctx.clearRect(0, 0, width, height);

        const rows = 6;
        const cell = 7;
        const gap = 3;
        const pitch = cell + gap;
        const maxCols = 9;
        const startX = Math.round((width - (maxCols * pitch - gap)) / 2);
        const startY = Math.round((height - (rows * pitch - gap)) / 2);

        for (let r = 0; r < rows; r++) {
          const y = startY + r * pitch;
          if (!isSwarm) {
            const cols = 3 + r;
            for (let c = 0; c < cols; c++) {
              const col = r === 0 || c === cols - 1 ? theme.copper : theme.sage;
              fillRoundRect(ctx, startX + c * pitch, y, cell, cell, 1.5, col);
            }
          } else {
            const isCold = r % 2 === 0;
            const cols = isCold ? 4 + r : 5 + r;
            for (let c = 0; c < Math.min(maxCols, cols); c++) {
              const col = isCold ? theme.crimson : c >= cols - 2 ? theme.copper : theme.sage;
              fillRoundRect(ctx, startX + c * pitch, y, cell, cell, 1.5, col);
            }
          }
        }
      }}
    />
  );
}
