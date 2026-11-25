import { describe, expect, it } from "vitest";
import {
  circleIntersections,
  dist2D,
  measurePseudoranges,
  SATELLITES,
  solveGps2D,
  SPEED_OF_LIGHT_M_PER_US,
} from "./model";

describe("2D GPS Trilateration & Clock-Drift Solver", () => {
  it("finds two ambiguous intersections for 2 satellites, one matching true position", () => {
    const receiver = { x: 470, y: 265 };
    const r1 = dist2D(receiver, SATELLITES[0].pos);
    const r2 = dist2D(receiver, SATELLITES[1].pos);
    const pts = circleIntersections(SATELLITES[0].pos, r1, SATELLITES[1].pos, r2);
    expect(pts.length).toBe(2);
    const minErr = Math.min(...pts.map((p) => dist2D(p, receiver)));
    expect(minErr).toBeLessThan(1e-3);
  });

  it("recovers exact receiver position AND hidden phone clock drift from biased pseudoranges", () => {
    const trueReceiver = { x: 440, y: 270 };
    const trueBiasUs = 0.42; // +125.9 meters of clock error on every single satellite ring!
    const pseudoranges = measurePseudoranges(trueReceiver, trueBiasUs);

    const solved = solveGps2D(pseudoranges);
    expect(dist2D(solved.pos, trueReceiver)).toBeLessThan(0.01);
    expect(solved.clockBiasUs).toBeCloseTo(trueBiasUs, 4);
    expect(solved.clockBiasMeters).toBeCloseTo(trueBiasUs * SPEED_OF_LIGHT_M_PER_US, 2);
    expect(solved.residualMeters).toBeLessThan(0.01);
  });

  it("handles negative clock drift cleanly as well", () => {
    const trueReceiver = { x: 560, y: 295 };
    const trueBiasUs = -0.35;
    const pseudoranges = measurePseudoranges(trueReceiver, trueBiasUs);

    const solved = solveGps2D(pseudoranges);
    expect(dist2D(solved.pos, trueReceiver)).toBeLessThan(0.01);
    expect(solved.clockBiasUs).toBeCloseTo(trueBiasUs, 4);
  });
});
