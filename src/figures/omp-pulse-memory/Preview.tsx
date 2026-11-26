import { useRef } from "react";
import { CanvasStage, stepSpring, type SpringScalar } from "../../runtime";

interface MiniParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  bounced: boolean;
  alpha: number;
}

/**
 * Miniature mechanical back-pressure valve & live flat-memory oscilloscope preview:
 * Packets stream through a hinged stall-latch gate; when the phone drops offline,
 * the gate swings shut with spring inertia, incoming packets ricochet off it,
 * and the 14 MB oscilloscope trace stays rock-flat underneath.
 */
export function OmpPulsePreview() {
  const tRef = useRef(0);
  const spawnRef = useRef(0);
  const gateRef = useRef<SpringScalar>({ value: -64, velocity: 0 });
  const particlesRef = useRef<MiniParticle[]>([]);

  return (
    <CanvasStage
      height={(w) => (w > 220 ? 120 : 112)}
      framed={false}
      label="Miniature preview of a mechanical back-pressure stall valve and flat memory trace"
      onFrame={({ ctx, width, height, dt, theme }) => {
        tRef.current += dt;
        const t = tRef.current;
        const cyc = (t * 0.24) % 1;
        const offline = cyc > 0.42 && cyc < 0.82;

        stepSpring(gateRef.current, offline ? 0 : -64, dt, 320, 22);

        const padX = Math.max(18, (width - Math.min(width - 32, 212)) / 2);
        const leftX = padX;
        const rightX = width - padX;
        const pipeY = Math.round(height * 0.42);
        const gateX = leftX + (rightX - leftX) * 0.52;

        // Spawn steady copper packets from Daemon node
        spawnRef.current += dt;
        if (spawnRef.current >= (offline ? 0.34 : 0.28)) {
          spawnRef.current = 0;
          particlesRef.current.push({
            x: leftX + 8,
            y: pipeY,
            vx: (rightX - leftX) * 0.62,
            vy: 0,
            bounced: false,
            alpha: 1,
          });
          if (particlesRef.current.length > 18) particlesRef.current.shift();
        }

        ctx.clearRect(0, 0, width, height);

        // Intake conduit (left of gate)
        ctx.strokeStyle = theme.lineStrong;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(leftX + 7, pipeY);
        ctx.lineTo(gateX, pipeY);
        ctx.stroke();

        // Output conduit (right of gate - dashed crimson when offline)
        ctx.save();
        if (offline) ctx.setLineDash([4, 4]);
        ctx.strokeStyle = offline ? theme.crimson : theme.lineStrong;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(gateX, pipeY);
        ctx.lineTo(rightX - 7, pipeY);
        ctx.stroke();
        ctx.restore();

        // Update & draw flowing / bouncing packets
        const list = particlesRef.current;
        for (let i = list.length - 1; i >= 0; i--) {
          const p = list[i];
          if (!p.bounced) {
            p.x += p.vx * dt;
            if (offline && p.x >= gateX - 5 && p.x <= gateX + 4) {
              p.bounced = true;
              p.x = gateX - 5;
              p.vx = -34;
              p.vy = -26 + ((i % 3) - 1) * 14;
              gateRef.current.velocity += 55; // physical valve tremor on impact
            } else if (p.x >= rightX - 7) {
              list.splice(i, 1);
              continue;
            }
          } else {
            p.x += p.vx * dt;
            p.vy += 120 * dt;
            p.y += p.vy * dt;
            p.alpha -= dt * 2.1;
            if (p.alpha <= 0) {
              list.splice(i, 1);
              continue;
            }
          }

          ctx.save();
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.fillStyle = p.bounced ? theme.dim : p.x > gateX ? theme.sage : theme.copper;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.bounced ? 2.6 : 3.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Hinged mechanical stall-latch gate
        const pivotY = pipeY - 17;
        const rad = (gateRef.current.value * Math.PI) / 180;
        ctx.save();
        ctx.translate(gateX, pivotY);
        ctx.rotate(rad);
        ctx.strokeStyle = offline ? theme.sage : theme.muted;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, 24);
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = theme.ink;
        ctx.beginPath();
        ctx.arc(gateX, pivotY, 2.8, 0, Math.PI * 2);
        ctx.fill();

        // Daemon node (left) & Phone node (right)
        ctx.fillStyle = theme.surfaceSub;
        ctx.strokeStyle = offline ? theme.sage : theme.lineStrong;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(leftX, pipeY, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = offline ? theme.crimsonBg : theme.surfaceSub;
        ctx.strokeStyle = offline ? theme.crimson : theme.sage;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(rightX, pipeY, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Lower band: calm scrolling 14 MB flat oscilloscope trace (proving flat bounded RSS!)
        const traceY = height - 20;
        const traceL = leftX - 4;
        const traceR = rightX + 4;
        const traceW = traceR - traceL;

        ctx.strokeStyle = theme.line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(traceL, traceY + 4);
        ctx.lineTo(traceR, traceY + 4);
        ctx.stroke();

        ctx.strokeStyle = theme.sage;
        ctx.lineWidth = 1.75;
        ctx.beginPath();
        const pts = 40;
        for (let i = 0; i <= pts; i++) {
          const u = i / pts;
          const x = traceL + u * traceW;
          const microNoise = Math.sin(u * 26 - t * 6) * 0.8 + Math.cos(u * 13 - t * 3.5) * 0.45;
          const y = traceY - 2 + microNoise;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Live scanning bead on oscilloscope tip
        ctx.fillStyle = theme.sage;
        ctx.beginPath();
        ctx.arc(traceR, traceY - 2, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }}
    />
  );
}
