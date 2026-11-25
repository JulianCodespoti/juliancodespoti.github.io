import { clamp } from "../../runtime/canvas/math";

/* ==========================================================================
   Exact 2D GPS Trilateration & Iterative Gauss-Newton Clock-Bias Solver
   (2D map = 3 unknowns [x, y, clockBias] -> exact analog of 3D GPS [x,y,z,b])
   ========================================================================== */

export const SPEED_OF_LIGHT_M_PER_US = 299.792458; // ~300 meters per microsecond!

export interface Vec2 {
  x: number; // meters
  y: number; // meters
}

// 1000m x 560m local 2D slice with 3 well-spaced satellites (low GDOP)
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
 * Used to highlight the second ambiguous "ghost" solution when only 2 satellites are used.
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

/** Computes measured pseudoranges ρ_i = trueDist_i + clockBiasUs * c. */
export function measurePseudoranges(receiver: Vec2, clockBiasUs: number): number[] {
  const biasMeters = clockBiasUs * SPEED_OF_LIGHT_M_PER_US;
  return SATELLITES.map((s) => Math.max(12, dist2D(receiver, s.pos) + biasMeters));
}

/** Tiny exact 3x3 Gaussian elimination solver for Ax = b. */
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

export interface GpsSolution {
  pos: Vec2;
  clockBiasUs: number;
  clockBiasMeters: number;
  iterations: number;
  residualMeters: number;
}

/**
 * Real iterative Gauss-Newton GPS solver:
 * Recovers receiver (x, y) AND hidden phone clock error (bias) simultaneously from 3 pseudoranges!
 */
export function solveGps2D(
  pseudoranges: readonly number[],
  initialPos: Vec2 = { x: MAP_W_METERS / 2, y: MAP_H_METERS / 2 },
): GpsSolution {
  let x = initialPos.x;
  let y = initialPos.y;
  let biasMeters = 0;
  let iterations = 0;

  for (let iter = 0; iter < 16; iter++) {
    iterations = iter + 1;
    const J: number[][] = [];
    const r: number[] = [];

    for (let i = 0; i < 3; i++) {
      const sat = SATELLITES[i].pos;
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

    if (Math.hypot(step[0], step[1], step[2]) < 1e-5) break;
  }

  let residualSq = 0;
  for (let i = 0; i < 3; i++) {
    const err = pseudoranges[i] - (dist2D({ x, y }, SATELLITES[i].pos) + biasMeters);
    residualSq += err * err;
  }

  return {
    pos: {
      x: clamp(x, 0, MAP_W_METERS),
      y: clamp(y, 0, MAP_H_METERS),
    },
    clockBiasUs: biasMeters / SPEED_OF_LIGHT_M_PER_US,
    clockBiasMeters: biasMeters,
    iterations,
    residualMeters: Math.sqrt(residualSq / 3),
  };
}
