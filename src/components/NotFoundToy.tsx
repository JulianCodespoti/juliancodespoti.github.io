import { useRef } from "react";
import { CanvasStage, drawLabel, fillRoundRect } from "../runtime";

interface LostPacket {
  x: number;
  vx: number;
  vy: number;
  y: number;
  bounced: boolean;
  alpha: number;
}

/** Playful mini interactive 404 canvas: click anywhere to fire packets at the closed route gate. */
export function NotFoundToy() {
  const packetsRef = useRef<LostPacket[]>([
    { x: 0.15, vx: 0.65, vy: 0, y: 0, bounced: false, alpha: 1 },
  ]);
  const timerRef = useRef(0);

  const spawn = () => {
    packetsRef.current.push({ x: 0.08, vx: 0.72, vy: 0, y: 0, bounced: false, alpha: 1 });
    if (packetsRef.current.length > 16) packetsRef.current.shift();
  };

  return (
    <CanvasStage
      height={120}
      cursor="pointer"
      label="Interactive 404 packet bouncing off a closed route gate"
      onPointerDown={spawn}
      onFrame={({ ctx, width, height, dt, theme }) => {
        ctx.clearRect(0, 0, width, height);
        timerRef.current += dt;
        if (timerRef.current > 1.2) {
          timerRef.current = 0;
          spawn();
        }

        const midY = height / 2;
        const startX = 28;
        const gateX = Math.round(width * 0.68);
        const endX = width - 28;

        // Live wire left of gate
        ctx.beginPath();
        ctx.moveTo(startX, midY);
        ctx.lineTo(gateX, midY);
        ctx.strokeStyle = theme.lineStrong;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Dashed dead wire right of gate
        ctx.save();
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(gateX, midY);
        ctx.lineTo(endX, midY);
        ctx.strokeStyle = theme.crimson;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        // Closed gate bar
        fillRoundRect(ctx, gateX - 2.5, midY - 24, 5, 48, 2.5, theme.crimson);
        drawLabel(ctx, "404", gateX, midY - 36, {
          color: theme.crimson,
          font: theme.fontMono,
          size: 11,
          weight: 600,
          align: "center",
        });

        const list = packetsRef.current;
        for (let i = list.length - 1; i >= 0; i--) {
          const p = list[i];
          if (!p.bounced) {
            p.x += p.vx * dt;
            const px = startX + p.x * (gateX - startX);
            if (px >= gateX - 8) {
              p.bounced = true;
              p.vx = -0.35;
              p.vy = (Math.random() - 0.5) * 44;
            }
          } else {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.alpha -= dt * 1.4;
          }

          if (p.alpha <= 0) {
            list.splice(i, 1);
            continue;
          }

          const px = startX + p.x * (gateX - startX);
          ctx.save();
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.fillStyle = p.bounced ? theme.dim : theme.copper;
          ctx.beginPath();
          ctx.arc(px, midY + p.y, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }}
    />
  );
}
