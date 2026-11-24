import { describe, expect, it } from "vitest";
import {
  appendTapeAction,
  computeToolSchemaTax,
  createContextTape,
  createPrefixCacheState,
  getPrefixCacheMetrics,
  getTapeTotals,
  mutatePrefixAt,
  simulateCompaction,
} from "./model";

describe("Context Window Models", () => {
  it("tracks verbose test logs as noise while subagent summaries stay tiny", () => {
    const tape = createContextTape();
    const initial = getTapeTotals(tape);
    expect(initial.noiseRatio).toBe(0);

    appendTapeAction(tape, "logs");
    const afterLogs = getTapeTotals(tape);
    expect(afterLogs.total).toBeGreaterThan(initial.total + 20_000);
    expect(afterLogs.noiseRatio).toBeGreaterThan(0.5);

    const cleanTape = createContextTape();
    appendTapeAction(cleanTape, "subagent");
    const afterSub = getTapeTotals(cleanTape);
    expect(afterSub.total - initial.total).toBe(450);
    expect(afterSub.noiseRatio).toBe(0);
  });

  it("scales tool schema overhead linearly across turns", () => {
    const lean = computeToolSchemaTax(6);
    const bloated = computeToolSchemaTax(50);
    expect(bloated.schemaTokens).toBeGreaterThan(lean.schemaTokens * 8);
    expect(bloated.twentyTurnTokens).toBe(bloated.schemaTokens * 20);
  });

  it("invalidates all downstream blocks when an early prefix block mutates", () => {
    const cache = createPrefixCacheState();
    const tailOnly = getPrefixCacheMetrics(cache);
    expect(tailOnly.hitRate).toBeGreaterThan(0.9);

    mutatePrefixAt(cache, 0);
    const systemMutated = getPrefixCacheMetrics(cache);
    expect(systemMutated.hitRate).toBe(0);
    expect(systemMutated.costCents).toBeGreaterThan(tailOnly.costCents * 5);
  });

  it("proves capping tool outputs beats frequent mid-context summarization on cumulative cost", () => {
    const summarize = simulateCompaction("summarize");
    const capped = simulateCompaction("cap_outputs");

    expect(summarize.some((t) => t.cacheBroken)).toBe(true);
    expect(capped.some((t) => t.cacheBroken)).toBe(false);
    expect(capped.at(-1)!.cumulativeCents).toBeLessThan(summarize.at(-1)!.cumulativeCents);
  });
});
