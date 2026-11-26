import { useRef } from "react";
import { CanvasStage, fillRoundRect } from "../../runtime";

/**
 * Miniature orbital trilateration radar preview:
 * 3 gently orbiting winged satellites whose range rings swell under clock drift
 * and snap cleanly onto a pinpoint lock with smooth C1 easing.
 */
export function GpsPreview() {
  const tRef = useRef(0);

  return (
    <CanvasStage
      height={(w) => (w > 220 ? 120 : 112)}
      framed={false}
      label="Miniature preview of three orbiting GPS satellites locking onto a receiver pinpoint"
      onFrame={({ ctx, width, height, dt, theme }) => {
        tRef.current += dt;
        const t = tRef.current;
        ctx.clearRect(0, 0, width, height);

        // Uniform isotropic transform so rings stay exact circles at both 184x112 and 343x120
        const baseW = 184;
        const baseH = 112;
        const scale = Math.min(width / baseW, height / baseH);
        const ox = (width - baseW * scale) / 2;
        const oy = (height - baseH * scale) / 2;
        const pt = (x: number, y: number) => ({ x: ox + x * scale, y: oy + y * scale });

        const target = pt(92, 58);

        // Smooth C1 cycle: swells out with clock drift, snaps back cleanly, holds lock briefly
        const cyc = (t * 0.32) % 1;
        let drift = 0;
        if (cyc < 0.55) {
          const u = cyc / 0.55;
          drift = Math.pow(Math.sin(u * Math.PI), 1.7) * 11;
        }
        const locked = drift < 1.1;

        // Subtle radar reference ring & crosshair around receiver
        ctx.strokeStyle = theme.line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(target.x, target.y, 26 * scale, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(target.x - 10, target.y);
        ctx.lineTo(target.x + 10, target.y);
        ctx.moveTo(target.x, target.y - 10);
        ctx.lineTo(target.x, target.y + 10);
        ctx.stroke();

        // 3 satellites drifting gently along slow orbital arcs
        const orbitWobble = Math.sin(t * 0.55) * 4.5;
        const sats = [
          pt(34 + orbitWobble, 25 - orbitWobble * 0.4),
          pt(150 - orbitWobble * 0.7, 29 + orbitWobble * 0.5),
          pt(95 + Math.cos(t * 0.55) * 4, 94),
        ];

        for (const s of sats) {
          const trueR = Math.hypot(target.x - s.x, target.y - s.y);
          const r = trueR + drift * scale;

          ctx.strokeStyle = locked ? theme.sage : theme.copper;
          ctx.globalAlpha = locked ? 0.62 : 0.55;
          ctx.lineWidth = 1.35;
          ctx.beginPath();
          ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
          ctx.stroke();

          // Tiny winged satellite glyph oriented toward receiver
          ctx.globalAlpha = 1;
          const ang = Math.atan2(target.y - s.y, target.x - s.x) + Math.PI / 2;
          ctx.save();
          ctx.translate(s.x, s.y);
          ctx.rotate(ang);
          fillRoundRect(ctx, -6.5, -1.6, 3.8, 3.2, 1, theme.teal);
          fillRoundRect(ctx, 2.7, -1.6, 3.8, 3.2, 1, theme.teal);
          fillRoundRect(ctx, -2.1, -2.1, 4.2, 4.2, 1.2, theme.teal);
          ctx.restore();
        }

        // Translucent error zone when clock is drifted; crisp lock pulse when aligned
        if (!locked) {
          ctx.fillStyle = theme.crimsonBg;
          ctx.strokeStyle = theme.crimson;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(target.x, target.y, Math.max(4, drift * scale * 0.7), 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else {
          const pulse = ((t * 1.1) % 1);
          ctx.strokeStyle = theme.sage;
          ctx.globalAlpha = (1 - pulse) * 0.45;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(target.x, target.y, 4 + pulse * 14, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        ctx.fillStyle = locked ? theme.sage : theme.crimson;
        ctx.beginPath();
        ctx.arc(target.x, target.y, 3.6, 0, Math.PI * 2);
        ctx.fill();
      }}
    />
  );
}
