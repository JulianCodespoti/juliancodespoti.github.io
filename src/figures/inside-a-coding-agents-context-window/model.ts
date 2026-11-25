import { clamp } from "../../runtime/canvas/math";

/* ==========================================================================
   1. Causal Attention Dependency Model (Why Prefix Caching Breaks Left->Right)
   ========================================================================== */

export interface CausalBlock {
  label: string;
  tokensK: number;
}

export const CAUSAL_BLOCKS: readonly CausalBlock[] = [
  { label: "System", tokensK: 3 },
  { label: "Tools", tokensK: 6 },
  { label: "Turn 1", tokensK: 8 },
  { label: "Turn 2", tokensK: 11 },
  { label: "Turn 3", tokensK: 13 },
  { label: "Turn 4", tokensK: 4 },
] as const;

export interface CausalCacheState {
  editedIndex: number; // 0..CAUSAL_BLOCKS.length - 1
  ripple: number; // 0..1 wave traveling strictly rightward along causal arcs
}

export function createCausalCache(initialIndex = 1): CausalCacheState {
  return { editedIndex: initialIndex, ripple: 1 };
}

export function editCausalBlock(state: CausalCacheState, index: number) {
  const next = clamp(index, 0, CAUSAL_BLOCKS.length - 1);
  state.editedIndex = next;
  state.ripple = 0;
}

export function stepCausalCache(state: CausalCacheState, dt: number) {
  if (state.ripple < 1) {
    state.ripple = clamp(state.ripple + dt * 2.1, 0, 1);
  }
}

export function getCausalCacheStats(state: CausalCacheState) {
  let cachedK = 0;
  let recomputedK = 0;
  CAUSAL_BLOCKS.forEach((b, i) => {
    if (i < state.editedIndex) cachedK += b.tokensK;
    else recomputedK += b.tokensK;
  });
  const totalK = cachedK + recomputedK;
  const hitRate = totalK > 0 ? cachedK / totalK : 0;
  // Standard 10:1 uncached vs cached pricing ($3/M vs $0.30/M)
  const costCents = (cachedK * 0.03 + recomputedK * 0.3) / 10;
  const fullCostCents = (totalK * 0.3) / 10;
  return { cachedK, recomputedK, totalK, hitRate, costCents, fullCostCents };
}

/* ==========================================================================
   2. 2D Quadratic Turn x Token Triangle Model (O(N^2) vs O(N) vs Compaction)
   ========================================================================== */

export type TriangleMode = "uncached" | "cached" | "summarize";

export type CellState = "cached" | "new" | "miss";

export interface TriangleRow {
  turn: number;
  cells: CellState[]; // each cell = 2K tokens
  turnCostCents: number;
}

export const CELL_TOKENS_K = 2;
export const TRIANGLE_TURNS = 12;

/**
 * Generates a 12-turn coding session where each square = 2K tokens.
 * Prefix starts at 3 cells (6K: system + tools) and each turn adds 1 new cell (2K).
 */
export function buildTurnTriangle(mode: TriangleMode): {
  rows: TriangleRow[];
  totalTokensK: number;
  totalCostCents: number;
  uncachedCells: number;
  cachedCells: number;
} {
  const rows: TriangleRow[] = [];
  let prefixCells = 3; // 6K system + tools
  let totalCostCents = 0;
  let uncachedCells = 0;
  let cachedCells = 0;

  for (let turn = 1; turn <= TRIANGLE_TURNS; turn++) {
    const cells: CellState[] = [];

    if (mode === "uncached") {
      for (let i = 0; i < prefixCells + 1; i++) cells.push("new");
      prefixCells += 1;
    } else if (mode === "cached") {
      if (turn === 1) {
        for (let i = 0; i < prefixCells + 1; i++) cells.push("new");
      } else {
        for (let i = 0; i < prefixCells; i++) cells.push("cached");
        cells.push("new");
      }
      prefixCells += 1;
    } else {
      // Summarize every 4 turns: shrinks middle history by ~3 cells, but rewrites the prefix -> full cache miss!
      if (turn === 1) {
        for (let i = 0; i < prefixCells + 1; i++) cells.push("new");
        prefixCells += 1;
      } else if (turn % 4 === 0) {
        // System+tools (3 cells) survive, compressed summary + remaining history (smaller row) must all recompute!
        const shrunkHistory = Math.max(2, Math.round((prefixCells - 3) * 0.55) + 1);
        for (let i = 0; i < 3; i++) cells.push("cached");
        for (let i = 0; i < shrunkHistory + 1; i++) cells.push("miss");
        prefixCells = 3 + shrunkHistory + 1;
      } else {
        for (let i = 0; i < prefixCells; i++) cells.push("cached");
        cells.push("new");
        prefixCells += 1;
      }
    }

    let rowCached = 0;
    let rowFull = 0;
    for (const c of cells) {
      if (c === "cached") rowCached++;
      else rowFull++;
    }

    cachedCells += rowCached;
    uncachedCells += rowFull;

    // 1 cell = 2K tokens: $0.30/M cached = 0.06c per cell; $3.00/M uncached = 0.60c per cell
    const turnCostCents = rowCached * 0.06 + rowFull * 0.6;
    totalCostCents += turnCostCents;
    rows.push({ turn, cells, turnCostCents });
  }

  return {
    rows,
    totalTokensK: (cachedCells + uncachedCells) * CELL_TOKENS_K,
    totalCostCents,
    uncachedCells,
    cachedCells,
  };
}
