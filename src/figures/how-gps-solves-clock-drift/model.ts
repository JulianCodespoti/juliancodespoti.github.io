import { clamp } from "../../runtime/canvas/math";

/* ==========================================================================
   Exact 2D GPS Trilateration, Covariance Ellipse & Gauss-Newton Solver
   (2D map = 3 unknowns [x, y, clockBias] -> exact analog of 3D GPS [x,y,z,b])
   ========================================================================== */

export const SPEED_OF_LIGHT_M_PER_US = 299.792458; // ~300 meters per microsecond!

export interface Vec2 {
  x: number; // meters
  y: number; // meters
}

export const MAP_W_METERS = 1000;
export const MAP_H_METERS = 560;

export const SATELLITES: readonly { id: string; pos: Vec2 }[] = [
  { id: "Sat A", pos: { x: 170, y: 120 } },
  { id: "Sat B", pos: { x: 830, y: 135 } },
  { id: "Sat C", pos: { x: 510, y: 485 } },
] as const;

export function dist2D(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Exact intersection points of two circles (center c1, radius r1) and (c2, r2).
 * Used to highlight the second ambiguous "mirror twin" solution when only 2 satellites are used.
 */
export function circleIntersections(c1: Vec2, r1: number, c2: Vec2, r2: number): Vec2[] {
  const d = dist2D(c1, c2);
  if (d === 0 || d > r1 + r2 + 1e-6 || d < Math.abs(r1 - r2) - 1e-6) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const hSq = Math.max(0, r1 * r1 - a * a);
  const h = Math.sqrt(hSq);
  const mx = c1.x + (a * (c2.x - c1.x)) / d;
  const my = c1.y + (a * (c2.y - c1.y)) / d;
  if (h < 1e-4) return [{ x: mx, y: my }];
  const rx = (-(c2.y - c1.y) * h) / d;
  const ry = ((c2.x - c1.x) * h) / d;
  return [
    { x: mx + rx, y: my + ry },
    { x: mx - rx, y: my - ry },
  ];
}

/** Computes measured pseudoranges rho_i = trueDist_i + clockBiasUs * c. */
export function measurePseudoranges(
  receiver: Vec2,
  clockBiasUs: number,
  satPositions: readonly Vec2[] = SATELLITES.map((s) => s.pos),
): number[] {
  const biasMeters = clockBiasUs * SPEED_OF_LIGHT_M_PER_US;
  return satPositions.map((pos) => Math.max(12, dist2D(receiver, pos) + biasMeters));
}

/** Exact 3x3 Gaussian elimination with partial pivoting for Ax = b. */
function solve3x3(A: number[][], b: number[]): [number, number, number] | null {
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let r = col + 1; r < 3; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-10) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];

    const div = M[col][col];
    for (let j = col; j <= 3; j++) M[col][j] /= div;

    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      for (let j = col; j <= 3; j++) M[r][j] -= factor * M[col][j];
    }
  }
  return [M[0][3], M[1][3], M[2][3]];
}

export interface GpsIterationStep {
  iter: number;
  pos: Vec2;
  clockBiasUs: number;
  clockBiasMeters: number;
  residualMeters: number;
}

export interface GpsSolution {
  pos: Vec2;
  clockBiasUs: number;
  clockBiasMeters: number;
  iterations: number;
  residualMeters: number;
}

function rmsResidual(
  pos: Vec2,
  biasMeters: number,
  pseudoranges: readonly number[],
  satPositions: readonly Vec2[],
): number {
  let sumSq = 0;
  for (let i = 0; i < 3; i++) {
    const err = pseudoranges[i] - (dist2D(pos, satPositions[i]) + biasMeters);
    sumSq += err * err;
  }
  return Math.sqrt(sumSq / 3);
}

/**
 * Records every Gauss-Newton step from initial guess (bias = 0) to convergence.
 * Lets the interactive canvas animate or single-step the real solver trajectory.
 */
export function solveGps2DTrace(
  pseudoranges: readonly number[],
  initialPos: Vec2 = { x: MAP_W_METERS / 2, y: MAP_H_METERS / 2 },
  satPositions: readonly Vec2[] = SATELLITES.map((s) => s.pos),
): GpsIterationStep[] {
  let x = initialPos.x;
  let y = initialPos.y;
  let biasMeters = 0;

  const trace: GpsIterationStep[] = [
    {
      iter: 0,
      pos: { x, y },
      clockBiasUs: 0,
      clockBiasMeters: 0,
      residualMeters: rmsResidual({ x, y }, 0, pseudoranges, satPositions),
    },
  ];

  for (let iter = 1; iter <= 12; iter++) {
    const J: number[][] = [];
    const r: number[] = [];

    for (let i = 0; i < 3; i++) {
      const sat = satPositions[i];
      const dx = x - sat.x;
      const dy = y - sat.y;
      const d = Math.max(1e-4, Math.hypot(dx, dy));
      const predicted = d + biasMeters;
      J.push([dx / d, dy / d, 1]);
      r.push(pseudoranges[i] - predicted);
    }

    const step = solve3x3(J, r);
    if (!step) break;
    x += step[0];
    y += step[1];
    biasMeters += step[2];

    const res = rmsResidual({ x, y }, biasMeters, pseudoranges, satPositions);
    trace.push({
      iter,
      pos: { x: clamp(x, 0, MAP_W_METERS), y: clamp(y, 0, MAP_H_METERS) },
      clockBiasUs: biasMeters / SPEED_OF_LIGHT_M_PER_US,
      clockBiasMeters: biasMeters,
      residualMeters: res,
    });

    if (Math.hypot(step[0], step[1], step[2]) < 1e-4) break;
  }

  return trace;
}

/**
 * Real iterative Gauss-Newton GPS solver:
 * Recovers receiver (x, y) AND hidden phone clock error (bias) simultaneously from 3 pseudoranges.
 */
export function solveGps2D(
  pseudoranges: readonly number[],
  initialPos: Vec2 = { x: MAP_W_METERS / 2, y: MAP_H_METERS / 2 },
  satPositions: readonly Vec2[] = SATELLITES.map((s) => s.pos),
): GpsSolution {
  const trace = solveGps2DTrace(pseudoranges, initialPos, satPositions);
  const last = trace[trace.length - 1];
  return {
    pos: last.pos,
    clockBiasUs: last.clockBiasUs,
    clockBiasMeters: last.clockBiasMeters,
    iterations: Math.max(1, last.iter),
    residualMeters: last.residualMeters,
  };
}

export interface CovarianceEllipse2D {
  hdop: number;
  gdop: number;
  majorMeters: number;
  minorMeters: number;
  angleRad: number;
}

/**
 * Computes exact 2D DOP metrics AND the true tilted 2D position covariance ellipse
 * from Q = (H^T H)^-1 where H_i = [(x - s_ix)/d_i, (y - s_iy)/d_i, 1].
 * When satellites cluster on one side of the sky, the ellipse elongates perpendicular
 * to the satellite direction, matching the grazing intersection of the noisy rings.
 */
export function computeCovarianceEllipse2D(
  satPositions: readonly Vec2[],
  receiver: Vec2,
  rangeSigmaMeters = 11,
): CovarianceEllipse2D {
  if (satPositions.length < 3) {
    return { hdop: Infinity, gdop: Infinity, majorMeters: Infinity, minorMeters: Infinity, angleRad: 0 };
  }

  const G: number[][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (const sat of satPositions) {
    const dx = receiver.x - sat.x;
    const dy = receiver.y - sat.y;
    const d = Math.max(1e-4, Math.hypot(dx, dy));
    const row = [dx / d, dy / d, 1];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        G[r][c] += row[r] * row[c];
      }
    }
  }

  const col0 = solve3x3(G, [1, 0, 0]);
  const col1 = solve3x3(G, [0, 1, 0]);
  const col2 = solve3x3(G, [0, 0, 1]);
  if (!col0 || !col1 || !col2) {
    return { hdop: 99.9, gdop: 99.9, majorMeters: 450, minorMeters: 45, angleRad: 0 };
  }

  const q00 = Math.max(0, col0[0]);
  const q11 = Math.max(0, col1[1]);
  const q01 = (col0[1] + col1[0]) / 2;
  const q22 = Math.max(0, col2[2]);

  const hdop = Math.min(99.9, Math.sqrt(q00 + q11));
  const gdop = Math.min(99.9, Math.sqrt(q00 + q11 + q22));

  // Closed-form eigenvalues & principal orientation of the symmetric 2x2 position block
  const halfTrace = (q00 + q11) / 2;
  const disc = Math.sqrt(Math.pow((q00 - q11) / 2, 2) + q01 * q01);
  const lambdaMax = Math.max(0, halfTrace + disc);
  const lambdaMin = Math.max(0, halfTrace - disc);
  const angleRad = 0.5 * Math.atan2(2 * q01, q00 - q11);

  return {
    hdop,
    gdop,
    majorMeters: Math.min(500, Math.sqrt(lambdaMax) * rangeSigmaMeters),
    minorMeters: Math.min(500, Math.sqrt(lambdaMin) * rangeSigmaMeters),
    angleRad,
  };
}

/** Exact 2D Horizontal Dilution of Precision (HDOP) from satellite geometry. */
export function computeHdop2D(satPositions: readonly Vec2[], receiver: Vec2): number {
  return computeCovarianceEllipse2D(satPositions, receiver).hdop;
}
