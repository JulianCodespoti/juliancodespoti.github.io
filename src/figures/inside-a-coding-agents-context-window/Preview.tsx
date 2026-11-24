import { useRef } from "react";
import { CanvasStage, fillRoundRect } from "../../runtime";

/** Miniature live context-tape & prefix-cache preview for the landing page (164 x 104). */
export function ContextWindowPreview() {
  const phaseRef = useRef(0);

  return (
    <CanvasStage
      height={104}
      framed={false}
      label="Miniature preview of a context window token tape and prefix cache"
      onFrame={({ ctx, width, height, dt, theme }) => {
        phaseRef.current = (phaseRef.current + dt * 0.35) % 1;
        const t = phaseRef.current;
        ctx.clearRect(0, 0, width, height);

        const pad = 16;
        const barW = width - pad * 2;

        // Top tape: proportional token blocks
        const y1 = 24;
        const h1 = 18;
        fillRoundRect(ctx, pad, y1, barW, h1, 4, theme.bg, theme.line, 1);
        const segs = [
          { w: 0.14, c: theme.teal },
          { w: 0.16, c: theme.sage },
          { w: 0.24, c: theme.teal },
          { w: 0.26, c: theme.copper },
        ];
        let x = pad + 2;
        for (const s of segs) {
          const sw = (barW - 4) * s.w;
          fillRoundRect(ctx, x, y1 + 2, sw - 2, h1 - 4, 2.5, s.c);
          x += sw;
        }

        // Bottom tape: prefix cache hit (sage) vs invalidated recompute (crimson sweep)
        const y2 = height - 40;
        const h2 = 18;
        const breakIdx = t < 0.55 ? 4 : 1; // flips between warm tail hit and early prefix invalidation
        const blocks = 5;
        const gap = 3;
        const bw = (barW - gap * (blocks - 1)) / blocks;
        for (let i = 0; i < blocks; i++) {
          const bx = pad + i * (bw + gap);
          const cached = i < breakIdx;
          fillRoundRect(ctx, bx, y2, bw, h2, 3, cached ? theme.sageBg : theme.crimsonBg, cached ? theme.sage : theme.crimson, 1);
        }
      }}
    />
  );
}
