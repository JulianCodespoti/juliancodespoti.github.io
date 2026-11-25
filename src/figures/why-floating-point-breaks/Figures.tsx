import { useMemo, useRef, useState } from "react";
import { CanvasStage, drawLabel, fillRoundRect, stepSpring } from "../../runtime";
import { ChipButton, Figure, Slider } from "../../ui";
import {
  decodeFloat16,
  FLOAT16_PRESETS,
  formatFloat16Value,
  inspectOctaveGap,
  toggleFloat16Bit,
  traceFloat16Addition,
} from "./model";

/* ==========================================================================
   Figure 1: Clickable 16-Bit IEEE 754 Bit Explorer (Sign / Exponent / Mantissa)
   ========================================================================== */

export function FloatBitsFigure() {
  const [bits, setBits] = useState<number>(FLOAT16_PRESETS[0].bits);
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
   Figure 2: Interactive Binary Addition (Exponent Shift + Dropped Guard Bits)
   ========================================================================== */

const ADD_PRESETS = [
  { id: "0.1+0.2", label: "0.1 + 0.2", a: 0.1, b: 0.2 },
  { id: "1.0+0.5", label: "1.0 + 0.5", a: 1.0, b: 0.5 },
  { id: "2048+1", label: "2048 + 1", a: 2048, b: 1 },
] as const;

export function FloatAdderFigure() {
  const [presetId, setPresetId] = useState<(typeof ADD_PRESETS)[number]["id"]>("0.1+0.2");
  const preset = ADD_PRESETS.find((p) => p.id === presetId) ?? ADD_PRESETS[0];
  const trace = useMemo(() => traceFloat16Addition(preset.a, preset.b, preset.label), [preset]);

  return (
    <Figure
      caption={
        presetId === "2048+1"
          ? `Aligning 1 to 2^11 shifts its 1 bit 11 slots right, completely past the 10-bit mantissa wall, so 2048 + 1 returns 2048.`
          : trace.lostBits
            ? `Shifting ${preset.a} right by ${trace.shift} bit aligns exponents at 2^(${trace.alignedExp}), pushing low bits past the 10-bit wall (stored result: ${Number(trace.resultValue.toPrecision(7))}, not ${trace.exactDecimal}).`
            : `Both operands fit cleanly inside 10 mantissa bits with zero bits dropped (exact result: ${trace.resultValue}).`
      }
      controls={
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0.35rem" }}>
          {ADD_PRESETS.map((p) => (
            <ChipButton key={p.id} active={presetId === p.id} onClick={() => setPresetId(p.id)}>
              {p.label}
            </ChipButton>
          ))}
        </div>
      }
    >
      <CanvasStage
        height={196}
        running={false}
        label="Bit-level floating-point addition showing exponent alignment shifts and bits falling past the 10-bit mantissa precision wall"
        onFrame={({ ctx, width, height, theme }) => {
          ctx.clearRect(0, 0, width, height);

          const padX = 20;
          const labelW = 92;
          const totalCols = 14; // 11 kept significand bits + 3 dropped-bit slots past the precision wall
          const wallGap = 14;
          const bitGap = 3;
          const availW = width - padX * 2 - labelW - wallGap - bitGap * (totalCols - 2);
          const bitW = Math.min(26, Math.max(13, Math.floor(availW / totalCols)));
          const bitH = 26;
          const startX = padX + labelW;
          const wallX = startX + 11 * (bitW + bitGap) - bitGap + wallGap / 2;

          drawLabel(ctx, `Aligned at 2^(${trace.alignedExp})`, padX, 18, {
            color: theme.teal,
            font: theme.fontSans,
            size: 11.5,
            weight: 600,
          });
          drawLabel(
            ctx,
            trace.lostBits
              ? `Result: ${Number(trace.resultValue.toPrecision(7))} (exact: ${trace.exactDecimal})`
              : `Exact result: ${trace.resultValue}`,
            width - padX,
            18,
            {
              color: trace.lostBits ? theme.crimson : theme.sage,
              font: theme.fontMono,
              size: 11.5,
              weight: 600,
              align: "right",
            },
          );

          // Vertical precision wall separating kept 11-bit significand from dropped bits!
          ctx.save();
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(wallX, 34);
          ctx.lineTo(wallX, height - 18);
          ctx.strokeStyle = theme.crimson;
          ctx.lineWidth = 1.4;
          ctx.stroke();
          ctx.restore();

          drawLabel(ctx, "10-bit wall", wallX, height - 9, {
            color: theme.crimson,
            font: theme.fontSans,
            size: 10,
            weight: 600,
            align: "center",
          });

          const drawBitRow = (
            y: number,
            rowLabel: string,
            kept: (number | null)[],
            dropped: number[],
            color: string,
            bg: string,
          ) => {
            drawLabel(ctx, rowLabel, padX, y + bitH / 2, {
              color: theme.muted,
              font: theme.fontSans,
              size: 11.5,
              weight: 500,
            });

            for (let i = 0; i < 11; i++) {
              const x = startX + i * (bitW + bitGap);
              const val = kept[i];
              const isImplicit = i === 0;
              fillRoundRect(
                ctx,
                x,
                y,
                bitW,
                bitH,
                4,
                val === 1 ? bg : theme.bg,
                val === null ? theme.line : val === 1 ? color : theme.lineStrong,
                isImplicit ? 1.5 : 1,
              );
              drawLabel(ctx, val === null ? "·" : `${val}`, x + bitW / 2, y + bitH / 2 + 1, {
                color: val === 1 ? theme.ink : theme.dim,
                font: theme.fontMono,
                size: 12,
                weight: 600,
                align: "center",
              });
            }

            // Dropped guard bits to the right of the wall
            for (let d = 0; d < Math.min(3, dropped.length); d++) {
              const x = wallX + wallGap / 2 + d * (bitW + bitGap);
              const val = dropped[d];
              fillRoundRect(
                ctx,
                x,
                y,
                bitW,
                bitH,
                4,
                val === 1 ? theme.crimsonBg : theme.bg,
                val === 1 ? theme.crimson : theme.line,
                1.2,
              );
              drawLabel(ctx, `${val}`, x + bitW / 2, y + bitH / 2 + 1, {
                color: val === 1 ? theme.crimson : theme.dim,
                font: theme.fontMono,
                size: 11.5,
                weight: 600,
                align: "center",
              });
            }
          };

          drawBitRow(40, `${preset.a > preset.b ? preset.a : preset.b}`, trace.bigBits11, [], theme.teal, theme.tealBg);
          drawBitRow(
            78,
            `+ ${preset.a > preset.b ? preset.b : preset.a} (>>${trace.shift})`,
            trace.smallAlignedKept,
            trace.smallDroppedBits.length > 0 ? trace.smallDroppedBits : [],
            theme.copper,
            theme.copperBg,
          );

          // Sum divider line
          ctx.beginPath();
          ctx.moveTo(startX, 114);
          ctx.lineTo(wallX - wallGap / 2, 114);
          ctx.strokeStyle = theme.lineStrong;
          ctx.lineWidth = 1.5;
          ctx.stroke();

          drawBitRow(
            124,
            `Sum (2^${trace.resultExp})`,
            trace.sumBits11,
            [],
            trace.lostBits ? theme.crimson : theme.sage,
            trace.lostBits ? theme.crimsonBg : theme.sageBg,
          );

          if (trace.shift >= 11) {
            drawLabel(ctx, "shifted off!", wallX + wallGap / 2 + 2, 137, {
              color: theme.crimson,
              font: theme.fontSans,
              size: 10.5,
              weight: 600,
            });
          } else if (trace.smallDroppedBits.some((b) => b === 1)) {
            drawLabel(ctx, "rounded", wallX + wallGap / 2 + 2, 137, {
              color: theme.crimson,
              font: theme.fontSans,
              size: 10.5,
              weight: 600,
            });
          }
        }}
      />
    </Figure>
  );
}

/* ==========================================================================
   Figure 3: Smooth Spring-Zooming Number Line (Why 2048 + 1 === 2048)
   ========================================================================== */

export function NumberLineZoomFigure() {
  const [octave, setOctave] = useState(11);
  const info = useMemo(() => inspectOctaveGap(octave), [octave]);
  const octaveSpringRef = useRef({ value: 11, velocity: 0 });

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
        height={166}
        label="Spring-animated number line showing representable float tick spacing doubling smoothly at every power of two and a +1 jump snapping back when the gap exceeds 1"
        onFrame={({ ctx, width, height, dt, theme }) => {
          stepSpring(octaveSpringRef.current, octave, dt, 190, 22);
          const smoothK = octaveSpringRef.current.value;
          const smoothRightGap = Math.pow(2, smoothK - 10);
          const smoothLeftGap = smoothRightGap / 2;

          ctx.clearRect(0, 0, width, height);

          const padX = 28;
          const lineY = 106;
          const centerX = Math.round(width * 0.44);
          const pxPerUnit = Math.min(72, Math.max(36, (width - padX * 2) / 9.5));

          drawLabel(ctx, `Gap below ${info.x}: ${info.leftGap}   |   Gap above ${info.x}: ${info.rightGap}`, padX, 18, {
            color: theme.muted,
            font: theme.fontSans,
            size: 11.5,
          });
          drawLabel(ctx, `${info.x} + 1 = ${info.addOneResult}`, width - padX, 18, {
            color: info.stuck ? theme.crimson : theme.sage,
            font: theme.fontMono,
            size: 12.5,
            weight: 600,
            align: "right",
          });

          ctx.beginPath();
          ctx.moveTo(padX, lineY);
          ctx.lineTo(width - padX, lineY);
          ctx.strokeStyle = theme.lineStrong;
          ctx.lineWidth = 2;
          ctx.stroke();

          // Smoothly stretching left ticks
          ctx.strokeStyle = theme.teal;
          ctx.lineWidth = 1.6;
          const leftStepPx = Math.max(4, smoothLeftGap * pxPerUnit);
          for (let step = 1; step < 80; step++) {
            const tx = centerX - step * leftStepPx;
            if (tx < padX) break;
            ctx.beginPath();
            ctx.moveTo(tx, lineY - 9);
            ctx.lineTo(tx, lineY + 9);
            ctx.stroke();
          }

          // Smoothly stretching right ticks (2x left spacing!)
          ctx.strokeStyle = info.stuck ? theme.crimson : theme.sage;
          ctx.lineWidth = 1.8;
          const rightStepPx = Math.max(8, smoothRightGap * pxPerUnit);
          for (let step = 1; step < 80; step++) {
            const tx = centerX + step * rightStepPx;
            if (tx > width - padX) break;
            ctx.beginPath();
            ctx.moveTo(tx, lineY - 12);
            ctx.lineTo(tx, lineY + 12);
            ctx.stroke();

            if (step === 1 && Math.abs(smoothK - octave) < 0.25) {
              drawLabel(ctx, `${info.x + info.rightGap}`, tx, lineY + 26, {
                color: theme.muted,
                font: theme.fontMono,
                size: 11,
                align: "center",
              });
            }
          }

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
