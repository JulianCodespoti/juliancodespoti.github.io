import { useRef } from "react";
import { CanvasStage } from "../../runtime";

/**
 * Miniature Far-Lands quantization staircase preview:
 * A smooth continuous terrain curve shatters into progressively coarser float steps
 * across 3 power-of-two octaves, inspected by a smoothly oscillating vernier cursor.
 */
export function FloatPreview() {
  const tRef = useRef(0);

  return (
    <CanvasStage
      height={(w) => (w > 220 ? 120 : 112)}
      framed={false}
      label="Miniature preview of a smooth curve breaking into coarse floating-point quantization steps"
      onFrame={({ ctx, width, height, dt, theme }) => {
        tRef.current += dt;
        const t = tRef.current;
        ctx.clearRect(0, 0, width, height);

        const padX = 14;
        const padY = 18;
        const plotW = width - padX * 2;
        const plotH = height - padY * 2;
        const midY = padY + plotH * 0.54;
        const amp = plotH * 0.36;

        // Octave boundary hairlines (fine -> medium -> coarse Far-Lands cliffs)
        const b1 = padX + plotW * 0.34;
        const b2 = padX + plotW * 0.67;
        ctx.save();
        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = theme.line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(b1, 10);
        ctx.lineTo(b1, height - 10);
        ctx.moveTo(b2, 10);
        ctx.lineTo(b2, height - 10);
        ctx.stroke();
        ctx.restore();

        // Underlying continuous smooth curve (what real numbers look like)
        const trueFn = (u: number) =>
          Math.sin(u * Math.PI * 2.35 + 0.45) * 0.78 + Math.cos(u * Math.PI * 5.1) * 0.22;

        // Quantize progressively coarser per octave (2x -> 4x -> 8x grid spacing!)
        const quantizeU = (u: number) => {
          if (u < 0.34) return Math.round(u * 60) / 60;
          if (u < 0.67) return Math.round(u * 22) / 22;
          return Math.round(u * 8) / 8;
        };

        const quantizeY = (val: number, u: number) => {
          if (u < 0.34) return Math.round(val * 14) / 14;
          if (u < 0.67) return Math.round(val * 5) / 5;
          return Math.round(val * 2.1) / 2.1;
        };

        // Draw smooth dotted reference wave
        ctx.save();
        ctx.setLineDash([2.5, 3.5]);
        ctx.strokeStyle = theme.lineStrong;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        const samples = 96;
        for (let i = 0; i <= samples; i++) {
          const u = i / samples;
          const x = padX + u * plotW;
          const y = midY - trueFn(u) * amp;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();

        // Draw quantized staircase colored by octave (sage -> teal -> copper/crimson)
        const bands: { start: number; end: number; color: string }[] = [
          { start: 0, end: 0.34, color: theme.sage },
          { start: 0.34, end: 0.67, color: theme.teal },
          { start: 0.67, end: 1, color: theme.copper },
        ];

        for (const band of bands) {
          ctx.strokeStyle = band.color;
          ctx.lineWidth = 2;
          ctx.lineJoin = "miter";
          ctx.beginPath();
          const steps = 44;
          let prevY = 0;
          for (let i = 0; i <= steps; i++) {
            const u = band.start + (i / steps) * (band.end - band.start);
            const qu = quantizeU(u);
            const qv = quantizeY(trueFn(qu), u);
            const x = padX + u * plotW;
            const y = midY - qv * amp;
            if (i === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, prevY);
              ctx.lineTo(x, y);
            }
            prevY = y;
          }
          ctx.stroke();
        }

        // Smooth ping-pong vernier cursor revealing real-time quantization gap
        const cursorU = 0.08 + 0.84 * (0.5 - 0.5 * Math.cos(t * 0.95));
        const cx = padX + cursorU * plotW;
        const trueY = midY - trueFn(cursorU) * amp;
        const snapY = midY - quantizeY(trueFn(quantizeU(cursorU)), cursorU) * amp;

        // Vertical hairline
        ctx.strokeStyle = theme.lineStrong;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, 12);
        ctx.lineTo(cx, height - 12);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Highlighted crimson error bar between true curve and quantized step
        if (Math.abs(snapY - trueY) > 1.5) {
          ctx.strokeStyle = theme.crimson;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(cx, trueY);
          ctx.lineTo(cx, snapY);
          ctx.stroke();
        }

        // Hollow true point & solid snapped float point
        ctx.fillStyle = theme.surface;
        ctx.strokeStyle = theme.muted;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(cx, trueY, 2.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = cursorU > 0.67 ? theme.crimson : cursorU > 0.34 ? theme.teal : theme.sage;
        ctx.beginPath();
        ctx.arc(cx, snapY, 3.6, 0, Math.PI * 2);
        ctx.fill();
      }}
    />
  );
}
