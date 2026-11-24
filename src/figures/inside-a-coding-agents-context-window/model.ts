import { clamp, stepSpring, type SpringScalar } from "../../runtime/canvas/math";

/* ==========================================================================
   1. Proportional Context Tape Model (0 .. 200K token window)
   ========================================================================== */

export const CONTEXT_WINDOW_TOKENS = 200_000;
export const UNCACHED_USD_PER_M = 3.0;
export const CACHED_USD_PER_M = 0.3;

export type SegmentKind = "system" | "tools" | "files" | "logs" | "chat";

export interface TapeSegment {
  id: number;
  kind: SegmentKind;
  label: string;
  tokens: number;
  animWidth: SpringScalar;
}

export interface ContextTapeState {
  segments: TapeSegment[];
  nextId: number;
  lastEvent: string;
}

export function createContextTape(): ContextTapeState {
  return {
    nextId: 5,
    lastEvent: "Start of a session: system prompt, 8 tools, and 2 user turns.",
    segments: [
      { id: 1, kind: "system", label: "System", tokens: 3_200, animWidth: { value: 3_200, velocity: 0 } },
      { id: 2, kind: "tools", label: "Tools", tokens: 3_600, animWidth: { value: 3_600, velocity: 0 } },
      { id: 3, kind: "files", label: "File read", tokens: 4_800, animWidth: { value: 4_800, velocity: 0 } },
      { id: 4, kind: "chat", label: "Chat", tokens: 1_900, animWidth: { value: 1_900, velocity: 0 } },
    ],
  };
}

export function getTapeTotals(state: ContextTapeState) {
  let total = 0;
  let noise = 0;
  for (const s of state.segments) {
    total += s.tokens;
    if (s.kind === "logs") noise += s.tokens;
  }
  const usedRatio = clamp(total / CONTEXT_WINDOW_TOKENS, 0, 1);
  const noiseRatio = total > 0 ? noise / total : 0;
  const turnCostUsd = (total / 1_000_000) * UNCACHED_USD_PER_M;
  return { total, noise, usedRatio, noiseRatio, turnCostUsd };
}

export function appendTapeAction(state: ContextTapeState, action: "file" | "logs" | "subagent") {
  const { total } = getTapeTotals(state);
  const remaining = Math.max(0, CONTEXT_WINDOW_TOKENS - total);
  if (remaining < 400) {
    state.lastEvent = "Context window is full (200K tokens). Reset to experiment again.";
    return;
  }

  if (action === "file") {
    const tokens = Math.min(4_500, remaining);
    state.segments.push({
      id: state.nextId++,
      kind: "files",
      label: "File read",
      tokens,
      animWidth: { value: 0, velocity: 0 },
    });
    state.lastEvent = `Read a source file (+${(tokens / 1000).toFixed(1)}K tokens).`;
  } else if (action === "logs") {
    const tokens = Math.min(22_000, remaining);
    state.segments.push({
      id: state.nextId++,
      kind: "logs",
      label: "Verbose test log",
      tokens,
      animWidth: { value: 0, velocity: 0 },
    });
    state.lastEvent = `Dumped raw test output into history (+${(tokens / 1000).toFixed(0)}K tokens of mostly noise).`;
  } else {
    const tokens = Math.min(450, remaining);
    state.segments.push({
      id: state.nextId++,
      kind: "chat",
      label: "Subagent summary",
      tokens,
      animWidth: { value: 0, velocity: 0 },
    });
    state.lastEvent = "Subagent scanned 12 files in an isolated window and returned a 450-token summary.";
  }
}

export function stepContextTape(state: ContextTapeState, dt: number) {
  for (const s of state.segments) {
    stepSpring(s.animWidth, s.tokens, dt, 260, 26);
  }
}

/* ==========================================================================
   2. Tool Schema Tax Model (4 .. 60 attached tools)
   ========================================================================== */

export const TOKENS_PER_TOOL = 450;

export interface ToolTaxStats {
  toolCount: number;
  schemaTokens: number;
  shareOfWindow: number;
  twentyTurnTokens: number;
}

export function computeToolSchemaTax(toolCount: number): ToolTaxStats {
  const count = clamp(Math.round(toolCount), 1, 80);
  const schemaTokens = count * TOKENS_PER_TOOL;
  return {
    toolCount: count,
    schemaTokens,
    shareOfWindow: schemaTokens / CONTEXT_WINDOW_TOKENS,
    twentyTurnTokens: schemaTokens * 20,
  };
}

/* ==========================================================================
   3. Prefix Cache Invalidation Model (Click any block to mutate)
   ========================================================================== */

export interface PrefixBlock {
  label: string;
  tokens: number;
}

export const PREFIX_BLOCKS: readonly PrefixBlock[] = [
  { label: "System", tokens: 3_500 },
  { label: "Tools", tokens: 6_500 },
  { label: "Turn 1", tokens: 9_000 },
  { label: "Turn 2", tokens: 12_000 },
  { label: "Turn 3", tokens: 14_000 },
  { label: "New turn", tokens: 3_000 },
] as const;

export interface PrefixCacheState {
  mutatedFrom: number; // index of earliest changed block (0..PREFIX_BLOCKS.length - 1)
  sweep: number; // 0..1 prefill animation sweep over recomputed tail
  reason: string;
}

export function createPrefixCacheState(): PrefixCacheState {
  return {
    mutatedFrom: PREFIX_BLOCKS.length - 1,
    sweep: 1,
    reason: "Appended new turn cleanly: first 5 blocks stay cached (94% cache hit).",
  };
}

export function mutatePrefixAt(state: PrefixCacheState, index: number, customReason?: string) {
  const idx = clamp(index, 0, PREFIX_BLOCKS.length - 1);
  state.mutatedFrom = idx;
  state.sweep = 0;

  if (customReason) {
    state.reason = customReason;
  } else if (idx === 0) {
    state.reason = "Mutated System prompt (e.g. live timestamp): 0% cache hit, full recompute.";
  } else if (idx === 1) {
    state.reason = "Added or reordered a tool schema: everything after System misses cache.";
  } else if (idx === PREFIX_BLOCKS.length - 1) {
    state.reason = "Appended to the tail only: entire prior prefix stays cached (10x cheaper).";
  } else {
    state.reason = `Edited ${PREFIX_BLOCKS[idx].label}: every block from here onward must be recomputed.`;
  }
}

export function getPrefixCacheMetrics(state: PrefixCacheState) {
  let cachedTokens = 0;
  let recomputedTokens = 0;
  PREFIX_BLOCKS.forEach((b, i) => {
    if (i < state.mutatedFrom) cachedTokens += b.tokens;
    else recomputedTokens += b.tokens;
  });
  const total = cachedTokens + recomputedTokens;
  const hitRate = total > 0 ? cachedTokens / total : 0;
  const costCents =
    ((cachedTokens / 1_000_000) * CACHED_USD_PER_M + (recomputedTokens / 1_000_000) * UNCACHED_USD_PER_M) * 100;
  const naiveCents = (total / 1_000_000) * UNCACHED_USD_PER_M * 100;
  return { cachedTokens, recomputedTokens, total, hitRate, costCents, naiveCents };
}

export function stepPrefixCache(state: PrefixCacheState, dt: number) {
  if (state.sweep < 1) {
    // Recomputing more tokens visibly takes proportionally longer!
    const { recomputedTokens, total } = getPrefixCacheMetrics(state);
    const duration = 0.25 + (recomputedTokens / total) * 1.15;
    state.sweep = clamp(state.sweep + dt / duration, 0, 1);
  }
}

/* ==========================================================================
   4. Compaction Strategy Comparison (Summarize Middle vs. Cap Tool Output)
   ========================================================================== */

export type CompactionStrategy = "summarize" | "cap_outputs";

export interface CompactionTurnPoint {
  turn: number;
  cachedRatio: number;
  turnCostCents: number;
  cumulativeCents: number;
  cacheBroken: boolean;
}

/** Deterministic 14-turn simulation comparing periodic summarization vs immutable prefix + capped tool outputs. */
export function simulateCompaction(strategy: CompactionStrategy): CompactionTurnPoint[] {
  const out: CompactionTurnPoint[] = [];
  let prefixTokens = 10_000; // system + tools
  let cumulative = 0;

  for (let turn = 1; turn <= 14; turn++) {
    const newTokens = strategy === "cap_outputs" ? 2_800 : 8_500;
    let cacheBroken = false;
    let cachedTokens = 0;
    let uncachedTokens = 0;

    if (strategy === "summarize" && turn > 1 && turn % 4 === 0) {
      // Periodic summarization rewrites history from the middle -> invalidates the whole downstream prefix!
      cacheBroken = true;
      prefixTokens = Math.round(prefixTokens * 0.45) + 4_500;
      cachedTokens = 10_000; // only system+tools survive
      uncachedTokens = Math.max(2_000, prefixTokens - cachedTokens) + newTokens;
    } else if (turn === 1) {
      uncachedTokens = prefixTokens + newTokens;
    } else {
      cachedTokens = prefixTokens;
      uncachedTokens = newTokens;
    }

    const turnCostCents =
      ((cachedTokens / 1_000_000) * CACHED_USD_PER_M + (uncachedTokens / 1_000_000) * UNCACHED_USD_PER_M) * 100;
    cumulative += turnCostCents;
    const total = cachedTokens + uncachedTokens;

    out.push({
      turn,
      cachedRatio: total > 0 ? cachedTokens / total : 0,
      turnCostCents,
      cumulativeCents: cumulative,
      cacheBroken,
    });

    prefixTokens += newTokens;
  }

  return out;
}
