import { clamp } from "../../runtime/canvas/math";

/* ==========================================================================
   1. Real-Shaped Coding Session Anatomy (Hover/Scrub + Live Log Crop)
   ========================================================================== */

export type SliceCategory = "system" | "tools" | "user" | "code" | "logs";

export interface SessionSlice {
  id: string;
  label: string;
  category: SliceCategory;
  tokens: number;
  preview: string;
}

export const SESSION_SLICES: readonly SessionSlice[] = [
  { id: "sys", label: "System prompt", category: "system", tokens: 3_100, preview: "Role instructions, repo rules, formatting guidelines" },
  { id: "tools", label: "8 tool schemas", category: "tools", tokens: 3_600, preview: "JSON schemas for read, edit, write, grep, find, bash" },
  { id: "u1", label: "User prompt #1", category: "user", tokens: 180, preview: "\"Fix the slow-consumer RSS spike in ws.rs\"" },
  { id: "f1", label: "Read ws.rs", category: "code", tokens: 5_400, preview: "src/server/ws.rs (lines 1..420)" },
  { id: "f2", label: "Read delta.rs", category: "code", tokens: 4_900, preview: "src/server/delta.rs (lines 1..360)" },
  { id: "g1", label: "grep queue", category: "logs", tokens: 3_200, preview: "84 matches across src/ and tests/" },
  { id: "t1", label: "cargo test (uncropped failure)", category: "logs", tokens: 19_800, preview: "Full backtraces + 480 lines of verbose tokio debug output" },
  { id: "e1", label: "Edit ws.rs", category: "code", tokens: 850, preview: "Add stalled AtomicBool latch + resync_if_full()" },
  { id: "t2", label: "cargo test (pass)", category: "logs", tokens: 620, preview: "test result: ok. 105 passed; 0 failed" },
  { id: "f3", label: "Read perf test", category: "code", tokens: 4_100, preview: "bench/mem.py slow-consumer fixture" },
  { id: "u2", label: "User prompt #2", category: "user", tokens: 120, preview: "\"Also park the watcher when the phone screen locks\"" },
  { id: "e2", label: "Edit watcher.rs", category: "code", tokens: 1_330, preview: "Wire WsHub::has_audience() wake hook" },
] as const;

export const SESSION_TOTAL_TOKENS = SESSION_SLICES.reduce((acc, s) => acc + s.tokens, 0);

export function getSessionSlices(croppedLogs: boolean): SessionSlice[] {
  if (!croppedLogs) return SESSION_SLICES.map((s) => ({ ...s }));
  return SESSION_SLICES.map((s) =>
    s.id === "t1"
      ? {
          ...s,
          label: "cargo test (capped 120 lines)",
          tokens: 1_400,
          preview: "Head + tail summary (360 noisy middle lines omitted; full log on disk)",
        }
      : { ...s },
  );
}

/* ==========================================================================
   2. Causal Attention Dependency Model (Why Prefix Caching Breaks Left->Right)
   ========================================================================== */

export interface CausalBlock {
  label: string;
  shortLabel: string;
  tokensK: number;
}

export const CAUSAL_BLOCKS: readonly CausalBlock[] = [
  { label: "System", shortLabel: "Sys", tokensK: 3 },
  { label: "Tools", shortLabel: "Tools", tokensK: 6 },
  { label: "Turn 1", shortLabel: "T1", tokensK: 8 },
  { label: "Turn 2", shortLabel: "T2", tokensK: 11 },
  { label: "Turn 3", shortLabel: "T3", tokensK: 13 },
  { label: "Turn 4", shortLabel: "T4", tokensK: 4 },
] as const;

export interface CausalCacheState {
  editedIndex: number;
  ripple: number;
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
    state.ripple = clamp(state.ripple + dt * 2.2, 0, 1);
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
  const costCents = (cachedK * 0.03 + recomputedK * 0.3) / 10;
  const fullCostCents = (totalK * 0.3) / 10;
  const bestCostCents = ((totalK - CAUSAL_BLOCKS[CAUSAL_BLOCKS.length - 1].tokensK) * 0.03 + CAUSAL_BLOCKS[CAUSAL_BLOCKS.length - 1].tokensK * 0.3) / 10;
  return { cachedK, recomputedK, totalK, hitRate, costCents, fullCostCents, bestCostCents };
}

/* ==========================================================================
   3. 2D Quadratic Turn x Token Triangle Model (O(N^2) vs O(N) vs Compaction)
   ========================================================================== */

export type TriangleMode = "uncached" | "cached" | "summarize";
export type CellState = "cached" | "new" | "miss";

export interface TriangleRow {
  turn: number;
  cells: CellState[];
  cachedK: number;
  fullK: number;
  turnCostCents: number;
}

export const CELL_TOKENS_K = 2;
export const TRIANGLE_TURNS = 12;

export function buildTurnTriangle(mode: TriangleMode): {
  rows: TriangleRow[];
  totalTokensK: number;
  totalCostCents: number;
  uncachedCells: number;
  cachedCells: number;
} {
  const rows: TriangleRow[] = [];
  let prefixCells = 3;
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
      if (turn === 1) {
        for (let i = 0; i < prefixCells + 1; i++) cells.push("new");
        prefixCells += 1;
      } else if (turn % 4 === 0) {
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

    const turnCostCents = rowCached * 0.06 + rowFull * 0.6;
    totalCostCents += turnCostCents;
    rows.push({
      turn,
      cells,
      cachedK: rowCached * CELL_TOKENS_K,
      fullK: rowFull * CELL_TOKENS_K,
      turnCostCents,
    });
  }

  return {
    rows,
    totalTokensK: (cachedCells + uncachedCells) * CELL_TOKENS_K,
    totalCostCents,
    uncachedCells,
    cachedCells,
  };
}

/* ==========================================================================
   4. Harness Configuration Budget Model (20-turn compound cost sandbox)
   ========================================================================== */

export interface HarnessConfig {
  staticSystem: boolean;
  leanTools: boolean;
  capLogs: boolean;
}

export interface HarnessBudgetResult {
  finalContextK: number;
  totalInputK: number;
  cachedHitRate: number;
  totalCostUsd: number;
  turnCostsUsd: number[];
  turnCachedCostsUsd: number[];
  turnUncachedCostsUsd: number[];
}

export function simulateHarness20Turns(cfg: HarnessConfig): HarnessBudgetResult {
  const turns = 20;
  const sysK = 3.1;
  const toolsK = cfg.leanTools ? 3.6 : 20.25;
  const perTurnGrowthK = cfg.capLogs ? 1.8 : 5.4;

  let prefixK = sysK + toolsK;
  let totalCachedK = 0;
  let totalUncachedK = 0;
  let totalCostUsd = 0;
  const turnCostsUsd: number[] = [];
  const turnCachedCostsUsd: number[] = [];
  const turnUncachedCostsUsd: number[] = [];

  for (let t = 1; t <= turns; t++) {
    const newK = perTurnGrowthK;
    let cachedK = 0;
    let uncachedK = 0;

    if (!cfg.staticSystem || t === 1) {
      uncachedK = prefixK + newK;
    } else {
      cachedK = prefixK;
      uncachedK = newK;
    }

    const cachedUsd = (cachedK * 0.3) / 1_000;
    const uncachedUsd = (uncachedK * 3.0) / 1_000;
    const turnUsd = cachedUsd + uncachedUsd;
    totalCachedK += cachedK;
    totalUncachedK += uncachedK;
    totalCostUsd += turnUsd;
    turnCachedCostsUsd.push(cachedUsd);
    turnUncachedCostsUsd.push(uncachedUsd);
    turnCostsUsd.push(turnUsd);
    prefixK += newK;
  }

  const totalInputK = totalCachedK + totalUncachedK;
  return {
    finalContextK: prefixK,
    totalInputK,
    cachedHitRate: totalInputK > 0 ? totalCachedK / totalInputK : 0,
    totalCostUsd,
    turnCostsUsd,
    turnCachedCostsUsd,
    turnUncachedCostsUsd,
  };
}
