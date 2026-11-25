import { describe, expect, it } from "vitest";
import {
  buildTurnTriangle,
  CAUSAL_BLOCKS,
  createCausalCache,
  editCausalBlock,
  getCausalCacheStats,
  SESSION_SLICES,
  SESSION_TOTAL_TOKENS,
  simulateHarness20Turns,
} from "./model";

describe("Context Window Models", () => {
  it("shows user prompts are a tiny fraction of a real coding session while uncropped logs dominate", () => {
    const userTokens = SESSION_SLICES.filter((s) => s.category === "user").reduce((a, s) => a + s.tokens, 0);
    const logTokens = SESSION_SLICES.filter((s) => s.category === "logs").reduce((a, s) => a + s.tokens, 0);
    expect(userTokens / SESSION_TOTAL_TOKENS).toBeLessThan(0.02);
    expect(logTokens / SESSION_TOTAL_TOKENS).toBeGreaterThan(0.45);
  });

  it("invalidates only blocks at or after the edited token while preserving left prefix", () => {
    const state = createCausalCache(CAUSAL_BLOCKS.length - 1);
    const tailEdit = getCausalCacheStats(state);
    expect(tailEdit.hitRate).toBeGreaterThan(0.9);

    editCausalBlock(state, 1);
    const toolsEdit = getCausalCacheStats(state);
    expect(toolsEdit.cachedK).toBe(CAUSAL_BLOCKS[0].tokensK);
    expect(toolsEdit.costCents).toBeGreaterThan(tailEdit.costCents * 3);

    editCausalBlock(state, 0);
    expect(getCausalCacheStats(state).hitRate).toBe(0);
  });

  it("shows prefix caching slashes quadratic turn cost and frequent summarization costs more than staying cached", () => {
    const uncached = buildTurnTriangle("uncached");
    const cached = buildTurnTriangle("cached");
    const summarize = buildTurnTriangle("summarize");

    expect(cached.totalCostCents).toBeLessThan(uncached.totalCostCents * 0.25);
    expect(summarize.totalCostCents).toBeGreaterThan(cached.totalCostCents);
  });

  it("proves combining static system prompt, lean tools, and log capping cuts 20-turn cost over 10x", () => {
    const lean = simulateHarness20Turns({ staticSystem: true, leanTools: true, capLogs: true });
    const sloppy = simulateHarness20Turns({ staticSystem: false, leanTools: false, capLogs: false });

    expect(lean.cachedHitRate).toBeGreaterThan(0.8);
    expect(sloppy.cachedHitRate).toBe(0);
    expect(lean.totalCostUsd).toBeGreaterThan(0.15);
    expect(sloppy.totalCostUsd).toBeGreaterThan(3.0);
    expect(sloppy.totalCostUsd).toBeGreaterThan(lean.totalCostUsd * 12);
  });
});
