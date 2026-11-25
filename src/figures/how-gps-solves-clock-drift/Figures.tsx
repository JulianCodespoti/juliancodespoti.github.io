import { RotateCcw } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { CanvasStage, clamp, drawLabel, stepSpring } from "../../runtime";
import { ChipButton, Figure, IconButton, Slider, Toggle } from "../../ui";
import {
  circleIntersections,
  dist2D,
  MAP_H_METERS,
  MAP_W_METERS,
  measurePseudoranges,
  SATELLITES,
  solveGps2D,
  SPEED_OF_LIGHT_M_PER_US,
  type Vec2,
} from "./model";

/* ==========================================================================
   Figure 1: Drag-Yourself Trilateration (Why 2 Circles Leave a Ghost Twin)
   ========================================================================== */

export function TrilaterationFigure() {
  const [satCount, setSatCount] = useState<"2" | "3">("2");
  const posRef = useRef<Vec2>({ x: 470, y: 280 });
  const draggingRef = useRef(false);

  const mapToCanvas = (p: Vec2, w: number, h: number) => ({
    x: (p.x / MAP_W_METERS) * w,
    y: (p.y / MAP_H_METERS) * h,
  });

  const canvasToMap = (x: number, y: number, w: number, h: number): Vec2 => ({
    x: clamp((x / w) * MAP_W_METERS, 90, MAP_W_METERS - 90),
    y: clamp((y / h) * MAP_H_METERS, 70, MAP_H_METERS - 70),
  });

  return (
    <Figure
      caption={
        satCount === "2"
          ? "Drag the green dot. Two distance circles always cross at two spots, leaving a crimson ghost twin."
          : "Adding a third satellite breaks the tie and locks onto your exact position."
      }
      controls={
        <Toggle
          label="Satellite count"
          value={satCount}
          onChange={setSatCount}
          options={[
            { value: "2", label: "2 satellites" },
            { value: "3", label: "3 satellites" },
          ]}
        />
      }
    >
      <CanvasStage
        height={240}
        cursor="grab"
        label="Interactive 2D satellite trilateration map where dragging the receiver shows two ambiguous intersections with two satellites and one unique fix with three"
        onPointerDown={(p) => {
          draggingRef.current = true;
          posRef.current = canvasToMap(p.x, p.y, p.width, p.height);
        }}
        onPointerMove={(p) => {
          if (!draggingRef.current) return;
          posRef.current = canvasToMap(p.x, p.y, p.width, p.height);
        }}
        onPointerUp={() => {
          draggingRef.current = false;
        }}
        onPointerLeave={() => {
          draggingRef.current = false;
        }}
        onFrame={({ ctx, width, height, theme }) => {
          ctx.clearRect(0, 0, width, height);
          const scale = width / MAP_W_METERS;
          const activeSats = satCount === "2" ? SATELLITES.slice(0, 2) : SATELLITES;
          const me = posRef.current;

          // Draw satellite distance rings
          for (const sat of activeSats) {
            const sc = mapToCanvas(sat.pos, width, height);
            const rMeters = dist2D(me, sat.pos);
            const rPx = rMeters * scale;

            ctx.strokeStyle = theme.teal;
            ctx.globalAlpha = 0.45;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(sc.x, sc.y, rPx, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;

            // Satellite dot + label
            ctx.fillStyle = theme.teal;
            ctx.beginPath();
            ctx.arc(sc.x, sc.y, 5, 0, Math.PI * 2);
            ctx.fill();

            drawLabel(ctx, sat.id, sc.x, sc.y - 13, {
              color: theme.muted,
              font: theme.fontSans,
              size: 11,
              weight: 600,
              align: "center",
            });
          }

          // When using only 2 satellites, compute and highlight the ambiguous ghost intersection!
          if (satCount === "2") {
            const r0 = dist2D(me, SATELLITES[0].pos);
            const r1 = dist2D(me, SATELLITES[1].pos);
            const hits = circleIntersections(SATELLITES[0].pos, r0, SATELLITES[1].pos, r1);
            const ghost = hits.find((h) => dist2D(h, me) > 12);
            if (ghost) {
              const gc = mapToCanvas(ghost, width, height);
              ctx.fillStyle = theme.crimsonBg;
              ctx.strokeStyle = theme.crimson;
              ctx.lineWidth = 1.8;
              ctx.beginPath();
              ctx.arc(gc.x, gc.y, 7, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();

              drawLabel(ctx, "Ambiguous twin?", gc.x + 12, gc.y, {
                color: theme.crimson,
                font: theme.fontSans,
                size: 11,
                weight: 600,
              });
            }
          }

          // Draggable receiver dot
          const mc = mapToCanvas(me, width, height);
          ctx.fillStyle = theme.sageBg;
          ctx.beginPath();
          ctx.arc(mc.x, mc.y, 14, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = theme.sage;
          ctx.beginPath();
          ctx.arc(mc.x, mc.y, 6, 0, Math.PI * 2);
          ctx.fill();

          drawLabel(ctx, "You (drag)", mc.x + 15, mc.y, {
            color: theme.ink,
            font: theme.fontSans,
            size: 11.5,
            weight: 600,
          });
        }}
      />
    </Figure>
  );
}

/* ==========================================================================
   Figure 2: Clock-Bias Ring Pull + Live Gauss-Newton Offset Solver
   ========================================================================== */

const TRUE_RECEIVER: Vec2 = { x: 485, y: 278 };

export function ClockDriftSolverFigure() {
  const [clockBiasUs, setClockBiasUs] = useState(0.32); // Start biased (+96 m error!) so the ring gap is immediately obvious
  const [solved, setSolved] = useState(false);

  const correctionSpringRef = useRef({ value: 0, velocity: 0 });
  const pseudoranges = useMemo(() => measurePseudoranges(TRUE_RECEIVER, clockBiasUs), [clockBiasUs]);
  const solution = useMemo(() => solveGps2D(pseudoranges), [pseudoranges]);

  const handleSlider = (nextUs: number) => {
    setClockBiasUs(nextUs);
    setSolved(false);
    correctionSpringRef.current = { value: 0, velocity: 0 };
  };

  const runSolver = () => {
    setSolved(true);
  };

  const resetBias = () => {
    setClockBiasUs(0.32);
    setSolved(false);
    correctionSpringRef.current = { value: 0, velocity: 0 };
  };

  const biasMeters = Math.round(clockBiasUs * SPEED_OF_LIGHT_M_PER_US);

  return (
    <Figure
      caption={
        solved
          ? `Solver converged in ${solution.iterations} Gauss-Newton steps: recovered hidden clock error of ${solution.clockBiasUs >= 0 ? "+" : ""}${solution.clockBiasUs.toFixed(2)} us (${Math.round(solution.clockBiasMeters)} m) and locked back onto your exact position.`
          : Math.abs(clockBiasUs) < 0.01
            ? "Clock synced: all three rings cross at a single point."
            : `Phone clock is off by ${clockBiasUs >= 0 ? "+" : ""}${clockBiasUs.toFixed(2)} us: every ring shifts by ${biasMeters >= 0 ? "+" : ""}${biasMeters} m, leaving no shared intersection.`
      }
      controls={
        <>
          <Slider
            label="Clock error"
            min={-0.5}
            max={0.5}
            step={0.02}
            value={clockBiasUs}
            displayValue={`${clockBiasUs >= 0 ? "+" : ""}${clockBiasUs.toFixed(2)} us`}
            onChange={handleSlider}
          />
          <ChipButton accent active={solved} onClick={runSolver}>
            {solved ? "Solved" : "Solve clock offset"}
          </ChipButton>
          <IconButton label="Reset clock drift" onClick={resetBias}>
            <RotateCcw size={14} />
          </IconButton>
        </>
      }
    >
      <CanvasStage
        height={248}
        label="Interactive GPS clock drift canvas showing three satellite rings pulling apart when the phone clock is biased and snapping back onto a pinpoint when the solver cancels the clock offset"
        onFrame={({ ctx, width, height, dt, theme }) => {
          const targetCorrection = solved ? solution.clockBiasMeters : 0;
          stepSpring(correctionSpringRef.current, targetCorrection, dt, 120, 20);
          const appliedCorrection = correctionSpringRef.current.value;

          ctx.clearRect(0, 0, width, height);
          const scale = width / MAP_W_METERS;
          const remainingErrMeters = Math.abs(clockBiasUs * SPEED_OF_LIGHT_M_PER_US - appliedCorrection);
          const locked = remainingErrMeters < 2.5;

          const mapToCanvas = (p: Vec2) => ({
            x: (p.x / MAP_W_METERS) * width,
            y: (p.y / MAP_H_METERS) * height,
          });

          // Subtle top status inside canvas
          drawLabel(
            ctx,
            locked ? "All 3 rings intersect at one point" : `Unresolved ring mismatch: ${Math.round(remainingErrMeters)} m`,
            20,
            18,
            {
              color: locked ? theme.sage : theme.crimson,
              font: theme.fontSans,
              size: 12,
              weight: 600,
            },
          );
          drawLabel(
            ctx,
            solved ? `Applied offset: ${(-appliedCorrection / SPEED_OF_LIGHT_M_PER_US).toFixed(2)} us` : "1 us = 300 m",
            width - 20,
            18,
            {
              color: theme.dim,
              font: theme.fontSans,
              size: 11.5,
              align: "right",
            },
          );

          const mc = mapToCanvas(TRUE_RECEIVER);

          // Draw subtle true-distance dashed ghost rings when biased so reader sees the exact shift!
          if (!locked) {
            ctx.save();
            ctx.setLineDash([3, 4]);
            for (const sat of SATELLITES) {
              const sc = mapToCanvas(sat.pos);
              const trueR = dist2D(TRUE_RECEIVER, sat.pos) * scale;
              ctx.strokeStyle = theme.line;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.arc(sc.x, sc.y, trueR, 0, Math.PI * 2);
              ctx.stroke();
            }
            ctx.restore();
          }

          // Draw measured (or solver-corrected) satellite rings
          for (let i = 0; i < SATELLITES.length; i++) {
            const sat = SATELLITES[i];
            const sc = mapToCanvas(sat.pos);
            const rMeters = Math.max(8, pseudoranges[i] - appliedCorrection);
            const rPx = rMeters * scale;

            ctx.strokeStyle = locked ? theme.sage : theme.crimson;
            ctx.globalAlpha = locked ? 0.65 : 0.72;
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.arc(sc.x, sc.y, rPx, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;

            ctx.fillStyle = theme.teal;
            ctx.beginPath();
            ctx.arc(sc.x, sc.y, 5, 0, Math.PI * 2);
            ctx.fill();

            drawLabel(ctx, sat.id, sc.x, sc.y - 13, {
              color: theme.muted,
              font: theme.fontSans,
              size: 11,
              weight: 600,
              align: "center",
            });
          }

          // Draw subtle crimson uncertainty ring around true receiver proportional to unresolved bias
          if (!locked) {
            ctx.fillStyle = theme.crimsonBg;
            ctx.beginPath();
            ctx.arc(mc.x, mc.y, Math.max(8, remainingErrMeters * scale * 0.65), 0, Math.PI * 2);
            ctx.fill();
          }

          // True position dot
          ctx.fillStyle = locked ? theme.sage : theme.ink;
          ctx.beginPath();
          ctx.arc(mc.x, mc.y, locked ? 6 : 4, 0, Math.PI * 2);
          ctx.fill();

          drawLabel(ctx, locked ? "Exact fix" : "True position", mc.x + 12, mc.y, {
            color: locked ? theme.sage : theme.muted,
            font: theme.fontSans,
            size: 11.5,
            weight: 600,
          });
        }}
      />
    </Figure>
  );
}
