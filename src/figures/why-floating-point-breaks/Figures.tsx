import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { CanvasStage, clamp, drawLabel, drawPillBadge, fillRoundRect, stepSpring } from "../../runtime";
import { ChipButton, Figure, IconButton, Slider } from "../../ui";
import {
  decodeFloat16,
  FLOAT16_PRESETS,
  formatFloat16Value,
  formatHex16,
  inspectOctaveGap,
  snapFloat16Offset,
  stepFloat16Ulp,
  toggleFloat16Bit,
  traceFloat16Addition,
} from "./model";

/* ==========================================================================
   Figure 1: Clickable 16-Bit IEEE 754 Bit Explorer + +/- 1 ULP Stepper
   ========================================================================== */

function describeBitRole(bitIdx: number): string {
  if (bitIdx === 0) return "Sign bit: 0 = positive, 1 = negative";
  if (bitIdx <= 5) {
    const power = 1 << (5 - bitIdx);
    return `Exponent bit (+${power} to raw exponent, bias = 15)`;
  }
  const fracPow = bitIdx - 5;
  return `Mantissa bit (+1/${1 << fracPow} inside current power-of-two bucket)`;
}

export function FloatBitsFigure() {
  const [bits, setBits] = useState<number>(FLOAT16_PRESETS[0].bits);
  const [hoveredBit, setHoveredBit] = useState<number | null>(null);
  const bitRectsRef = useRef<{ x: number; y: number; w: number; h: number }[]>([]);
  const flashRef = useRef<Float32Array>(new Float32Array(16));
  const decoded = useMemo(() => decodeFloat16(bits), [bits]);

  const matchedPreset = FLOAT16_PRESETS.find((p) => p.bits === bits && Number.isFinite(p.target));
  const exactErr =
    matchedPreset && Number.isFinite(decoded.value) ? decoded.value - matchedPreset.target : null;

  const flipBit = (idx: number) => {
    setBits((prev) => toggleFloat16Bit(prev, idx));
    flashRef.current[idx] = 1;
  };

  const stepUlp = (delta: 1 | -1) => {
    setBits((prev) => {
      const next = stepFloat16Ulp(prev, delta);
      const changed = prev ^ next;
      for (let i = 0; i < 16; i++) {
        if ((changed >>> (15 - i)) & 1) flashRef.current[i] = 1;
      }
      return next;
    });
  };

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
      caption={
        hoveredBit !== null
          ? describeBitRole(hoveredBit)
          : `Tap any bit to flip it, or step -1/+1 ULP. Gap to next representable float16: ${Number.isFinite(decoded.ulp) ? decoded.ulp : "none"}.`
      }
      controls={
        <>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0.35rem" }}>
            {FLOAT16_PRESETS.map((p) => (
              <ChipButton key={p.label} active={bits === p.bits} onClick={() => setBits(p.bits)}>
                {p.label}
              </ChipButton>
            ))}
          </div>
          <div style={{ display: "inline-flex", gap: "0.35rem" }}>
            <ChipButton onClick={() => stepUlp(-1)} label="Previous representable float16 (-1 ULP)">
              <ChevronLeft size={13} />
              -1 ULP
            </ChipButton>
            <ChipButton accent onClick={() => stepUlp(1)} label="Next representable float16 (+1 ULP)">
              +1 ULP
              <ChevronRight size={13} />
            </ChipButton>
          </div>
        </>
      }
    >
      <CanvasStage
        height={(w) => (w < 480 ? 228 : 178)}
        cursor="pointer"
        label="Interactive 16-bit IEEE 754 floating-point strip with clickable sign, exponent, and mantissa bits"
        onPointerMove={(p) => {
          if (p.pointerType === "touch") return;
          const idx = bitRectsRef.current.findIndex(
            (r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h,
          );
          setHoveredBit(idx >= 0 ? idx : null);
        }}
        onPointerLeave={() => setHoveredBit(null)}
        onPointerDown={(p) => {
          const pad = p.pointerType === "touch" ? 4 : 0;
          const idx = bitRectsRef.current.findIndex(
            (r) => p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad,
          );
          if (idx >= 0) flipBit(idx);
        }}
        onFrame={({ ctx, width, height, dt, theme }) => {
          for (let i = 0; i < 16; i++) {
            flashRef.current[i] = Math.max(0, flashRef.current[i] - dt * 3.2);
          }

          ctx.clearRect(0, 0, width, height);
          const compact = width < 480;
          const rects: { x: number; y: number; w: number; h: number }[] = [];

          const drawBitCell = (i: number, x: number, y: number, w: number, h: number) => {
            const bit = decoded.bitArray[i];
            const isSign = i === 0;
            const isExp = i >= 1 && i <= 5;
            const color = isSign ? theme.copper : isExp ? theme.teal : theme.sage;
            const bg = isSign ? theme.copperBg : isExp ? theme.tealBg : theme.sageBg;
            const isHov = hoveredBit === i;
            const fl = flashRef.current[i];

            fillRoundRect(
              ctx,
              x,
              y,
              w,
              h,
              6,
              bit === 1 ? bg : isHov ? theme.surfaceSub : theme.bg,
              fl > 0.05 ? theme.ink : bit === 1 || isHov ? color : theme.lineStrong,
              fl > 0.05 ? 2.2 : bit === 1 ? 1.65 : 1,
            );

            drawLabel(ctx, `${bit}`, x + w / 2, y + h / 2 + 1, {
              color: bit === 1 ? theme.ink : theme.muted,
              font: theme.fontMono,
              size: w < 24 ? 13 : 14.5,
              weight: 600,
              align: "center",
            });

            rects[i] = { x, y, w, h };
          };

          if (compact) {
            // Purpose-built 2-row phone layout: generous thumb-friendly tiles!
            // Row 1: Sign (1) + Exponent (5)
            const r1Gap = 5;
            const r1Group = 18;
            const r1W = Math.min(40, Math.floor((width - 28 - r1Group - r1Gap * 4) / 6));
            const r1H = 40;
            const r1Total = r1W * 6 + r1Gap * 4 + r1Group;
            const r1StartX = Math.round((width - r1Total) / 2);
            const r1Y = 30;

            drawLabel(ctx, "Sign", r1StartX + r1W / 2, 15, {
              color: theme.copper,
              font: theme.fontSans,
              size: 10.5,
              weight: 600,
              align: "center",
            });
            const expStartX = r1StartX + r1W + r1Group;
            const expW = r1W * 5 + r1Gap * 4;
            drawLabel(ctx, "Exponent (5 bits)", expStartX + expW / 2, 15, {
              color: theme.teal,
              font: theme.fontSans,
              size: 10.5,
              weight: 600,
              align: "center",
            });

            drawBitCell(0, r1StartX, r1Y, r1W, r1H);
            for (let i = 1; i <= 5; i++) {
              drawBitCell(i, expStartX + (i - 1) * (r1W + r1Gap), r1Y, r1W, r1H);
            }

            // Row 2: Mantissa (10)
            const r2Gap = 3;
            const r2W = Math.min(30, Math.floor((width - 20 - r2Gap * 9) / 10));
            const r2H = 40;
            const r2Total = r2W * 10 + r2Gap * 9;
            const r2StartX = Math.round((width - r2Total) / 2);
            const r2Y = 98;

            drawLabel(ctx, "Mantissa (10 bits)", width / 2, 84, {
              color: theme.sage,
              font: theme.fontSans,
              size: 10.5,
              weight: 600,
              align: "center",
            });

            for (let i = 6; i < 16; i++) {
              drawBitCell(i, r2StartX + (i - 6) * (r2W + r2Gap), r2Y, r2W, r2H);
            }
          } else {
            // Calm wide desktop 16-bit register strip
            const padX = 20;
            const groupGap = 14;
            const bitGap = 4;
            const availW = width - padX * 2 - groupGap * 2 - bitGap * 13;
            const bitW = Math.min(34, Math.max(18, Math.floor(availW / 16)));
            const bitH = 40;
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

            let x = startX;
            for (let i = 0; i < 16; i++) {
              if (i === 1 || i === 6) x += groupGap;
              else if (i > 0) x += bitGap;
              drawBitCell(i, x, bitY, bitW, bitH);
              x += bitW;
            }
          }

          bitRectsRef.current = rects;

          const formulaY = compact ? 162 : 108;
          const valY = height - 26;

          drawLabel(ctx, `${formatHex16(bits)}  ·  ${formula}`, width / 2, formulaY, {
            color: theme.muted,
            font: theme.fontMono,
            size: compact ? 10.5 : 11.5,
            align: "center",
          });

          const mainVal = `= ${formatFloat16Value(decoded)}`;
          const errStr =
            exactErr !== null && Math.abs(exactErr) > 1e-12
              ? `  (off by ${exactErr >= 0 ? "+" : ""}${exactErr.toExponential(2)})`
              : "";
          drawLabel(ctx, mainVal + (compact ? "" : errStr), width / 2, valY, {
            color: theme.ink,
            font: theme.fontMono,
            size: compact ? 15.5 : 16,
            weight: 600,
            align: "center",
          });
          if (compact && errStr) {
            drawLabel(ctx, errStr.trim(), width / 2, height - 9, {
              color: theme.copper,
              font: theme.fontMono,
              size: 10,
              align: "center",
            });
          }
        }}
      />
    </Figure>
  );
}

/* ==========================================================================
   Figure 2: Animated Binary Addition (Physical Shift Past the 10-Bit Wall)
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
  const shiftSpringRef = useRef({ value: 1, velocity: 0 });

  const selectPreset = (id: (typeof ADD_PRESETS)[number]["id"]) => {
    setPresetId(id);
    shiftSpringRef.current = { value: 0, velocity: 0 };
  };

  const replayShift = () => {
    shiftSpringRef.current = { value: 0, velocity: 0 };
  };

  const bigLabel = `${preset.a >= preset.b ? preset.a : preset.b}`;
  const smallLabel = `${preset.a >= preset.b ? preset.b : preset.a}`;

  return (
    <Figure
      caption={
        presetId === "2048+1"
          ? "Aligning 1 to 2^11 slides its 1 bit 11 slots right, past the 10-bit mantissa wall, so 2048 + 1 stays 2048."
          : trace.lostBits
            ? `Sliding ${smallLabel} right by ${trace.shift} bit aligns both exponents at 2^(${trace.alignedExp}), pushing low bits past the 10-bit wall (stored result: ${Number(trace.resultValue.toPrecision(7))}, not ${trace.exactDecimal}).`
            : `Both operands fit cleanly inside 10 mantissa bits with zero dropped bits (exact result: ${trace.resultValue}).`
      }
      controls={
        <>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0.35rem" }}>
            {ADD_PRESETS.map((p) => (
              <ChipButton key={p.id} active={presetId === p.id} onClick={() => selectPreset(p.id)}>
                {p.label}
              </ChipButton>
            ))}
          </div>
          <IconButton accent label="Replay bit alignment shift" onClick={replayShift}>
            <RotateCcw size={14} />
          </IconButton>
        </>
      }
    >
      <CanvasStage
        height={(w) => (w < 480 ? 242 : 206)}
        label="Animated bit-level floating-point addition showing the smaller operand shifting right past the 10-bit mantissa precision wall"
        onFrame={({ ctx, width, height, dt, theme }) => {
          stepSpring(shiftSpringRef.current, 1, dt, 130, 19);
          const rawT = clamp(shiftSpringRef.current.value, 0, 1);
          // 2-beat choreography: slide bits smoothly (0..0.72), then snap sum in (0.72..1.0)
          const slideT = clamp(rawT / 0.72, 0, 1);
          const sumT = clamp((rawT - 0.68) / 0.32, 0, 1);

          ctx.clearRect(0, 0, width, height);

          const compact = width < 480;
          const padX = compact ? 12 : 22;
          const labelW = compact ? 0 : 98;
          const totalCols = 14; // 11 kept significand bits + 3 dropped slots past wall
          const wallGap = compact ? 10 : 16;
          const bitGap = compact ? 2.5 : 3.5;
          const availW = width - padX * 2 - labelW - wallGap - bitGap * (totalCols - 2);
          const bitW = Math.min(28, Math.max(14, Math.floor(availW / totalCols)));
          const bitH = compact ? 25 : 27;
          const pitch = bitW + bitGap;
          const stripTotalW = 11 * pitch - bitGap + wallGap + 3 * pitch - bitGap;
          const startX = compact
            ? Math.round((width - stripTotalW) / 2)
            : padX + labelW;
          const wallX = startX + 11 * pitch - bitGap + wallGap / 2;

          // Dedicated top header
          const hudH = 34;
          ctx.fillStyle = theme.surfaceSub;
          ctx.fillRect(0, 0, width, hudH);
          ctx.beginPath();
          ctx.moveTo(0, hudH + 0.5);
          ctx.lineTo(width, hudH + 0.5);
          ctx.strokeStyle = theme.line;
          ctx.lineWidth = 1;
          ctx.stroke();

          drawLabel(
            ctx,
            compact ? `Exp 2^(${trace.alignedExp})  ·  >>${trace.shift}` : `Aligned at 2^(${trace.alignedExp})  ·  shift >> ${trace.shift}`,
            padX,
            hudH / 2,
            {
              color: theme.teal,
              font: theme.fontMono,
              size: compact ? 10.5 : 11.2,
              weight: 600,
            },
          );
          drawLabel(
            ctx,
            trace.lostBits
              ? compact
                ? `= ${Number(trace.resultValue.toPrecision(5))}`
                : `= ${Number(trace.resultValue.toPrecision(7))} (exact ${trace.exactDecimal})`
              : `Exact: ${trace.resultValue}`,
            width - padX,
            hudH / 2,
            {
              color: trace.lostBits ? theme.crimson : theme.sage,
              font: theme.fontMono,
              size: compact ? 10.5 : 11.2,
              weight: 600,
              align: "right",
            },
          );

          // Vertical crimson precision wall
          ctx.save();
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(wallX, hudH + 8);
          ctx.lineTo(wallX, height - 20);
          ctx.strokeStyle = theme.crimson;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.restore();

          drawLabel(ctx, "10-bit wall", wallX, height - 10, {
            color: theme.crimson,
            font: theme.fontSans,
            size: 10,
            weight: 600,
            align: "center",
          });

          const row1Y = compact ? 58 : 48;
          const row2Y = compact ? 114 : 88;
          const divY = compact ? 150 : 126;
          const row3Y = compact ? 174 : 138;

          const drawRowLabel = (text: string, y: number, color: string) => {
            if (compact) {
              drawLabel(ctx, text, startX, y - 11, {
                color,
                font: theme.fontSans,
                size: 10.5,
                weight: 600,
              });
            } else {
              drawLabel(ctx, text, padX, y + bitH / 2, {
                color,
                font: theme.fontSans,
                size: 11.5,
                weight: 500,
              });
            }
          };

          // Row 1: Larger operand (stationary)
          drawRowLabel(bigLabel, row1Y, theme.muted);
          for (let i = 0; i < 11; i++) {
            const x = startX + i * pitch;
            const val = trace.bigBits11[i];
            fillRoundRect(
              ctx,
              x,
              row1Y,
              bitW,
              bitH,
              4,
              val === 1 ? theme.tealBg : theme.bg,
              val === 1 ? theme.teal : theme.lineStrong,
              i === 0 ? 1.5 : 1,
            );
            drawLabel(ctx, `${val}`, x + bitW / 2, row1Y + bitH / 2 + 0.5, {
              color: val === 1 ? theme.ink : theme.dim,
              font: theme.fontMono,
              size: 12,
              weight: 600,
              align: "center",
            });
          }

          // Row 2: Smaller operand (physically sliding right by `trace.shift` slots!)
          drawRowLabel(`+ ${smallLabel} (>>${trace.shift})`, row2Y, theme.copper);

          // Draw empty receiving slots first (11 kept + 3 dropped tray slots)
          for (let i = 0; i < 11; i++) {
            const x = startX + i * pitch;
            fillRoundRect(ctx, x, row2Y, bitW, bitH, 4, theme.bg, theme.line, 1);
            drawLabel(ctx, "·", x + bitW / 2, row2Y + bitH / 2 + 0.5, {
              color: theme.dim,
              font: theme.fontMono,
              size: 12,
              align: "center",
            });
          }
          for (let d = 0; d < 3; d++) {
            const x = wallX + wallGap / 2 + d * pitch;
            fillRoundRect(ctx, x, row2Y, bitW, bitH, 4, theme.bg, theme.line, 1);
          }

          // Animated sliding bits of smaller operand (clip cleanly at end of 3rd dropped slot)
          const animShift = trace.shift * slideT;
          const rightClipX = wallX + wallGap / 2 + 2 * pitch + bitW + 2;
          ctx.save();
          ctx.beginPath();
          ctx.rect(startX - 2, row2Y - 2, rightClipX - startX + 2, bitH + 4);
          ctx.clip();

          for (let src = 0; src < 11; src++) {
            const val = trace.smallOrig11[src];
            const slotPos = src + animShift;
            if (slotPos > 13.45) continue;
            // Smoothly jump across the precision wall gap as slotPos crosses 10.5
            const extraWall = slotPos > 10.5 ? (wallGap - bitGap) * clamp((slotPos - 10.5) / 0.5, 0, 1) : 0;
            const x = startX + slotPos * pitch + extraWall;
            const dropped = slotPos >= 10.6;

            fillRoundRect(
              ctx,
              x,
              row2Y,
              bitW,
              bitH,
              4,
              dropped
                ? val === 1
                  ? theme.crimsonBg
                  : theme.bg
                : val === 1
                  ? theme.copperBg
                  : theme.bg,
              dropped
                ? val === 1
                  ? theme.crimson
                  : theme.lineStrong
                : val === 1
                  ? theme.copper
                  : theme.lineStrong,
              1.25,
            );
            drawLabel(ctx, `${val}`, x + bitW / 2, row2Y + bitH / 2 + 0.5, {
              color: dropped ? (val === 1 ? theme.crimson : theme.dim) : val === 1 ? theme.ink : theme.dim,
              font: theme.fontMono,
              size: 12,
              weight: 600,
              align: "center",
            });
          }
          ctx.restore();

          // Sum divider
          ctx.beginPath();
          ctx.moveTo(startX, divY);
          ctx.lineTo(wallX - wallGap / 2, divY);
          ctx.strokeStyle = theme.lineStrong;
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Row 3: Rounded sum reveals cleanly once shifted bits settle past the wall
          const sumAlpha = 0.22 + 0.78 * sumT;
          ctx.save();
          ctx.globalAlpha = sumAlpha;
          drawRowLabel(compact ? `Sum (2^${trace.resultExp})` : `Sum (2^${trace.resultExp})`, row3Y, theme.muted);
          for (let i = 0; i < 11; i++) {
            const x = startX + i * pitch;
            const val = trace.sumBits11[i];
            const sumColor = trace.lostBits ? theme.crimson : theme.sage;
            const sumBg = trace.lostBits ? theme.crimsonBg : theme.sageBg;
            fillRoundRect(
              ctx,
              x,
              row3Y,
              bitW,
              bitH,
              4,
              val === 1 ? sumBg : theme.bg,
              val === 1 ? sumColor : theme.lineStrong,
              i === 0 ? 1.5 : 1,
            );
            drawLabel(ctx, `${val}`, x + bitW / 2, row3Y + bitH / 2 + 0.5, {
              color: val === 1 ? theme.ink : theme.dim,
              font: theme.fontMono,
              size: 12,
              weight: 600,
              align: "center",
            });
          }

          if (trace.shift >= 11) {
            drawLabel(ctx, compact ? "lost!" : "shifted off!", wallX + wallGap / 2 + 4, row3Y + bitH / 2, {
              color: theme.crimson,
              font: theme.fontSans,
              size: 10.5,
              weight: 600,
            });
          } else if (trace.smallDroppedBits.some((b) => b === 1)) {
            drawLabel(
              ctx,
              compact ? "rnd" : trace.guardBit ? "guard=1" : "rounded",
              wallX + wallGap / 2 + 4,
              row3Y + bitH / 2,
              {
                color: theme.crimson,
                font: theme.fontSans,
                size: 10.5,
                weight: 600,
              },
            );
          }
          ctx.restore();
        }}
      />
    </Figure>
  );
}

/* ==========================================================================
   Figure 3: Adaptive Zoom Number Line + Physical +1 Bounce & Drag-Rounding
   ========================================================================== */

export function NumberLineZoomFigure() {
  const [octave, setOctave] = useState(11);
  const [probeDelta, setProbeDelta] = useState(1);
  const info = useMemo(() => inspectOctaveGap(octave), [octave]);
  const snap = useMemo(() => snapFloat16Offset(octave, probeDelta), [octave, probeDelta]);

  // Smooth spring camera & animated probe jump/rebound
  const octaveSpringRef = useRef({ value: 11, velocity: 0 });
  const jumpRef = useRef({ active: false, age: 0 });
  const draggingRef = useRef(false);

  const handleOctave = (k: number) => {
    setOctave(k);
    setProbeDelta(1);
    jumpRef.current = { active: true, age: 0 };
  };

  const triggerPlusOne = () => {
    setProbeDelta(1);
    jumpRef.current = { active: true, age: 0 };
  };

  const getLayout = (width: number, smoothRightGap: number) => {
    const compact = width < 480;
    const padX = compact ? 16 : 28;
    const centerX = Math.round(width * 0.42);
    // Adaptive scale: always fits at least 2.2 right-side ULP ticks AND the +1 jump cleanly inside the frame!
    const rightSpacePx = width - padX - centerX;
    const targetSpanUnits = Math.max(2.6, smoothRightGap * 2.25);
    const pxPerUnit = rightSpacePx / targetSpanUnits;
    return { compact, padX, centerX, pxPerUnit };
  };

  const updateProbeFromX = (x: number, width: number) => {
    const smoothRightGap = Math.pow(2, octaveSpringRef.current.value - 10);
    const { centerX, pxPerUnit } = getLayout(width, smoothRightGap);
    const maxDelta = Math.max(2.2, info.rightGap * 1.8);
    const raw = (x - centerX) / pxPerUnit;
    const clamped = clamp(Math.round(raw * 8) / 8, 0.125, maxDelta);
    jumpRef.current.active = false;
    setProbeDelta(clamped);
  };

  return (
    <Figure
      caption={
        snap.stuck
          ? `At ${info.x.toLocaleString()}, the gap to the next float16 is ${info.rightGap}. Adding ${probeDelta} lands short of the halfway mark and snaps right back to ${info.x.toLocaleString()}.`
          : `At ${info.x.toLocaleString()}, adding ${probeDelta} rounds to ${snap.snapped.toLocaleString()} (ULP = ${info.rightGap}). Drag along the line to feel the rounding threshold.`
      }
      controls={
        <>
          <Slider
            label="Start value (2^k)"
            min={7}
            max={13}
            step={1}
            value={octave}
            displayValue={info.x.toLocaleString()}
            onChange={handleOctave}
          />
          <ChipButton accent onClick={triggerPlusOne}>
            Try +1
          </ChipButton>
        </>
      }
    >
      <CanvasStage
        height={186}
        cursor="ew-resize"
        touchAction="pan-y"
        label="Adaptive zoom number line showing representable float tick spacing doubling at every power of two with an interactive +1 jump that bounces back when the gap exceeds 1"
        onPointerDown={(p) => {
          draggingRef.current = true;
          updateProbeFromX(p.x, p.width);
        }}
        onPointerMove={(p) => {
          if (!draggingRef.current) return;
          updateProbeFromX(p.x, p.width);
        }}
        onPointerUp={() => {
          draggingRef.current = false;
        }}
        onPointerLeave={() => {
          draggingRef.current = false;
        }}
        onFrame={({ ctx, width, height, dt, theme }) => {
          stepSpring(octaveSpringRef.current, octave, dt, 160, 22);
          const smoothK = octaveSpringRef.current.value;
          const smoothRightGap = Math.pow(2, smoothK - 10);
          const smoothLeftGap = smoothRightGap / 2;

          if (jumpRef.current.active && dt > 0) {
            jumpRef.current.age += dt;
            if (jumpRef.current.age > 1.35) {
              jumpRef.current.active = false;
            }
          }

          ctx.clearRect(0, 0, width, height);
          const { compact, padX, centerX, pxPerUnit } = getLayout(width, smoothRightGap);
          const hudH = 34;
          const lineY = 116;

          // Dedicated HUD header bar
          ctx.fillStyle = theme.surfaceSub;
          ctx.fillRect(0, 0, width, hudH);
          ctx.beginPath();
          ctx.moveTo(0, hudH + 0.5);
          ctx.lineTo(width, hudH + 0.5);
          ctx.strokeStyle = theme.line;
          ctx.lineWidth = 1;
          ctx.stroke();

          drawLabel(
            ctx,
            compact
              ? `Gaps: ${info.leftGap} | ${info.rightGap}`
              : `Gap below: ${info.leftGap}   ·   Gap above: ${info.rightGap}`,
            padX,
            hudH / 2,
            {
              color: theme.muted,
              font: theme.fontSans,
              size: compact ? 10.5 : 11.5,
            },
          );
          drawLabel(
            ctx,
            `${info.x} + ${probeDelta} = ${snap.snapped}`,
            width - padX,
            hudH / 2,
            {
              color: snap.stuck ? theme.crimson : theme.sage,
              font: theme.fontMono,
              size: compact ? 10.8 : 12,
              weight: 600,
              align: "right",
            },
          );

          // Main number line rail
          ctx.beginPath();
          ctx.moveTo(padX, lineY);
          ctx.lineTo(width - padX, lineY);
          ctx.strokeStyle = theme.lineStrong;
          ctx.lineWidth = 2;
          ctx.stroke();

          // Left-side ticks (2x denser, teal)
          ctx.strokeStyle = theme.teal;
          ctx.lineWidth = 1.6;
          const leftStepPx = Math.max(5, smoothLeftGap * pxPerUnit);
          for (let step = 1; step < 90; step++) {
            const tx = centerX - step * leftStepPx;
            if (tx < padX) break;
            ctx.beginPath();
            ctx.moveTo(tx, lineY - 9);
            ctx.lineTo(tx, lineY + 9);
            ctx.stroke();
          }

          // Right-side ticks (2x wider, sage or crimson when +1 is stuck)
          const rightStepPx = Math.max(10, smoothRightGap * pxPerUnit);
          for (let step = 1; step < 40; step++) {
            const tx = centerX + step * rightStepPx;
            if (tx > width - padX) break;
            ctx.strokeStyle = info.stuck ? theme.crimson : theme.sage;
            ctx.lineWidth = 1.9;
            ctx.beginPath();
            ctx.moveTo(tx, lineY - 12);
            ctx.lineTo(tx, lineY + 12);
            ctx.stroke();

            if (step <= 2 && Math.abs(smoothK - octave) < 0.25) {
              drawLabel(ctx, `${info.x + step * info.rightGap}`, tx, lineY + 25, {
                color: theme.muted,
                font: theme.fontMono,
                size: 10.5,
                align: "center",
              });
            }
          }

          // Subtle halfway rounding threshold marker between 2^k and 2^k + ULP
          const midTickX = centerX + 0.5 * rightStepPx;
          if (midTickX < width - padX - 8) {
            ctx.save();
            ctx.setLineDash([2, 3]);
            ctx.strokeStyle = theme.dim;
            ctx.globalAlpha = 0.65;
            ctx.beginPath();
            ctx.moveTo(midTickX, lineY - 22);
            ctx.lineTo(midTickX, lineY + 10);
            ctx.stroke();
            ctx.restore();
          }

          // Anchor tick at 2^k
          ctx.strokeStyle = theme.ink;
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.moveTo(centerX, lineY - 16);
          ctx.lineTo(centerX, lineY + 16);
          ctx.stroke();
          drawLabel(ctx, `${info.x}`, centerX, lineY + 25, {
            color: theme.ink,
            font: theme.fontMono,
            size: 11.5,
            weight: 600,
            align: "center",
          });

          // Target landing point (`2^k + probeDelta`) and true rounded float (`snap.snapped`)
          const targetX = clamp(centerX + probeDelta * pxPerUnit, padX, width - padX);
          const snappedX = clamp(centerX + (snap.snapped - info.x) * pxPerUnit, padX, width - padX);
          const arcColor = snap.stuck ? theme.crimson : theme.sage;

          // Jump arc from 2^k to 2^k + delta
          const midX = (centerX + targetX) / 2;
          const arcH = clamp(Math.abs(targetX - centerX) * 0.48, 30, 52);
          ctx.beginPath();
          ctx.moveTo(centerX, lineY - 16);
          ctx.quadraticCurveTo(midX, lineY - arcH, targetX, lineY - 5);
          ctx.strokeStyle = arcColor;
          ctx.lineWidth = 2.1;
          ctx.stroke();

          drawPillBadge(ctx, `+${probeDelta}`, midX, lineY - arcH + 4, {
            bg: snap.stuck ? theme.crimsonBg : theme.sageBg,
            stroke: arcColor,
            color: arcColor,
            font: theme.fontMono,
            size: 10.5,
            padX: 6,
            height: 18,
          });

          // Animated marker during `Try +1`: leaps to targetX, pauses, then settles permanently on snappedX!
          let dotX = snappedX;
          let dotY = lineY;
          if (jumpRef.current.active) {
            const age = jumpRef.current.age;
            if (age < 0.42) {
              const u = age / 0.42;
              const inv = 1 - u;
              dotX = inv * inv * centerX + 2 * inv * u * midX + u * u * targetX;
              dotY = inv * inv * (lineY - 16) + 2 * inv * u * (lineY - arcH) + u * u * lineY;
            } else if (age < 0.72) {
              dotX = targetX;
              dotY = lineY;
            } else {
              const u = clamp((age - 0.72) / 0.45, 0, 1);
              const ease = 1 - Math.pow(1 - u, 3);
              dotX = targetX + (snappedX - targetX) * ease;
              dotY = lineY + Math.sin(u * Math.PI) * 14;
            }
          }

          // Dotted snap-back / snap-forward curve showing rounding to nearest float
          if (Math.abs(snappedX - targetX) > 2) {
            ctx.save();
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(targetX, lineY + 6);
            ctx.quadraticCurveTo((targetX + snappedX) / 2, lineY + 26, snappedX, lineY + 8);
            ctx.strokeStyle = arcColor;
            ctx.lineWidth = 1.65;
            ctx.stroke();
            ctx.restore();
          }

          // Hollow ring at exact mathematical sum + solid dot at rounded/animated position
          ctx.fillStyle = theme.bg;
          ctx.strokeStyle = arcColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(targetX, lineY, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = arcColor;
          ctx.beginPath();
          ctx.arc(dotX, dotY, 5.5, 0, Math.PI * 2);
          ctx.fill();

          drawLabel(
            ctx,
            compact ? "2x denser" : "2x denser ticks below 2^k",
            padX,
            height - 12,
            { color: theme.teal, font: theme.fontSans, size: 10.5 },
          );
          drawLabel(
            ctx,
            snap.stuck ? "rounds back to 2^k" : "drag line to test rounding",
            width - padX,
            height - 12,
            {
              color: snap.stuck ? theme.crimson : theme.dim,
              font: theme.fontSans,
              size: 10.5,
              align: "right",
            },
          );
        }}
      />
    </Figure>
  );
}
