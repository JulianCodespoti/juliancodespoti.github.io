import { useRef } from "react";
import { CanvasStage } from "../../runtime";

/** Miniature animated dispatcher + disposable subagent graph for the landing page (164 x 104). */
export function MultiAgentPreview() {
  const tRef = useRef(0);

  return (
    <CanvasStage
      height={104}
      framed={false}
      label="Miniature preview of a main agent delegating work to a disposable subagent"
      onFrame={({ ctx, width, height, dt, theme }) => {
        tRef.current = (tRef.current + dt * 0.5) % 1;
        const t = tRef.current;
        ctx.clearRect(0, 0, width, height);

        const cx = width * 0.36;
        const cy = height * 0.52;
        const sx = width * 0.74;
        const sy1 = height * 0.28;
        const sy2 = height * 0.74;

        // Edges
        ctx.strokeStyle = theme.lineStrong;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(sx, sy1);
        ctx.moveTo(cx, cy);
        ctx.lineTo(sx, sy2);
        ctx.stroke();

        // Traveling signal packets
        const p1x = cx + (sx - cx) * t;
        const p1y = cy + (sy1 - cy) * t;
        ctx.fillStyle = theme.copper;
        ctx.beginPath();
        ctx.arc(p1x, p1y, 3.2, 0, Math.PI * 2);
        ctx.fill();

        const p2x = sx + (cx - sx) * t;
        const p2y = sy2 + (cy - sy2) * t;
        ctx.fillStyle = theme.sage;
        ctx.beginPath();
        ctx.arc(p2x, p2y, 3.2, 0, Math.PI * 2);
        ctx.fill();

        // Main agent node
        ctx.fillStyle = theme.tealBg;
        ctx.strokeStyle = theme.teal;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(cx, cy, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Subagent + verifier nodes
        for (const [nx, ny, col, bg] of [
          [sx, sy1, theme.copper, theme.copperBg],
          [sx, sy2, theme.sage, theme.sageBg],
        ] as const) {
          ctx.fillStyle = bg;
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(nx, ny, 9.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }}
    />
  );
}
