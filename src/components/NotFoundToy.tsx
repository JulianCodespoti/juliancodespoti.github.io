import { useRef } from "react";
import { CanvasStage, drawLabel, fillRoundRect, stepSpring, type SpringScalar } from "../runtime";

interface LostPacket {
  x: number;
  vx: number;
  vy: number;
  y: number;
  bounced: boolean;
  alpha: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
}

/** Playful mini 404 canvas: packets slam into a spring-damped 404 gate and scatter with gravity. */
export function NotFoundToy() {
  const packetsRef = useRef<LostPacket[]>([
    { x: 0.16, vx: 0.72, vy: 0, y: 0, bounced: false, alpha: 1 },
  ]);
  const sparksRef = useRef<Spark[]>([]);
  const gateRecoilRef = useRef<SpringScalar>({ value: 0, velocity: 0 });
  const droppedRef = useRef(0);
  const timerRef = useRef(0);

  const spawn = (startNorm = 0.06) => {
    packetsRef.current.push({ x: startNorm, vx: 0.76, vy: 0, y: 0, bounced: false, alpha: 1 });
    if (packetsRef.current.length > 22) packetsRef.current.shift();
  };

  return (
    <CanvasStage
      height={136}
      cursor="pointer"
      label="Interactive 404 wire where packets recoil off a closed route gate"
      onPointerDown={(p) => {
        const startX = 28;
        const gateX = Math.round(p.width * 0.68);
        const norm = Math.max(0.04, Math.min(0.85, (p.x - startX) / Math.max(40, gateX - startX)));
        spawn(norm);
        spawn(Math.max(0.04, norm - 0.08));
      }}
      onFrame={({ ctx, width, height, dt, theme }) => {
        ctx.clearRect(0, 0, width, height);
        timerRef.current += dt;
        if (timerRef.current > 1.15) {
          timerRef.current = 0;
          spawn(0.05);
        }

        stepSpring(gateRecoilRef.current, 0, dt, 360, 18);

        const midY = Math.round(height * 0.52);
        const startX = 28;
        const gateX = Math.round(width * 0.68);
        const endX = width - 28;
        const recoil = gateRecoilRef.current.value;

        // Live wire left of gate
        ctx.beginPath();
        ctx.moveTo(startX, midY);
        ctx.lineTo(gateX + recoil, midY);
        ctx.strokeStyle = theme.lineStrong;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Source endpoint
        ctx.fillStyle = theme.muted;
        ctx.beginPath();
        ctx.arc(startX, midY, 4, 0, Math.PI * 2);
        ctx.fill();

        // Dashed dead wire right of gate
        ctx.save();
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(gateX + recoil, midY);
        ctx.lineTo(endX, midY);
        ctx.strokeStyle = theme.crimson;
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        // Spring-recoiling closed 404 gate
        fillRoundRect(ctx, gateX + recoil - 3, midY - 25, 6, 50, 3, theme.crimson);
        drawLabel(ctx, "404", gateX + recoil, midY - 38, {
          color: theme.crimson,
          font: theme.fontMono,
          size: 11.5,
          weight: 600,
          align: "center",
        });

        drawLabel(ctx, "Click wire to fire", startX, height - 14, {
          color: theme.dim,
          font: theme.fontSans,
          size: 11,
        });
        drawLabel(ctx, `dropped: ${droppedRef.current}`, endX, height - 14, {
          color: theme.dim,
          font: theme.fontMono,
          size: 11,
          align: "right",
        });

        // Update packets
        const list = packetsRef.current;
        for (let i = list.length - 1; i >= 0; i--) {
          const pkt = list[i];
          if (!pkt.bounced) {
            pkt.x += pkt.vx * dt;
            const px = startX + pkt.x * (gateX - startX);
            if (px >= gateX - 7) {
              pkt.bounced = true;
              pkt.vx = -0.22 - (droppedRef.current % 4) * 0.04;
              pkt.vy = -48 - (droppedRef.current % 3) * 16;
              droppedRef.current += 1;
              gateRecoilRef.current.velocity += 130;
              // Emit deterministic crisp sparks
              for (let s = 0; s < 3; s++) {
                sparksRef.current.push({
                  x: gateX - 4,
                  y: midY + (s - 1) * 5,
                  vx: -38 - s * 18,
                  vy: (s - 1) * 42 - 14,
                  alpha: 0.95,
                });
              }
            }
          } else {
            pkt.x += pkt.vx * dt;
            pkt.vy += 170 * dt; // subtle gravity arc
            pkt.y += pkt.vy * dt;
            pkt.alpha -= dt * 1.25;
          }

          if (pkt.alpha <= 0) {
            list.splice(i, 1);
            continue;
          }

          const px = startX + pkt.x * (gateX - startX);
          ctx.save();
          ctx.globalAlpha = Math.max(0, pkt.alpha);
          ctx.fillStyle = pkt.bounced ? theme.dim : theme.copper;
          ctx.beginPath();
          ctx.arc(px, midY + pkt.y, pkt.bounced ? 4 : 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Update sparks
        const sparks = sparksRef.current;
        for (let i = sparks.length - 1; i >= 0; i--) {
          const sp = sparks[i];
          sp.x += sp.vx * dt;
          sp.y += sp.vy * dt;
          sp.vy += 120 * dt;
          sp.alpha -= dt * 2.8;
          if (sp.alpha <= 0) {
            sparks.splice(i, 1);
            continue;
          }
          ctx.save();
          ctx.globalAlpha = Math.max(0, sp.alpha);
          ctx.fillStyle = theme.crimson;
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, 1.8, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }}
    />
  );
}
