import { describe, expect, it } from "vitest";
import {
  ANSWER_CELLS,
  buildHandoffStaircase,
  createNeedleSim,
  getNeedleSignalRatio,
  SPEC_CELLS,
  stepNeedleSim,
} from "./model";

describe("Single vs Multi-Agent Models", () => {
  it("shows a 4-agent role swarm burns over 2.5x the cost and uncached prefill of a single warm agent", () => {
    const single = buildHandoffStaircase("single");
    const swarm = buildHandoffStaircase("swarm");

    expect(swarm.totalCostCents).toBeGreaterThan(single.totalCostCents * 2.2);
    expect(swarm.coldPrefillK).toBeGreaterThan(single.coldPrefillK * 2.5);
    expect(single.rows.every((r) => !r.isHandoff)).toBe(true);
    expect(swarm.rows.filter((r) => r.isHandoff).length).toBe(3);
  });

  it("shows inline repo search buries signal under noise while a disposable subagent preserves 100% signal", () => {
    const inline = createNeedleSim("inline");
    const sub = createNeedleSim("subagent");

    for (let i = 0; i < 120; i++) {
      stepNeedleSim(inline, 0.03);
      stepNeedleSim(sub, 0.03);
    }

    const inlineStats = getNeedleSignalRatio(inline);
    const subStats = getNeedleSignalRatio(sub);

    expect(inlineStats.signalPct).toBeLessThan(20);
    expect(subStats.signalPct).toBe(100);
    expect(subStats.signalCells).toBe(SPEC_CELLS + ANSWER_CELLS);
    expect(sub.subSandboxAlpha.value).toBeLessThan(0.05);
  });
});
