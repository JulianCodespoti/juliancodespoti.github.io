import { RotateCcw, StepForward } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CanvasStage, clamp, drawLabel, fillRoundRect, lerp, stepSpring } from "../../runtime";
import { ChipButton, Figure, IconButton, Slider, Toggle } from "../../ui";
import {
  circleIntersections,
  computeCovarianceEllipse2D,
  dist2D,
  MAP_H_METERS,
  MAP_W_METERS,
  measurePseudoranges,
  SATELLITES,
  solveGps2DTrace,
  SPEED_OF_LIGHT_M_PER_US,
  type Vec2,
} from "./model";

/* ==========================================================================
   Shared Isotropic Map Viewport (exact circles on every screen width!)
   ========================================================================== */

interface MapViewport {
  hudH: number;
  scale: number;
  ox: number;
  oy: number;
  toCanvas: (p: Vec2) => Vec2;
  toMap: (x: number, y: number) => Vec2;
}

function createMapViewport(width: number, height: number, hudH = 36): MapViewport {
  const padX = width < 480 ? 12 : 18;
  const padY = 12;
  const availW = Math.max(80, width - padX * 2);
  const availH = Math.max(80, height - hudH - padY * 2);
  const scale = Math.min(availW / MAP_W_METERS, availH / MAP_H_METERS);
  const ox = (width - MAP_W_METERS * scale) / 2;
  const oy = hudH + (height - hudH - MAP_H_METERS * scale) / 2;

  return {
    hudH,
    scale,
    ox,
    oy,
    toCanvas: (p) => ({ x: ox + p.x * scale, y: oy + p.y * scale }),
    toMap: (x, y) => ({
      x: clamp((x - ox) / scale, 52, MAP_W_METERS - 52),
      y: clamp((y - oy) / scale, 52, MAP_H_METERS - 52),
    }),
  };
}

function drawMapGridAndScale(
  ctx: CanvasRenderingContext2D,
  vp: MapViewport,
  width: number,
  height: number,
  theme: { line: string; lineStrong: string; dim: string; fontMono: string },
) {
  // Subtle 200 m cartographic coordinate hairlines inside the map pane
  ctx.save();
  ctx.strokeStyle = theme.line;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1;
  for (let mx = 200; mx < MAP_W_METERS; mx += 200) {
    const x = vp.ox + mx * vp.scale;
    ctx.beginPath();
    ctx.moveTo(x, vp.hudH);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let my = 140; my < MAP_H_METERS; my += 140) {
    const y = vp.oy + my * vp.scale;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.restore();

  // Crisp 200 m scale bar in bottom-left corner
  const barMeters = 200;
  const barPx = barMeters * vp.scale;
  const bx = 14;
  const by = height - 13;
  ctx.strokeStyle = theme.lineStrong;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(bx, by - 3);
  ctx.lineTo(bx, by);
  ctx.lineTo(bx + barPx, by);
  ctx.lineTo(bx + barPx, by - 3);
  ctx.stroke();
  drawLabel(ctx, "200 m", bx + barPx / 2, by - 9, {
    color: theme.dim,
    font: theme.fontMono,
    size: 9.5,
    align: "center",
  });
}

function drawSatelliteGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  aimAngle: number,
  color: string,
  haloColor: string,
  active: boolean,
) {
  if (active) {
    ctx.fillStyle = haloColor;
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(aimAngle + Math.PI / 2);
  // Twin solar wings + center body
  fillRoundRect(ctx, -11, -2.5, 6.5, 5, 1.5, color);
  fillRoundRect(ctx, 4.5, -2.5, 6.5, 5, 1.5, color);
  fillRoundRect(ctx, -3.5, -3.5, 7, 7, 2, color);
  ctx.restore();
}

function drawHudBar(
  ctx: CanvasRenderingContext2D,
  width: number,
  hudH: number,
  theme: { surfaceSub: string; line: string },
) {
  ctx.fillStyle = theme.surfaceSub;
  ctx.fillRect(0, 0, width, hudH);
  ctx.beginPath();
  ctx.moveTo(0, hudH + 0.5);
  ctx.lineTo(width, hudH + 0.5);
  ctx.strokeStyle = theme.line;
  ctx.lineWidth = 1;
  ctx.stroke();
}

/* ==========================================================================
   Figure 1: Draggable Satellites & Receiver (Trilateration + True Covariance Ellipse)
   ========================================================================== */

const SPREAD_SATS: Vec2[] = SATELLITES.map((s) => ({ ...s.pos }));
const CLUSTERED_SATS: Vec2[] = [
  { x: 310, y: 92 },
  { x: 465, y: 80 },
  { x: 620, y: 96 },
];

export function TrilaterationFigure() {
  const [satCount, setSatCount] = useState<"2" | "3">("3");
  const posRef = useRef<Vec2>({ x: 490, y: 315 });
  const satsRef = useRef<Vec2[]>(SPREAD_SATS.map((p) => ({ ...p })));
  const targetSatsRef = useRef<Vec2[]>(SPREAD_SATS.map((p) => ({ ...p })));
  const dragTargetRef = useRef<"me" | 0 | 1 | 2 | null>(null);
  const hoverTargetRef = useRef<"me" | 0 | 1 | 2 | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const applyPreset = (preset: "spread" | "cluster") => {
    targetSatsRef.current = (preset === "spread" ? SPREAD_SATS : CLUSTERED_SATS).map((p) => ({ ...p }));
    setSatCount("3");
  };

  const hitTest = (x: number, y: number, w: number, h: number, pointerType: string): "me" | 0 | 1 | 2 | null => {
    const vp = createMapViewport(w, h);
    if (y < vp.hudH) return null;
    const count = satCount === "2" ? 2 : 3;
    const hitPx = pointerType === "touch" ? 34 : 22;

    let best: "me" | 0 | 1 | 2 | null = null;
    let bestPx = hitPx;

    const mc = vp.toCanvas(posRef.current);
    const md = Math.hypot(x - mc.x, y - mc.y);
    if (md < bestPx) {
      bestPx = md;
      best = "me";
    }

    for (let i = 0; i < count; i++) {
      const sc = vp.toCanvas(satsRef.current[i]);
      const d = Math.hypot(x - sc.x, y - sc.y);
      if (d < bestPx) {
        bestPx = d;
        best = i as 0 | 1 | 2;
      }
    }
    return best;
  };

  return (
    <Figure
      caption={
        satCount === "2"
          ? "Drag You or either satellite. Two range circles always cross in two places, leaving a crimson mirror twin."
          : "Drag all three satellites toward one edge to watch the true error ellipse stretch sharply along the line of sight."
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
        height={(w) => (w < 480 ? 278 : 302)}
        cursor={isDragging ? "grabbing" : "grab"}
        touchAction="none"
        label="Interactive 2D satellite trilateration map with draggable receiver and satellites showing exact covariance error ellipse and GDOP"
        onPointerDown={(p) => {
          const vp = createMapViewport(p.width, p.height);
          if (p.y < vp.hudH) return;
          const hit = hitTest(p.x, p.y, p.width, p.height, p.pointerType);
          const target = hit ?? "me";
          dragTargetRef.current = target;
          hoverTargetRef.current = target;
          setIsDragging(true);
          const mapPt = vp.toMap(p.x, p.y);
          if (target === "me") {
            posRef.current = mapPt;
          } else {
            satsRef.current[target] = mapPt;
            targetSatsRef.current[target] = mapPt;
          }
        }}
        onPointerMove={(p) => {
          const t = dragTargetRef.current;
          if (t === null) {
            hoverTargetRef.current = hitTest(p.x, p.y, p.width, p.height, p.pointerType);
            return;
          }
          const vp = createMapViewport(p.width, p.height);
          const mapPt = vp.toMap(p.x, p.y);
          if (t === "me") {
            posRef.current = mapPt;
          } else {
            satsRef.current[t] = mapPt;
            targetSatsRef.current[t] = mapPt;
          }
        }}
        onPointerUp={() => {
          dragTargetRef.current = null;
          setIsDragging(false);
        }}
        onPointerLeave={() => {
          dragTargetRef.current = null;
          hoverTargetRef.current = null;
          setIsDragging(false);
        }}
        onFrame={({ ctx, width, height, dt, elapsed, theme, reducedMotion }) => {
          // Smoothly glide satellites toward preset targets when not being dragged
          const glide = dt > 0 ? 1 - Math.exp(-dt * 11) : 1;
          for (let i = 0; i < 3; i++) {
            if (dragTargetRef.current !== i) {
              satsRef.current[i].x = lerp(satsRef.current[i].x, targetSatsRef.current[i].x, glide);
              satsRef.current[i].y = lerp(satsRef.current[i].y, targetSatsRef.current[i].y, glide);
            }
          }

          ctx.clearRect(0, 0, width, height);
          const compact = width < 480;
          const vp = createMapViewport(width, height, 36);
          const count = satCount === "2" ? 2 : 3;
          const activeSats = satsRef.current.slice(0, count);
          const me = posRef.current;
          const mc = vp.toCanvas(me);

          const cov = satCount === "3" ? computeCovarianceEllipse2D(activeSats, me, 11) : null;
          const poorGeometry = Boolean(cov && cov.gdop > 4.2);

          // Clip map pane strictly below HUD bar so circles never collide with status text
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, vp.hudH, width, height - vp.hudH);
          ctx.clip();

          drawMapGridAndScale(ctx, vp, width, height, theme);

          // Subtle synchronous time-of-flight radio pulses radiating at shared speed of light
          const pulseMeters = !reducedMotion ? ((elapsed * 210) % 620) : 0;

          // Draw atmospheric +/- 11 m noise bands + exact range circles + faint sightlines
          for (let i = 0; i < count; i++) {
            const satPos = activeSats[i];
            const sc = vp.toCanvas(satPos);
            const trueDistM = dist2D(me, satPos);
            const rPx = trueDistM * vp.scale;
            const isActiveSat = dragTargetRef.current === i || hoverTargetRef.current === i;

            if (!reducedMotion && pulseMeters > 6 && pulseMeters < trueDistM + 60) {
              const fade = clamp(1 - pulseMeters / 620, 0, 1);
              ctx.strokeStyle = theme.teal;
              ctx.globalAlpha = fade * 0.22;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.arc(sc.x, sc.y, pulseMeters * vp.scale, 0, Math.PI * 2);
              ctx.stroke();
              ctx.globalAlpha = 1;
            }

            // Translucent +/- 11m range noise band
            ctx.strokeStyle = poorGeometry ? theme.crimsonBg : theme.tealBg;
            ctx.lineWidth = Math.max(7, 22 * vp.scale);
            ctx.beginPath();
            ctx.arc(sc.x, sc.y, rPx, 0, Math.PI * 2);
            ctx.stroke();

            // Exact nominal range ring
            ctx.strokeStyle = isActiveSat ? theme.ink : theme.teal;
            ctx.globalAlpha = isActiveSat ? 0.85 : 0.62;
            ctx.lineWidth = isActiveSat ? 1.8 : 1.35;
            ctx.beginPath();
            ctx.arc(sc.x, sc.y, rPx, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;

            // Faint sightline from satellite to receiver
            ctx.save();
            ctx.setLineDash([2, 4]);
            ctx.beginPath();
            ctx.moveTo(sc.x, sc.y);
            ctx.lineTo(mc.x, mc.y);
            ctx.strokeStyle = isActiveSat ? theme.teal : theme.lineStrong;
            ctx.globalAlpha = isActiveSat ? 0.75 : 0.32;
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();

            if (isActiveSat) {
              drawLabel(ctx, `${Math.round(trueDistM)} m`, (sc.x + mc.x) / 2, (sc.y + mc.y) / 2 - 8, {
                color: theme.teal,
                font: theme.fontMono,
                size: 10,
                weight: 600,
                align: "center",
              });
            }

            const aimAngle = Math.atan2(mc.y - sc.y, mc.x - sc.x);
            drawSatelliteGlyph(ctx, sc.x, sc.y, aimAngle, theme.teal, theme.tealBg, isActiveSat);

            drawLabel(ctx, SATELLITES[i].id, sc.x, sc.y - 16, {
              color: isActiveSat ? theme.ink : theme.muted,
              font: theme.fontSans,
              size: 10.5,
              weight: 600,
              align: "center",
            });
          }

          // Mirror twin in 2-satellite mode
          if (satCount === "2") {
            const r0 = dist2D(me, activeSats[0]);
            const r1 = dist2D(me, activeSats[1]);
            const hits = circleIntersections(activeSats[0], r0, activeSats[1], r1);
            const ghost = hits.find((h) => dist2D(h, me) > 10);
            if (ghost) {
              const gc = vp.toCanvas(ghost);
              ctx.fillStyle = theme.crimsonBg;
              ctx.strokeStyle = theme.crimson;
              ctx.lineWidth = 1.8;
              ctx.beginPath();
              ctx.arc(gc.x, gc.y, 7.5, 0, Math.PI * 2);
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

          // True tilted 2D covariance uncertainty ellipse (from Q = (H^T H)^-1)!
          if (cov && Number.isFinite(cov.majorMeters)) {
            const rx = clamp(cov.majorMeters * vp.scale * 1.45, 8, Math.max(width, height) * 0.45);
            const ry = clamp(cov.minorMeters * vp.scale * 1.45, 7, Math.max(width, height) * 0.45);
            ctx.save();
            ctx.translate(mc.x, mc.y);
            ctx.rotate(cov.angleRad);
            ctx.fillStyle = poorGeometry ? theme.crimsonBg : theme.sageBg;
            ctx.strokeStyle = poorGeometry ? theme.crimson : theme.sage;
            ctx.lineWidth = poorGeometry ? 1.6 : 1.15;
            ctx.beginPath();
            ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Show major axis ticks inside elongated ellipse so direction of dilution is unmistakable
            if (rx > ry * 1.6 && rx > 24) {
              ctx.setLineDash([3, 3]);
              ctx.strokeStyle = poorGeometry ? theme.crimson : theme.sage;
              ctx.globalAlpha = 0.55;
              ctx.beginPath();
              ctx.moveTo(-rx + 4, 0);
              ctx.lineTo(rx - 4, 0);
              ctx.stroke();
            }
            ctx.restore();
          }

          // Draggable receiver dot
          const meActive = dragTargetRef.current === "me" || hoverTargetRef.current === "me";
          if (meActive) {
            ctx.fillStyle = theme.sageBg;
            ctx.beginPath();
            ctx.arc(mc.x, mc.y, 14, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = theme.sage;
          ctx.strokeStyle = theme.bg;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(mc.x, mc.y, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          drawLabel(ctx, "You", mc.x + 12, mc.y, {
            color: theme.ink,
            font: theme.fontSans,
            size: 11.5,
            weight: 600,
          });
          ctx.restore();

          // Clean dedicated HUD bar (zero ring overlap)
          drawHudBar(ctx, width, vp.hudH, theme);
          drawLabel(ctx, compact ? "Drag You or satellites" : "Drag You or any satellite", 14, vp.hudH / 2, {
            color: theme.muted,
            font: theme.fontSans,
            size: compact ? 11 : 11.5,
          });
          const statusText =
            satCount === "2"
              ? "2 sats: ambiguous"
              : cov
                ? compact
                  ? `GDOP ${cov.gdop.toFixed(1)} (±${Math.round(cov.majorMeters)} m)`
                  : `GDOP: ${cov.gdop.toFixed(1)}  ·  max error ±${Math.round(cov.majorMeters)} m`
                : "";
          drawLabel(ctx, statusText, width - 14, vp.hudH / 2, {
            color: satCount === "2" || poorGeometry ? theme.crimson : theme.sage,
            font: theme.fontMono,
            size: compact ? 10.8 : 11.5,
            weight: 600,
            align: "right",
          });
        }}
      />
    </Figure>
  );
}

/* ==========================================================================
   Figure 2: Clock-Bias Ring Pull + Step-by-Step Gauss-Newton Solver
   ========================================================================== */

const TRUE_RECEIVER: Vec2 = { x: 485, y: 285 };

export function ClockDriftSolverFigure() {
  const [clockBiasUs, setClockBiasUs] = useState(0.32);
  const [stepIdx, setStepIdx] = useState(0);
  const [autoSolving, setAutoSolving] = useState(false);

  const correctionSpringRef = useRef({ value: 0, velocity: 0 });
  const estXSpringRef = useRef({ value: 380, velocity: 0 });
  const estYSpringRef = useRef({ value: 210, velocity: 0 });

  const pseudoranges = useMemo(() => measurePseudoranges(TRUE_RECEIVER, clockBiasUs), [clockBiasUs]);
  const trace = useMemo(
    () => solveGps2DTrace(pseudoranges, { x: 380, y: 210 }),
    [pseudoranges],
  );
  const maxStep = trace.length - 1;
  const activeStep = trace[Math.min(stepIdx, maxStep)];
  const finalStep = trace[maxStep];
  const isSolved = stepIdx >= maxStep && maxStep > 0;

  // Deterministic React-safe iteration stepper (zero setState inside requestAnimationFrame!)
  useEffect(() => {
    if (!autoSolving) return;
    if (stepIdx >= maxStep) {
      setAutoSolving(false);
      return;
    }
    const id = window.setTimeout(() => {
      setStepIdx((prev) => Math.min(maxStep, prev + 1));
    }, 340);
    return () => window.clearTimeout(id);
  }, [autoSolving, stepIdx, maxStep]);

  const handleSlider = (nextUs: number) => {
    setClockBiasUs(nextUs);
    setStepIdx(0);
    setAutoSolving(false);
    correctionSpringRef.current = { value: 0, velocity: 0 };
    estXSpringRef.current = { value: 380, velocity: 0 };
    estYSpringRef.current = { value: 210, velocity: 0 };
  };

  const runSolver = () => {
    if (isSolved) {
      setStepIdx(0);
      correctionSpringRef.current = { value: 0, velocity: 0 };
      estXSpringRef.current = { value: 380, velocity: 0 };
      estYSpringRef.current = { value: 210, velocity: 0 };
    }
    setAutoSolving(true);
  };

  const singleStep = () => {
    setAutoSolving(false);
    setStepIdx((s) => (s >= maxStep ? 0 : s + 1));
  };

  const resetBias = () => {
    setClockBiasUs(0.32);
    setStepIdx(0);
    setAutoSolving(false);
    correctionSpringRef.current = { value: 0, velocity: 0 };
    estXSpringRef.current = { value: 380, velocity: 0 };
    estYSpringRef.current = { value: 210, velocity: 0 };
  };

  const biasMeters = Math.round(clockBiasUs * SPEED_OF_LIGHT_M_PER_US);

  return (
    <Figure
      caption={
        isSolved
          ? `Converged in ${finalStep.iter} Gauss-Newton steps: recovered clock error of ${finalStep.clockBiasUs >= 0 ? "+" : ""}${finalStep.clockBiasUs.toFixed(2)} us (${Math.round(finalStep.clockBiasMeters)} m) and locked onto your exact fix.`
          : stepIdx > 0
            ? `Iteration ${activeStep.iter} of ${finalStep.iter}: estimated clock offset ${activeStep.clockBiasUs >= 0 ? "+" : ""}${activeStep.clockBiasUs.toFixed(2)} us, residual down to ${activeStep.residualMeters.toFixed(1)} m.`
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
          <ChipButton accent active={isSolved} onClick={runSolver}>
            {isSolved ? "Solved (replay)" : "Solve clock offset"}
          </ChipButton>
          <ChipButton onClick={singleStep} label="Advance one Gauss-Newton iteration">
            <StepForward size={13} />
            Step {stepIdx}/{maxStep}
          </ChipButton>
          <IconButton label="Reset clock drift" onClick={resetBias}>
            <RotateCcw size={14} />
          </IconButton>
        </>
      }
    >
      <CanvasStage
        height={(w) => (w < 480 ? 278 : 302)}
        touchAction="pan-y"
        label="Interactive GPS clock drift canvas showing three satellite rings pulling apart when the phone clock is biased and snapping back onto a pinpoint across Gauss-Newton iterations"
        onFrame={({ ctx, width, height, dt, theme }) => {
          stepSpring(correctionSpringRef.current, activeStep.clockBiasMeters, dt, 150, 22);
          stepSpring(estXSpringRef.current, activeStep.pos.x, dt, 150, 22);
          stepSpring(estYSpringRef.current, activeStep.pos.y, dt, 150, 22);

          const appliedCorrection = correctionSpringRef.current.value;
          const estPos = { x: estXSpringRef.current.value, y: estYSpringRef.current.value };

          ctx.clearRect(0, 0, width, height);
          const compact = width < 480;
          const vp = createMapViewport(width, height, 36);
          const remainingErrMeters = Math.abs(clockBiasUs * SPEED_OF_LIGHT_M_PER_US - appliedCorrection);
          const locked = remainingErrMeters < 2.2;

          ctx.save();
          ctx.beginPath();
          ctx.rect(0, vp.hudH, width, height - vp.hudH);
          ctx.clip();

          drawMapGridAndScale(ctx, vp, width, height, theme);

          const mc = vp.toCanvas(TRUE_RECEIVER);
          const ec = vp.toCanvas(estPos);

          // Faint reference true rings while biased
          if (!locked) {
            ctx.save();
            ctx.setLineDash([3, 4]);
            for (const sat of SATELLITES) {
              const sc = vp.toCanvas(sat.pos);
              const trueR = dist2D(TRUE_RECEIVER, sat.pos) * vp.scale;
              ctx.strokeStyle = theme.lineStrong;
              ctx.globalAlpha = 0.35;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.arc(sc.x, sc.y, trueR, 0, Math.PI * 2);
              ctx.stroke();
            }
            ctx.restore();
          }

          // Pseudorange rings shifted by current solver bias correction
          for (let i = 0; i < SATELLITES.length; i++) {
            const sat = SATELLITES[i];
            const sc = vp.toCanvas(sat.pos);
            const rMeters = Math.max(8, pseudoranges[i] - appliedCorrection);
            const rPx = rMeters * vp.scale;

            ctx.strokeStyle = locked ? theme.sage : theme.crimson;
            ctx.globalAlpha = locked ? 0.68 : 0.76;
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.arc(sc.x, sc.y, rPx, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;

            const aimAngle = Math.atan2(mc.y - sc.y, mc.x - sc.x);
            drawSatelliteGlyph(ctx, sc.x, sc.y, aimAngle, theme.teal, theme.tealBg, false);

            drawLabel(ctx, sat.id, sc.x, sc.y - 15, {
              color: theme.muted,
              font: theme.fontSans,
              size: 10.5,
              weight: 600,
              align: "center",
            });
          }

          // Draw Gauss-Newton iteration path from initial guess into true position
          if (stepIdx > 0) {
            ctx.save();
            ctx.setLineDash([3, 3]);
            ctx.strokeStyle = theme.copper;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            for (let k = 0; k <= Math.min(stepIdx, maxStep); k++) {
              const pt = vp.toCanvas(trace[k].pos);
              if (k === 0) ctx.moveTo(pt.x, pt.y);
              else ctx.lineTo(pt.x, pt.y);
            }
            ctx.stroke();
            ctx.restore();

            for (let k = 0; k < Math.min(stepIdx, maxStep); k++) {
              const pt = vp.toCanvas(trace[k].pos);
              ctx.fillStyle = theme.copper;
              ctx.beginPath();
              ctx.arc(pt.x, pt.y, 2.8, 0, Math.PI * 2);
              ctx.fill();
            }

            // Live estimated fix dot when still walking in
            if (!locked) {
              ctx.fillStyle = theme.copper;
              ctx.strokeStyle = theme.bg;
              ctx.lineWidth = 1.6;
              ctx.beginPath();
              ctx.arc(ec.x, ec.y, 5, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
            }
          }

          // Mismatch error zone around true receiver
          if (!locked) {
            ctx.fillStyle = theme.crimsonBg;
            ctx.strokeStyle = theme.crimsonLine;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(mc.x, mc.y, Math.max(8, remainingErrMeters * vp.scale * 0.65), 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }

          // True position dot
          ctx.fillStyle = locked ? theme.sage : theme.ink;
          ctx.strokeStyle = theme.bg;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(mc.x, mc.y, locked ? 6.5 : 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          drawLabel(ctx, locked ? "Exact fix" : "True position", mc.x + 12, mc.y, {
            color: locked ? theme.sage : theme.muted,
            font: theme.fontSans,
            size: 11.5,
            weight: 600,
          });
          ctx.restore();

          // Clean dedicated HUD bar
          drawHudBar(ctx, width, vp.hudH, theme);
          drawLabel(
            ctx,
            locked
              ? compact
                ? "Locked on pinpoint"
                : "All 3 rings intersect at one point"
              : compact
                ? `Mismatch: ${Math.round(remainingErrMeters)} m`
                : `Unresolved ring mismatch: ${Math.round(remainingErrMeters)} m`,
            14,
            vp.hudH / 2,
            {
              color: locked ? theme.sage : theme.crimson,
              font: theme.fontSans,
              size: compact ? 11 : 11.8,
              weight: 600,
            },
          );
          drawLabel(
            ctx,
            stepIdx > 0
              ? `bias ${(-appliedCorrection / SPEED_OF_LIGHT_M_PER_US) >= 0 ? "+" : ""}${(-appliedCorrection / SPEED_OF_LIGHT_M_PER_US).toFixed(2)} us`
              : "1 us = 300 m",
            width - 14,
            vp.hudH / 2,
            {
              color: theme.muted,
              font: theme.fontMono,
              size: compact ? 10.5 : 11.2,
              align: "right",
            },
          );
        }}
      />
    </Figure>
  );
}
