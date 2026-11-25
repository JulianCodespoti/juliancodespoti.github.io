import { useRef } from "react";
import { CanvasStage, fillRoundRect } from "../../runtime";

/** Miniature 2D Turn x Token triangle preview for the homepage (164 x 104). */
export function ContextWindowPreview() {
  const phaseRef = useRef(0);

  return (
    <CanvasStage
      height={104}
      framed={false}
      label="Miniature preview of the quadratic context triangle and prefix cache"
      onFrame={({ ctx, width, height, dt, theme }) => {
        phaseRef.current = (phaseRef.current + dt * 0.28) % 1;
        const showSummarize = phaseRef.current > 0.55;
        ctx.clearRect(0, 0, width, height);

        const rows = 7;
        const cell = 7;
        const gap = 3;
        const pitch = cell + gap;
        const maxCols = 9;
        const startX = Math.round((width - (maxCols * pitch - gap)) / 2);
        const startY = Math.round((height - (rows * pitch - gap)) / 2);

        for (let r = 0; r < rows; r++) {
          const isMissRow = showSummarize && r === 3;
          const cols = showSummarize && r >= 3 ? Math.max(4, r + 1) : r + 3;
          for (let c = 0; c < cols; c++) {
            const x = startX + c * pitch;
            const y = startY + r * pitch;
            let color = theme.sage;
            if (r === 0 || c === cols - 1) color = theme.copper;
            if (isMissRow && c >= 2) color = theme.crimson;
            fillRoundRect(ctx, x, y, cell, cell, 1.5, color);
          }
        }
      }}
    />
  );
}
