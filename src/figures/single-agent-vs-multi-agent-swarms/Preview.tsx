import { useRef } from "react";
import { CanvasStage, clamp, easeOutCubic } from "../../runtime";

// Deterministic orbital offsets for copper noise flecks inside the ephemeral subagent halo
const NOISE_FLECKS = Array.from({ length: 22 }, (_, i) => {
  const angle = i * 2.39996; // golden angle phyllotaxis
  const r = 0.28 + Math.sqrt((i + 0.5) / 22) * 0.64;
  return { angle, r, speed: (i % 2 === 0 ? 1 : -1) * (0.45 + (i % 5) * 0.12) };
});

const SIGNAL_OFFSETS = [
  { a: 0.4, r: 0.52 },
  { a: 2.1, r: 0.44 },
  { a: 3.8, r: 0.58 },
  { a: 5.2, r: 0.4 },
];

/**
 * Miniature subagent signal-distillation topology preview:
 * A dashed ephemeral subagent cloud absorbs swirling copper search noise,
 * extracts 4 glowing teal signal nodes along curved trajectories into the calm
 * sage main core, and cleanly dissolves away.
 */
export function MultiAgentPreview() {
  const tRef = useRef(0);

  return (
    <CanvasStage
      height={(w) => (w > 220 ? 120 : 112)}
      framed={false}
      label="Miniature preview of a disposable subagent distilling four teal signal nodes into a clean main agent core"
      onFrame={({ ctx, width, height, dt, theme }) => {
        tRef.current += dt;
        const t = tRef.current;
        const cyc = (t * 0.26) % 1; // ~3.8s smooth continuous loop
        ctx.clearRect(0, 0, width, height);

        const spanW = Math.min(width - 24, 210);
        const cx = width / 2;
        const cy = height / 2;

        const mainPos = { x: cx - spanW * 0.29, y: cy };
        const subPos = { x: cx + spanW * 0.24, y: cy };
        const mainR = 20;
        const subR = 30;

        // Smooth envelope for ephemeral subagent visibility (fades in 0..0.15, holds, dissolves 0.65..0.85)
        let subAlpha = 1;
        if (cyc < 0.14) subAlpha = easeOutCubic(cyc / 0.14);
        else if (cyc > 0.66) subAlpha = 1 - easeOutCubic(clamp((cyc - 0.66) / 0.2, 0, 1));

        // Faint curved extraction bridge between subagent cloud and main core
        ctx.save();
        ctx.setLineDash([2.5, 3.5]);
        ctx.strokeStyle = theme.lineStrong;
        ctx.globalAlpha = 0.25 + subAlpha * 0.3;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(subPos.x - subR, cy);
        ctx.lineTo(mainPos.x + mainR, cy);
        ctx.stroke();
        ctx.restore();

        // Main Agent calm sage core (always clean)
        ctx.fillStyle = theme.sageBg;
        ctx.strokeStyle = theme.sage;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(mainPos.x, mainPos.y, mainR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Inner core ring
        ctx.fillStyle = theme.sage;
        ctx.beginPath();
        ctx.arc(mainPos.x, mainPos.y, 4.5, 0, Math.PI * 2);
        ctx.fill();

        // Ephemeral subagent dashed halo + swirling copper noise flecks
        if (subAlpha > 0.02) {
          const scaleSub = 0.85 + 0.15 * subAlpha;
          ctx.save();
          ctx.globalAlpha = subAlpha;
          ctx.setLineDash([4, 3.5]);
          ctx.strokeStyle = theme.lineStrong;
          ctx.lineWidth = 1.25;
          ctx.beginPath();
          ctx.arc(subPos.x, subPos.y, subR * scaleSub, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);

          for (const f of NOISE_FLECKS) {
            const ang = f.angle + t * f.speed;
            const fx = subPos.x + Math.cos(ang) * f.r * subR * 0.86 * scaleSub;
            const fy = subPos.y + Math.sin(ang) * f.r * subR * 0.86 * scaleSub;
            ctx.fillStyle = theme.copper;
            ctx.globalAlpha = subAlpha * 0.55;
            ctx.beginPath();
            ctx.arc(fx, fy, 1.9, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }

        // 4 teal signal nodes: start inside subagent, arc smoothly into orbit around Main Core!
        for (let i = 0; i < SIGNAL_OFFSETS.length; i++) {
          const s = SIGNAL_OFFSETS[i];
          const startAng = s.a + t * 0.5;
          const sx = subPos.x + Math.cos(startAng) * s.r * subR * 0.78;
          const sy = subPos.y + Math.sin(startAng) * s.r * subR * 0.78;

          const dockAng = (i * Math.PI) / 2 + Math.PI / 4 + t * 0.4;
          const tx = mainPos.x + Math.cos(dockAng) * (mainR * 0.58);
          const ty = mainPos.y + Math.sin(dockAng) * (mainR * 0.58);

          const launch = 0.28 + i * 0.055;
          const flyU = easeOutCubic(clamp((cyc - launch) / 0.26, 0, 1));
          // Gently fade out docked signals at very end of loop so cycle restarts seamlessly
          const endFade = cyc > 0.9 ? 1 - (cyc - 0.9) / 0.1 : 1;
          const nodeAlpha = cyc < 0.14 ? subAlpha : endFade;

          const ctrlX = (sx + tx) / 2;
          const ctrlY = cy + (i % 2 === 0 ? -1 : 1) * (16 + i * 4);
          const inv = 1 - flyU;
          const nx = inv * inv * sx + 2 * inv * flyU * ctrlX + flyU * flyU * tx;
          const ny = inv * inv * sy + 2 * inv * flyU * ctrlY + flyU * flyU * ty;

          // Subtle luminous extraction trail while in flight
          if (flyU > 0.02 && flyU < 0.96) {
            ctx.save();
            ctx.strokeStyle = theme.teal;
            ctx.globalAlpha = 0.42 * (1 - flyU * 0.5);
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.quadraticCurveTo(ctrlX, ctrlY, nx, ny);
            ctx.stroke();
            ctx.restore();
          }

          ctx.save();
          ctx.globalAlpha = clamp(nodeAlpha, 0, 1);
          ctx.fillStyle = theme.teal;
          ctx.beginPath();
          ctx.arc(nx, ny, 3.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }}
    />
  );
}
