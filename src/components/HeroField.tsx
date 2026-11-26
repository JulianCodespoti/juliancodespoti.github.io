import { useRef } from "react";
import { CanvasStage, clamp, wrapAngleDiff } from "../runtime";

interface Ripple {
  x: number;
  y: number;
  age: number;
}

/**
 * Tactile magnetic slash-field inspired by the `[ / ]` mark.
 * Each needle has real angular velocity and damping: sweeping across or tapping
 * imparts physical torque and launches copper phase ripples across the lattice.
 */
export function HeroField() {
  const pointerRef = useRef<{ x: number; y: number; vx: number; vy: number; active: boolean }>({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    active: false,
  });
  const ripplesRef = useRef<Ripple[]>([]);
  const anglesRef = useRef<Float32Array | null>(null);
  const velRef = useRef<Float32Array | null>(null);
  const heatRef = useRef<Float32Array | null>(null);

  return (
    <div className="hero-field-wrap">
      <CanvasStage
        height={(w) => (w < 480 ? 86 : 92)}
        cursor="crosshair"
        touchAction="pan-y"
        label="Interactive magnetic slash field that tilts toward your pointer and ripples physically on click or tap"
        onPointerMove={(p) => {
          const prev = pointerRef.current;
          const vx = prev.active ? p.x - prev.x : 0;
          const vy = prev.active ? p.y - prev.y : 0;
          pointerRef.current = { x: p.x, y: p.y, vx, vy, active: true };
        }}
        onPointerLeave={() => {
          pointerRef.current.active = false;
        }}
        onPointerUp={() => {
          pointerRef.current.active = false;
        }}
        onPointerDown={(p) => {
          pointerRef.current = { x: p.x, y: p.y, vx: 0, vy: 0, active: true };
          ripplesRef.current.push({ x: p.x, y: p.y, age: 0 });
          if (ripplesRef.current.length > 6) ripplesRef.current.shift();
        }}
        onFrame={({ ctx, width, height, dt, elapsed, theme }) => {
          ctx.clearRect(0, 0, width, height);

          const padX = width < 480 ? 18 : 22;
          const padY = 18;
          const cols = Math.max(13, Math.floor((width - padX * 2) / 23));
          const rows = 3;
          const stepX = (width - padX * 2) / (cols - 1);
          const stepY = (height - padY * 2) / (rows - 1);
          const total = cols * rows;

          if (!anglesRef.current || anglesRef.current.length !== total) {
            anglesRef.current = new Float32Array(total).fill(-0.36);
            velRef.current = new Float32Array(total).fill(0);
            heatRef.current = new Float32Array(total).fill(0);
          }
          const angles = anglesRef.current;
          const vels = velRef.current!;
          const heats = heatRef.current!;

          const ripples = ripplesRef.current;
          for (let i = ripples.length - 1; i >= 0; i--) {
            ripples[i].age += dt;
            if (ripples[i].age > 1.55) ripples.splice(i, 1);
          }

          const ptr = pointerRef.current;
          const restColor = theme.mode === "dark" ? theme.muted : theme.lineStrong;
          const stiffness = 175;
          const damping = 13.5;

          // Decay pointer velocity slightly between moves
          ptr.vx *= 0.82;
          ptr.vy *= 0.82;

          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const idx = r * cols + c;
              const x = padX + c * stepX;
              const y = padY + r * stepY;

              // Calm traveling diagonal tide matching the `/` motif (clear luminous ribbon on desktop & mobile)
              const phase = elapsed * 1.2 - c * 0.34 - r * 0.58;
              const wave = Math.sin(phase);
              let target = -0.36 + wave * 0.2;
              let targetHeat = Math.max(0, (wave - 0.32) * 1.05);

              if (ptr.active) {
                const dx = ptr.x - x;
                const dy = ptr.y - y;
                const dist = Math.hypot(dx, dy);
                const radius = 138;
                if (dist < radius) {
                  const influence = Math.pow(1 - dist / radius, 1.35);
                  const aim = Math.atan2(dy, dx);
                  const diffToAim = wrapAngleDiff(aim, target);
                  target = target + diffToAim * influence;
                  targetHeat = Math.max(targetHeat, influence);
                  // Subtle physical brush impulse when moving fast across needles
                  if (dt > 0) {
                    const speed = Math.hypot(ptr.vx, ptr.vy);
                    vels[idx] += clamp(speed * 0.18, 0, 4.5) * influence * (ptr.vx >= 0 ? 1 : -1) * dt * 14;
                  }
                }
              }

              for (const rip of ripples) {
                const dist = Math.hypot(rip.x - x, rip.y - y);
                const waveRadius = rip.age * 270;
                const decay = Math.max(0, 1 - rip.age / 1.55);
                const band = Math.exp(-Math.pow((dist - waveRadius) / 26, 2)) * decay;
                if (band > 0.01) {
                  const radial = Math.atan2(y - rip.y, x - rip.x) + Math.PI / 2;
                  const diffR = wrapAngleDiff(radial, target);
                  target += diffR * band * 0.9;
                  if (dt > 0) {
                    vels[idx] += band * 22 * dt;
                  }
                  targetHeat = Math.max(targetHeat, band * 1.15);
                }
              }

              if (dt > 0) {
                const diff = wrapAngleDiff(target, angles[idx]);
                const accel = diff * stiffness - vels[idx] * damping;
                vels[idx] += accel * dt;
                angles[idx] += vels[idx] * dt;
                heats[idx] += (targetHeat - heats[idx]) * (1 - Math.exp(-dt * 11));
              } else {
                angles[idx] = target;
                heats[idx] = targetHeat;
              }

              const a = angles[idx];
              const energy = clamp(heats[idx] + Math.abs(vels[idx]) * 0.06, 0, 1);
              const len = 6.8 + energy * 3.4;

              // Subtle anchor pivot dot
              ctx.fillStyle = energy > 0.24 ? theme.copper : theme.lineStrong;
              ctx.globalAlpha = 0.45 + energy * 0.45;
              ctx.beginPath();
              ctx.arc(x, y, 1.35, 0, Math.PI * 2);
              ctx.fill();

              // Magnetic slash needle
              ctx.save();
              ctx.translate(x, y);
              ctx.rotate(a);
              ctx.beginPath();
              ctx.moveTo(-len, 0);
              ctx.lineTo(len, 0);
              ctx.lineWidth = 1.65 + energy * 0.95;
              ctx.lineCap = "round";
              ctx.strokeStyle = energy > 0.2 ? theme.copper : restColor;
              ctx.globalAlpha = clamp(0.56 + energy * 0.44, 0.56, 1);
              ctx.stroke();
              ctx.restore();
            }
          }
          ctx.globalAlpha = 1;
        }}
      />
    </div>
  );
}
