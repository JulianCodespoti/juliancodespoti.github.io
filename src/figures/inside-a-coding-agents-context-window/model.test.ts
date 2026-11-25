import { describe, expect, it } from "vitest";
import {
  buildTurnTriangle,
  CAUSAL_BLOCKS,
  createCausalCache,
  editCausalBlock,
  getCausalCacheStats,
} from "./model";

describe("Context Window Models", () => {
  it("invalidates only blocks at or after the edited token while preserving left prefix", () => {
    const state = createCausalCache(CAUSAL_BLOCKS.length - 1);
    const tailEdit = getCausalCacheStats(state);
    expect(tailEdit.hitRate).toBeGreaterThan(0.9);

    editCausalBlock(state, 1); // edit Tools
    const toolsEdit = getCausalCacheStats(state);
    expect(toolsEdit.cachedK).toBe(CAUSAL_BLOCKS[0].tokensK); // only System survives
    expect(toolsEdit.costCents).toBeGreaterThan(tailEdit.costCents * 3);

    editCausalBlock(state, 0); // edit System
    const sysEdit = getCausalCacheStats(state);
    expect(sysEdit.hitRate).toBe(0);
  });

  it("shows prefix caching slashes quadratic turn cost and frequent summarization costs more than staying cached", () => {
    const uncached = buildTurnTriangle("uncached");
    const cached = buildTurnTriangle("cached");
    const summarize = buildTurnTriangle("summarize");

    // Prefix caching turns O(N^2) uncached cost into a tiny fraction
    expect(cached.totalCostCents).toBeLessThan(uncached.totalCostCents * 0.25);

    // Frequent mid-session summarization breaks cache on turns 4, 8, 12 -> costs MORE than staying cached!
    expect(summarize.totalCostCents).toBeGreaterThan(cached.totalCostCents);
    expect(summarize.rows[3].cells.includes("miss")).toBe(true);
    expect(summarize.rows[7].cells.includes("miss")).toBe(true);
    expect(cached.rows.every((r) => !r.cells.includes("miss"))).toBe(true);
  });
});
