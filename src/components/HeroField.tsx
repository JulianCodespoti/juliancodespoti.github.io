import { useRef } from "react";
import { CanvasStage, clamp } from "../runtime";

interface Ripple {
  x: number;
  y: number;
  age: number;
}

/**
 * Quiet, label-free tactile lattice inspired by the `[ / ]` slash motif.
 * Needles rest in a slow subtle tide, orient smoothly toward the cursor,
 * and ripple outward when clicked.
 */
export function HeroField() {
  const pointerRef = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });
  const ripplesRef = useRef<Ripple[]>([]);
  const anglesRef = useRef<Float32Array | null>(null);

  return (
    <CanvasStage
      height={82}
      cursor="crosshair"
      label="Interactive lattice that tilts toward your pointer and ripples on click"
      onPointerMove={(p) => {
        pointerRef.current = { x: p.x, y: p.y, active: true };
      }}
      onPointerLeave={() => {
        pointerRef.current.active = false;
      }}
      onPointerDown={(p) => {
        pointerRef.current = { x: p.x, y: p.y, active: true };
        ripplesRef.current.push({ x: p.x, y: p.y, age: 0 });
        if (ripplesRef.current.length > 5) ripplesRef.current.shift();
      }}
      onFrame={({ ctx, width, height, dt, elapsed, theme }) => {
        ctx.clearRect(0, 0, width, height);

        const padX = 20;
        const padY = 16;
        const cols = Math.max(14, Math.floor((width - padX * 2) / 24));
        const rows = 3;
        const stepX = (width - padX * 2) / (cols - 1);
        const stepY = (height - padY * 2) / (rows - 1);
        const total = cols * rows;

        if (!anglesRef.current || anglesRef.current.length !== total) {
          anglesRef.current = new Float32Array(total).fill(-0.35);
        }
        const angles = anglesRef.current;

        // Advance ripples
        const ripples = ripplesRef.current;
        for (let i = ripples.length - 1; i >= 0; i--) {
          ripples[i].age += dt;
          if (ripples[i].age > 1.4) ripples.splice(i, 1);
        }

        const ptr = pointerRef.current;
        const smooth = dt > 0 ? 1 - Math.exp(-dt * 12) : 1;

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const idx = r * cols + c;
            const x = padX + c * stepX;
            const y = padY + r * stepY;

            // Base gentle resting tilt (-20 deg like our `/` slash mark) + calm traveling wave
            const wave = Math.sin(elapsed * 1.15 + c * 0.24 + r * 0.48);
            let target = -0.34 + wave * 0.14;
            let heat = Math.max(0, (wave - 0.72) * 0.65);

            if (ptr.active) {
              const dx = ptr.x - x;
              const dy = ptr.y - y;
              const dist = Math.hypot(dx, dy);
              const radius = 125;
              if (dist < radius) {
                const influence = 1 - dist / radius;
                const aim = Math.atan2(dy, dx);
                target = target * (1 - influence) + aim * influence;
                heat = Math.max(heat, influence);
              }
            }

            for (const rip of ripples) {
              const dist = Math.hypot(rip.x - x, rip.y - y);
              const waveRadius = rip.age * 240;
              const band = Math.exp(-Math.pow((dist - waveRadius) / 28, 2)) * Math.max(0, 1 - rip.age / 1.4);
              target += band * 1.15;
              heat = Math.max(heat, band);
            }

            angles[idx] += (target - angles[idx]) * smooth;
            const a = angles[idx];
            const len = 6.5 + heat * 3.2;

            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(a);
            ctx.beginPath();
            ctx.moveTo(-len, 0);
            ctx.lineTo(len, 0);
            ctx.lineWidth = 1.5 + heat * 0.9;
            ctx.lineCap = "round";
            ctx.strokeStyle = heat > 0.18 ? theme.copper : theme.lineStrong;
            ctx.globalAlpha = clamp(0.62 + heat * 0.38, 0.58, 1);
            ctx.stroke();
            ctx.restore();
          }
        }
      }}
    />
  );
}
