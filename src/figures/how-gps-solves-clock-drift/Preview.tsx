import { useRef } from "react";
import { CanvasStage } from "../../runtime";

/** Miniature preview of 3 GPS satellite rings pulsing out and snapping back onto a pinpoint (164 x 104). */
export function GpsPreview() {
  const tRef = useRef(0);

  return (
    <CanvasStage
      height={104}
      framed={false}
      label="Miniature preview of three GPS satellite rings converging onto a single receiver pinpoint"
      onFrame={({ ctx, width, height, dt, theme }) => {
        tRef.current = (tRef.current + dt * 0.4) % 1;
        // Oscillate subtle clock bias: drifts apart, then snaps clean to 0!
        const drift = Math.max(0, Math.sin(tRef.current * Math.PI * 2)) * 9;
        ctx.clearRect(0, 0, width, height);

        const target = { x: width * 0.5, y: height * 0.52 };
        const sats = [
          { x: width * 0.2, y: height * 0.22 },
          { x: width * 0.8, y: height * 0.24 },
          { x: width * 0.52, y: height * 0.86 },
        ];

        const aligned = drift < 1.2;

        for (const s of sats) {
          const r = Math.hypot(target.x - s.x, target.y - s.y) + drift;
          ctx.strokeStyle = aligned ? theme.sage : theme.copper;
          ctx.globalAlpha = 0.55;
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
          ctx.stroke();

          ctx.globalAlpha = 1;
          ctx.fillStyle = theme.teal;
          ctx.beginPath();
          ctx.arc(s.x, s.y, 3.2, 0, Math.PI * 2);
          ctx.fill();
        }

        // Receiver pinpoint
        ctx.fillStyle = aligned ? theme.sage : theme.crimson;
        ctx.beginPath();
        ctx.arc(target.x, target.y, 3.8, 0, Math.PI * 2);
        ctx.fill();
      }}
    />
  );
}
