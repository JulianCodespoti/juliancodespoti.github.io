import { useMemo, useRef, useState } from "react";
import { CanvasStage, drawLabel, fillRoundRect } from "../../runtime";
import { ChipButton, Figure, Slider } from "../../ui";
import {
  decodeFloat16,
  FLOAT16_PRESETS,
  formatFloat16Value,
  inspectOctaveGap,
  toggleFloat16Bit,
} from "./model";

/* ==========================================================================
   Figure 1: Clickable 16-Bit IEEE 754 Bit Explorer (Sign / Exponent / Mantissa)
   ========================================================================== */

export function FloatBitsFigure() {
  const [bits, setBits] = useState<number>(FLOAT16_PRESETS[0].bits); // Start on 0.1 (repeating 1001100110)
  const bitRectsRef = useRef<{ x: number; y: number; w: number; h: number }[]>([]);
  const decoded = useMemo(() => decodeFloat16(bits), [bits]);

  const formula =
    decoded.kind === "nan"
      ? "Exponent all 1s + non-zero mantissa = NaN"
      : decoded.kind === "infinity"
        ? `Exponent all 1s + zero mantissa = ${decoded.sign ? "-" : "+"}Infinity`
        : decoded.kind === "zero"
          ? `Exponent all 0s + zero mantissa = ${decoded.sign ? "-0" : "0"}`
          : decoded.kind === "subnormal"
            ? `${decoded.sign ? "-" : "+"}2^(-14) x (${decoded.mantissaRaw}/1024)`
            : `${decoded.sign ? "-" : "+"}2^(${decoded.exponent}) x (1 + ${decoded.mantissaRaw}/1024)`;

  return (
    <Figure
      caption={`Click any bit above to flip it. Gap to next number (ULP): ${Number.isFinite(decoded.ulp) ? decoded.ulp : "none"}.`}
      controls={
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0.35rem" }}>
          {FLOAT16_PRESETS.map((p) => (
            <ChipButton key={p.label} active={bits === p.bits} onClick={() => setBits(p.bits)}>
              {p.label}
            </ChipButton>
          ))}
        </div>
      }
    >
      <CanvasStage
        height={162}
        running={false}
        cursor="pointer"
        label="Interactive 16-bit IEEE 754 floating-point strip with clickable sign, exponent, and mantissa bits"
        onPointerDown={(p) => {
          bitRectsRef.current.forEach((r, i) => {
            if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
              setBits((prev) => toggleFloat16Bit(prev, i));
            }
          });
        }}
        onFrame={({ ctx, width, height, theme }) => {
          ctx.clearRect(0, 0, width, height);

          const padX = 18;
          const groupGap = 12;
          const bitGap = 4;
          const availW = width - padX * 2 - groupGap * 2 - bitGap * 13;
          const bitW = Math.min(34, Math.max(16, Math.floor(availW / 16)));
          const bitH = 38;
          const totalW = bitW * 16 + bitGap * 13 + groupGap * 2;
          const startX = Math.round((width - totalW) / 2);
          const bitY = 42;

          // Group labels above the 3 fields
          const expStartX = startX + bitW + groupGap;
          const expW = bitW * 5 + bitGap * 4;
          const mantStartX = expStartX + expW + groupGap;
          const mantW = bitW * 10 + bitGap * 9;

          drawLabel(ctx, "Sign", startX + bitW / 2, 22, {
            color: theme.copper,
            font: theme.fontSans,
            size: 11,
            weight: 600,
            align: "center",
          });
          drawLabel(ctx, "Exponent (5 bits)", expStartX + expW / 2, 22, {
            color: theme.teal,
            font: theme.fontSans,
            size: 11,
            weight: 600,
            align: "center",
          });
          drawLabel(ctx, "Mantissa (10 bits)", mantStartX + mantW / 2, 22, {
            color: theme.sage,
            font: theme.fontSans,
            size: 11,
            weight: 600,
            align: "center",
          });

          const rects: { x: number; y: number; w: number; h: number }[] = [];
          let x = startX;

          for (let i = 0; i < 16; i++) {
            if (i === 1 || i === 6) x += groupGap;
            else if (i > 0) x += bitGap;

            const bit = decoded.bitArray[i];
            const isSign = i === 0;
            const isExp = i >= 1 && i <= 5;
            const color = isSign ? theme.copper : isExp ? theme.teal : theme.sage;
            const bg = isSign ? theme.copperBg : isExp ? theme.tealBg : theme.sageBg;

            fillRoundRect(
              ctx,
              x,
              bitY,
              bitW,
              bitH,
              6,
              bit === 1 ? bg : theme.bg,
              bit === 1 ? color : theme.lineStrong,
              bit === 1 ? 1.6 : 1,
            );

            drawLabel(ctx, `${bit}`, x + bitW / 2, bitY + bitH / 2 + 1, {
              color: bit === 1 ? theme.ink : theme.dim,
              font: theme.fontMono,
              size: bitW < 22 ? 12 : 14,
              weight: 600,
              align: "center",
            });

            rects.push({ x, y: bitY, w: bitW, h: bitH });
            x += bitW;
          }
          bitRectsRef.current = rects;

          // Decoded formula + exact stored decimal value
          drawLabel(ctx, formula, width / 2, bitY + bitH + 26, {
            color: theme.muted,
            font: theme.fontSans,
            size: 12,
            align: "center",
          });
          drawLabel(ctx, `= ${formatFloat16Value(decoded)}`, width / 2, height - 20, {
            color: theme.ink,
            font: theme.fontMono,
            size: 16,
            weight: 600,
            align: "center",
          });
        }}
      />
    </Figure>
  );
}

/* ==========================================================================
   Figure 2: The Doubling-Gap Number Line (Why 2048 + 1 === 2048)
   ========================================================================== */

export function NumberLineZoomFigure() {
  const [octave, setOctave] = useState(11); // Start right at 2048 so the stuck +1 jump is immediately visible!
  const info = useMemo(() => inspectOctaveGap(octave), [octave]);

  return (
    <Figure
      caption={
        info.stuck
          ? `At ${info.x.toLocaleString()}, the gap to the next float16 is ${info.rightGap}. Adding 1 lands in the void and rounds right back to ${info.x.toLocaleString()}.`
          : `At ${info.x.toLocaleString()}, representable floats are ${info.rightGap} apart, so ${info.x.toLocaleString()} + 1 lands cleanly on ${info.addOneResult.toLocaleString()}.`
      }
      controls={
        <Slider
          label="Start value (2^k)"
          min={7}
          max={13}
          step={1}
          value={octave}
          displayValue={info.x.toLocaleString()}
          onChange={setOctave}
        />
      }
    >
      <CanvasStage
        height={164}
        running={false}
        label="Number line showing representable float tick spacing doubling at every power of two and a +1 jump snapping back when the gap exceeds 1"
        onFrame={({ ctx, width, height, theme }) => {
          ctx.clearRect(0, 0, width, height);

          const padX = 28;
          const lineY = 104;
          const centerX = Math.round(width * 0.44);
          // Visual scale: keep `1.0` unit fixed at a clean pixel width around 2^k so the doubling gaps feel physical!
          const pxPerUnit = Math.min(72, Math.max(36, (width - padX * 2) / 9.5));

          // Top status
          drawLabel(ctx, `Gap below ${info.x}: ${info.leftGap}   |   Gap above ${info.x}: ${info.rightGap}`, padX, 18, {
            color: theme.muted,
            font: theme.fontSans,
            size: 11.5,
          });
          drawLabel(
            ctx,
            `${info.x} + 1 = ${info.addOneResult}`,
            width - padX,
            18,
            {
              color: info.stuck ? theme.crimson : theme.sage,
              font: theme.fontMono,
              size: 12.5,
              weight: 600,
              align: "right",
            },
          );

          // Main number line
          ctx.beginPath();
          ctx.moveTo(padX, lineY);
          ctx.lineTo(width - padX, lineY);
          ctx.strokeStyle = theme.lineStrong;
          ctx.lineWidth = 2;
          ctx.stroke();

          // Draw representable ticks to the LEFT of 2^k (spacing = leftGap)
          ctx.strokeStyle = theme.teal;
          ctx.lineWidth = 1.6;
          for (let step = 1; ; step++) {
            const tx = centerX - step * info.leftGap * pxPerUnit;
            if (tx < padX) break;
            ctx.beginPath();
            ctx.moveTo(tx, lineY - 9);
            ctx.lineTo(tx, lineY + 9);
            ctx.stroke();
          }

          // Draw representable ticks to the RIGHT of 2^k (spacing = rightGap = 2x leftGap!)
          ctx.strokeStyle = info.stuck ? theme.crimson : theme.sage;
          ctx.lineWidth = 1.8;
          for (let step = 1; ; step++) {
            const tx = centerX + step * info.rightGap * pxPerUnit;
            if (tx > width - padX) break;
            ctx.beginPath();
            ctx.moveTo(tx, lineY - 12);
            ctx.lineTo(tx, lineY + 12);
            ctx.stroke();

            if (step === 1) {
              drawLabel(ctx, `${info.x + info.rightGap}`, tx, lineY + 26, {
                color: theme.muted,
                font: theme.fontMono,
                size: 11,
                align: "center",
              });
            }
          }

          // Anchor tick at x = 2^k
          ctx.strokeStyle = theme.ink;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(centerX, lineY - 15);
          ctx.lineTo(centerX, lineY + 15);
          ctx.stroke();
          drawLabel(ctx, `${info.x}`, centerX, lineY + 26, {
            color: theme.ink,
            font: theme.fontMono,
            size: 11.5,
            weight: 600,
            align: "center",
          });

          // Draw the exact `+ 1` jump arc!
          const targetX = centerX + 1 * pxPerUnit;
          const arcColor = info.stuck ? theme.crimson : theme.sage;
          const midX = (centerX + targetX) / 2;
          const arcTopY = lineY - 46;

          ctx.beginPath();
          ctx.moveTo(centerX, lineY - 16);
          ctx.quadraticCurveTo(midX, arcTopY, targetX, lineY - 6);
          ctx.strokeStyle = arcColor;
          ctx.lineWidth = 2.2;
          ctx.stroke();

          // Landing dot at x + 1
          ctx.fillStyle = arcColor;
          ctx.beginPath();
          ctx.arc(targetX, lineY, 4.5, 0, Math.PI * 2);
          ctx.fill();

          drawLabel(ctx, "+1", midX, arcTopY + 10, {
            color: arcColor,
            font: theme.fontMono,
            size: 11.5,
            weight: 600,
            align: "center",
          });

          // If stuck, draw a dashed snap-back arrow showing rounding right back onto x!
          if (info.stuck) {
            ctx.save();
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(targetX, lineY + 6);
            ctx.quadraticCurveTo(midX, lineY + 24, centerX + 4, lineY + 8);
            ctx.strokeStyle = theme.crimson;
            ctx.lineWidth = 1.6;
            ctx.stroke();
            ctx.restore();

            drawLabel(ctx, "rounds back", targetX + 10, lineY - 22, {
              color: theme.crimson,
              font: theme.fontSans,
              size: 11,
              weight: 600,
            });
          }

          drawLabel(ctx, "2x denser ticks", padX, height - 12, {
            color: theme.teal,
            font: theme.fontSans,
            size: 10.5,
          });
          drawLabel(ctx, "2x wider gap past 2^k", width - padX, height - 12, {
            color: info.stuck ? theme.crimson : theme.dim,
            font: theme.fontSans,
            size: 10.5,
            align: "right",
          });
        }}
      />
    </Figure>
  );
}
