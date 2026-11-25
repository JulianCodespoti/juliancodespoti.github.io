import { RotateCcw } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { CanvasStage, clamp, drawLabel, stepSpring } from "../../runtime";
import { ChipButton, Figure, IconButton, Slider, Toggle } from "../../ui";
import {
  circleIntersections,
  computeHdop2D,
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
   Figure 1: Draggable Satellites & Receiver (Trilateration + Live GDOP!)
   ========================================================================== */

const SPREAD_SATS: Vec2[] = SATELLITES.map((s) => ({ ...s.pos }));
const CLUSTERED_SATS: Vec2[] = [
  { x: 220, y: 122 },
  { x: 340, y: 112 },
  { x: 460, y: 126 },
];

export function TrilaterationFigure() {
  const [satCount, setSatCount] = useState<"2" | "3">("3");
  const posRef = useRef<Vec2>({ x: 485, y: 295 });
  const satsRef = useRef<Vec2[]>(SPREAD_SATS.map((p) => ({ ...p })));
  const dragTargetRef = useRef<"me" | 0 | 1 | 2 | null>(null);
  const [, bump] = useState(0);

  const mapToCanvas = (p: Vec2, w: number, h: number) => ({
    x: (p.x / MAP_W_METERS) * w,
    y: (p.y / MAP_H_METERS) * h,
  });

  const canvasToMap = (x: number, y: number, w: number, h: number): Vec2 => ({
    x: clamp((x / w) * MAP_W_METERS, 50, MAP_W_METERS - 50),
    y: clamp((y / h) * MAP_H_METERS, 48, MAP_H_METERS - 48),
  });

  const applyPreset = (preset: "spread" | "cluster") => {
    satsRef.current = (preset === "spread" ? SPREAD_SATS : CLUSTERED_SATS).map((p) => ({ ...p }));
    setSatCount("3");
    bump((n) => n + 1);
  };

  return (
    <Figure
      caption={
        satCount === "2"
          ? "Drag the green dot or any satellite. Two circles always cross at two spots, leaving a crimson mirror twin."
          : "Drag all three teal satellites toward one edge to watch GDOP spike and inflate your uncertainty zone."
      }
      controls={
        <>
          <Toggle
            label="Satellite count"
            value={satCount}
            onChange={setSatCount}
            options={[
              { value: "2", label: "2 satellites" },
              { value: "3", label: "3 satellites" },
            ]}
          />
          <ChipButton onClick={() => applyPreset("cluster")}>Cluster satellites</ChipButton>
          <IconButton label="Reset satellite geometry" onClick={() => applyPreset("spread")}>
            <RotateCcw size={14} />
          </IconButton>
        </>
      }
    >
      <CanvasStage
        height={248}
        cursor="grab"
        touchAction="none"
        label="Interactive 2D satellite trilateration map with draggable receiver and draggable satellites showing live GDOP uncertainty"
        onPointerDown={(p) => {
          const mapPt = canvasToMap(p.x, p.y, p.width, p.height);
          const count = satCount === "2" ? 2 : 3;
          // Hit-test satellites first so user can drag any satellite directly!
          let bestTarget: "me" | 0 | 1 | 2 = "me";
          let bestDist = dist2D(mapPt, posRef.current);
          for (let i = 0; i < count; i++) {
            const d = dist2D(mapPt, satsRef.current[i]);
            if (d < 55 && d < bestDist) {
              bestDist = d;
              bestTarget = i as 0 | 1 | 2;
            }
          }
          dragTargetRef.current = bestTarget;
          if (bestTarget === "me") posRef.current = mapPt;
          else satsRef.current[bestTarget] = mapPt;
        }}
        onPointerMove={(p) => {
          const t = dragTargetRef.current;
          if (t === null) return;
          const mapPt = canvasToMap(p.x, p.y, p.width, p.height);
          if (t === "me") posRef.current = mapPt;
          else satsRef.current[t] = mapPt;
        }}
        onPointerUp={() => {
          dragTargetRef.current = null;
        }}
        onPointerLeave={() => {
          dragTargetRef.current = null;
        }}
        onFrame={({ ctx, width, height, theme }) => {
          ctx.clearRect(0, 0, width, height);
          const scale = width / MAP_W_METERS;
          const count = satCount === "2" ? 2 : 3;
          const activeSats = satsRef.current.slice(0, count);
          const me = posRef.current;

          const hdop = satCount === "3" ? computeHdop2D(activeSats, me) : Infinity;
          const poorGeometry = Number.isFinite(hdop) && hdop > 3.5;

          // Top GDOP status
          drawLabel(ctx, "Drag you or any satellite", 20, 18, {
            color: theme.dim,
            font: theme.fontSans,
            size: 11.5,
          });
          drawLabel(
            ctx,
            satCount === "2"
              ? "2 satellites: ambiguous fix"
              : `GDOP: ${hdop.toFixed(1)} (${hdop < 2 ? "tight" : hdop < 4 ? "fair" : "poor"})`,
            width - 20,
            18,
            {
              color: satCount === "2" || poorGeometry ? theme.crimson : theme.sage,
              font: theme.fontSans,
              size: 12,
              weight: 600,
              align: "right",
            },
          );

          // Draw subtle measurement-noise ring bands (+/- 10m radio noise) + crisp distance rings
          for (let i = 0; i < count; i++) {
            const satPos = activeSats[i];
            const sc = mapToCanvas(satPos, width, height);
            const rPx = dist2D(me, satPos) * scale;

            // Thick translucent noise band shows why clustered rings overlap across a huge blurry zone!
            ctx.strokeStyle = poorGeometry ? theme.crimsonBg : theme.tealBg;
            ctx.lineWidth = Math.max(8, 22 * scale);
            ctx.beginPath();
            ctx.arc(sc.x, sc.y, rPx, 0, Math.PI * 2);
            ctx.stroke();

            ctx.strokeStyle = theme.teal;
            ctx.globalAlpha = 0.55;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.arc(sc.x, sc.y, rPx, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;

            ctx.fillStyle = theme.teal;
            ctx.beginPath();
            ctx.arc(sc.x, sc.y, 6, 0, Math.PI * 2);
            ctx.fill();

            drawLabel(ctx, SATELLITES[i].id, sc.x, sc.y - 14, {
              color: theme.muted,
              font: theme.fontSans,
              size: 11,
              weight: 600,
              align: "center",
            });
          }

          if (satCount === "2") {
            const r0 = dist2D(me, activeSats[0]);
            const r1 = dist2D(me, activeSats[1]);
            const hits = circleIntersections(activeSats[0], r0, activeSats[1], r1);
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

              drawLabel(ctx, "Mirror twin?", gc.x + 12, gc.y, {
                color: theme.crimson,
                font: theme.fontSans,
                size: 11,
                weight: 600,
              });
            }
          }

          const mc = mapToCanvas(me, width, height);

          // Visual error halo scaled by real HDOP when using 3 satellites
          if (satCount === "3") {
            const errRadiusPx = clamp(hdop * 7.5, 9, 72);
            ctx.fillStyle = poorGeometry ? theme.crimsonBg : theme.sageBg;
            ctx.strokeStyle = poorGeometry ? theme.crimson : theme.sage;
            ctx.lineWidth = poorGeometry ? 1.4 : 1;
            ctx.beginPath();
            ctx.arc(mc.x, mc.y, errRadiusPx, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }

          ctx.fillStyle = theme.sage;
          ctx.beginPath();
          ctx.arc(mc.x, mc.y, 6, 0, Math.PI * 2);
          ctx.fill();

          drawLabel(ctx, "You", mc.x + 13, mc.y, {
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
  const [clockBiasUs, setClockBiasUs] = useState(0.32);
  const [solved, setSolved] = useState(false);

  const correctionSpringRef = useRef({ value: 0, velocity: 0 });
  const pseudoranges = useMemo(() => measurePseudoranges(TRUE_RECEIVER, clockBiasUs), [clockBiasUs]);
  const solution = useMemo(() => solveGps2D(pseudoranges), [pseudoranges]);

  const handleSlider = (nextUs: number) => {
    setClockBiasUs(nextUs);
    setSolved(false);
    correctionSpringRef.current = { value: 0, velocity: 0 };
  };

  const runSolver = () => setSolved(true);

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
          ? `Converged in ${solution.iterations} Gauss-Newton steps: recovered hidden clock error of ${solution.clockBiasUs >= 0 ? "+" : ""}${solution.clockBiasUs.toFixed(2)} us (${Math.round(solution.clockBiasMeters)} m) and snapped back onto your exact fix.`
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
        touchAction="none"
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

          if (!locked) {
            ctx.fillStyle = theme.crimsonBg;
            ctx.beginPath();
            ctx.arc(mc.x, mc.y, Math.max(8, remainingErrMeters * scale * 0.65), 0, Math.PI * 2);
            ctx.fill();
          }

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
