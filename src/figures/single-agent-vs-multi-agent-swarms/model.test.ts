import { describe, expect, it } from "vitest";
import {
  computeChainReliability,
  createContextHygiene,
  createHandoffRace,
  getHandoffRaceSnapshot,
  SINGLE_TOKENS_K,
  SINGLE_TOTAL_SEC,
  stepContextHygiene,
  stepHandoffRace,
  SWARM_TOKENS_K,
  SWARM_TOTAL_SEC,
  TOPOLOGIES,
} from "./model";

describe("Single vs Multi-Agent Models", () => {
  it("shows single warm loop finishes over 2x faster and uses under one-third the tokens of a 4-agent swarm", () => {
    const race = createHandoffRace();
    // Advance 2.2s visual -> 11.0s simulated (past single's 10.2s, mid-way through swarm's 21.8s)
    stepHandoffRace(race, 2.2);
    const mid = getHandoffRaceSnapshot(race);
    expect(mid.singleDone).toBe(true);
    expect(mid.swarmDone).toBe(false);
    expect(SINGLE_TOTAL_SEC * 2).toBeLessThan(SWARM_TOTAL_SEC);
    expect(SINGLE_TOKENS_K * 3).toBeLessThan(SWARM_TOKENS_K);
  });

  it("isolates 40K noisy search tokens inside a disposable subagent and hands back 0.4K to main", () => {
    const inline = createContextHygiene("inline");
    const sub = createContextHygiene("subagent");

    for (let i = 0; i < 160; i++) {
      stepContextHygiene(inline, 0.04);
      stepContextHygiene(sub, 0.04);
    }

    expect(inline.done).toBe(true);
    expect(sub.done).toBe(true);
    expect(inline.mainTokensK.value).toBeGreaterThan(45);
    expect(sub.mainTokensK.value).toBeLessThan(10);
    expect(sub.subAlive.value).toBeLessThan(0.05); // subagent evaporated after returning summary
  });

  it("compounds error steeply across 5 unverified hops and recovers with a fresh verifier", () => {
    const rel = computeChainReliability(0.88, 5);
    expect(rel.unverifiedSurvival).toBeCloseTo(Math.pow(0.88, 5), 4);
    expect(rel.unverifiedSurvival).toBeLessThan(0.55);
    expect(rel.verifiedSurvival).toBeGreaterThan(0.9);
  });

  it("models dispatcher + verifier as cleaner than single loop and far cheaper than a role swarm", () => {
    expect(TOPOLOGIES.dispatcher.contextCleanliness).toBeGreaterThan(TOPOLOGIES.single.contextCleanliness);
    expect(TOPOLOGIES.dispatcher.costMultiplier).toBeLessThan(TOPOLOGIES.swarm.costMultiplier * 0.5);
  });
});
