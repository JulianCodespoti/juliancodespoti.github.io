import { describe, expect, it } from "vitest";
import {
  circleIntersections,
  computeCovarianceEllipse2D,
  computeHdop2D,
  dist2D,
  measurePseudoranges,
  SATELLITES,
  solveGps2D,
  solveGps2DTrace,
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

  it("reports low HDOP for spread satellites and high HDOP when clustered on one side", () => {
    const receiver = { x: 500, y: 280 };
    const spreadHdop = computeHdop2D(
      SATELLITES.map((s) => s.pos),
      receiver,
    );
    const clusteredHdop = computeHdop2D(
      [
        { x: 220, y: 90 },
        { x: 310, y: 85 },
        { x: 400, y: 95 },
      ],
      receiver,
    );
    expect(spreadHdop).toBeLessThan(2.0);
    expect(clusteredHdop).toBeGreaterThan(8.0);
  });

  it("elongates the 2D covariance ellipse when satellites cluster on one side", () => {
    const receiver = { x: 490, y: 315 };
    const spread = computeCovarianceEllipse2D(
      SATELLITES.map((s) => s.pos),
      receiver,
    );
    const clustered = computeCovarianceEllipse2D(
      [
        { x: 310, y: 92 },
        { x: 465, y: 80 },
        { x: 620, y: 96 },
      ],
      receiver,
    );
    expect(spread.majorMeters / spread.minorMeters).toBeLessThan(1.6);
    expect(clustered.majorMeters).toBeGreaterThan(spread.majorMeters * 5);
    expect(clustered.majorMeters / clustered.minorMeters).toBeGreaterThan(2.5);
  });

  it("records a converging Gauss-Newton trace from biased initial guess to near-zero residual", () => {
    const trueReceiver = { x: 485, y: 285 };
    const pseudoranges = measurePseudoranges(trueReceiver, 0.32);
    const trace = solveGps2DTrace(pseudoranges, { x: 380, y: 210 });
    expect(trace.length).toBeGreaterThanOrEqual(3);
    expect(trace[0].residualMeters).toBeGreaterThan(50);
    expect(trace[trace.length - 1].residualMeters).toBeLessThan(0.01);
    expect(dist2D(trace[trace.length - 1].pos, trueReceiver)).toBeLessThan(0.01);
  });
});
