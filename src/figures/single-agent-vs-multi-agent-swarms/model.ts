import { clamp, stepSpring, type SpringScalar } from "../../runtime/canvas/math";

/* ==========================================================================
   1. Warm Staircase vs. Cold Mountains (8-turn task: Single vs. 4-Agent Swarm)
   ========================================================================== */

export type HandoffMode = "single" | "swarm";
export type StairCell = "cached" | "new" | "cold";

export interface StairRow {
  turn: number;
  owner: string;
  isHandoff: boolean;
  cells: StairCell[]; // 1 square = 2K tokens
  turnCostCents: number;
}

export const TASK_TURNS = 8;

const SWARM_OWNERS = [
  "Planner",
  "Planner",
  "Researcher",
  "Researcher",
  "Coder",
  "Coder",
  "Reviewer",
  "Reviewer",
] as const;

/**
 * Models the exact same 8-turn coding task under one continuous agent vs. 4 role agents.
 * Single agent keeps one unbroken prefix cache across all 8 turns.
 * 4-agent swarm starts cold at turns 1, 3, 5, 7 (new system prompt + handoff brief + re-reading files).
 */
export function buildHandoffStaircase(mode: HandoffMode): {
  rows: StairRow[];
  totalCostCents: number;
  coldPrefillK: number;
  cachedK: number;
} {
  const rows: StairRow[] = [];
  let totalCostCents = 0;
  let coldCells = 0;
  let cachedCells = 0;
  let newCells = 0;

  if (mode === "single") {
    let prefix = 3; // 6K system + tools
    for (let turn = 1; turn <= TASK_TURNS; turn++) {
      const cells: StairCell[] = [];
      if (turn === 1) {
        for (let i = 0; i < prefix + 2; i++) cells.push("cold");
        coldCells += prefix + 2;
      } else {
        for (let i = 0; i < prefix; i++) cells.push("cached");
        cells.push("new");
        cachedCells += prefix;
        newCells += 1;
      }
      prefix += turn === 1 ? 2 : 1;
      const turnCostCents =
        cells.filter((c) => c === "cached").length * 0.06 +
        cells.filter((c) => c !== "cached").length * 0.6;
      totalCostCents += turnCostCents;
      rows.push({ turn, owner: "Agent", isHandoff: false, cells, turnCostCents });
    }
  } else {
    // 4-agent swarm: turns 1, 3, 5, 7 are cold handoffs (new system prompt + brief + re-reading files!)
    let agentLocalPrefix = 0;
    for (let turn = 1; turn <= TASK_TURNS; turn++) {
      const owner = SWARM_OWNERS[turn - 1];
      const isHandoff = turn % 2 === 1;
      const cells: StairCell[] = [];

      if (isHandoff) {
        // Each later agent carries a slightly heavier handoff summary + re-reads shared files cold
        const coldSize = 5 + Math.floor(turn / 2) * 2; // 5, 7, 9, 11 cells cold!
        for (let i = 0; i < coldSize; i++) cells.push("cold");
        coldCells += coldSize;
        agentLocalPrefix = coldSize;
      } else {
        // Second turn inside the same role hits its own local cache + adds 2 cells of work
        for (let i = 0; i < agentLocalPrefix; i++) cells.push("cached");
        cells.push("new", "new");
        cachedCells += agentLocalPrefix;
        newCells += 2;
      }

      const turnCostCents =
        cells.filter((c) => c === "cached").length * 0.06 +
        cells.filter((c) => c !== "cached").length * 0.6;
      totalCostCents += turnCostCents;
      rows.push({ turn, owner, isHandoff: isHandoff && turn > 1, cells, turnCostCents });
    }
  }

  return {
    rows,
    totalCostCents,
    coldPrefillK: (coldCells + newCells) * 2,
    cachedK: cachedCells * 2,
  };
}

/* ==========================================================================
   2. Attention Dilution & Disposable Subagent Extraction (Needle Field)
   ========================================================================== */

export type NeedleMode = "inline" | "subagent";

export const SPEC_CELLS = 8; // Original task spec & key code lines (sage)
export const ANSWER_CELLS = 4; // The 4 relevant code lines discovered by searching (teal)
export const NOISE_CELLS = 76; // Raw grep output & unrelated file reads (dull noise)

export interface NeedleSimState {
  mode: NeedleMode;
  progress: number; // 0..1 animation progress
  subSandboxAlpha: SpringScalar; // fades out cleanly once 4 answers are handed back
}

export function createNeedleSim(mode: NeedleMode = "subagent"): NeedleSimState {
  return {
    mode,
    progress: 0,
    subSandboxAlpha: { value: mode === "subagent" ? 1 : 0, velocity: 0 },
  };
}

export function resetNeedleSim(state: NeedleSimState, mode: NeedleMode = state.mode) {
  state.mode = mode;
  state.progress = 0;
  state.subSandboxAlpha = { value: mode === "subagent" ? 1 : 0, velocity: 0 };
}

export function stepNeedleSim(state: NeedleSimState, dt: number) {
  if (state.progress < 1) {
    state.progress = clamp(state.progress + dt * 0.42, 0, 1);
  }
  const targetAlpha = state.mode === "subagent" && state.progress < 0.82 ? 1 : 0;
  stepSpring(state.subSandboxAlpha, targetAlpha, dt, 180, 22);
}

export function getNeedleSignalRatio(state: NeedleSimState): {
  mainTotalCells: number;
  signalCells: number;
  signalPct: number;
} {
  if (state.mode === "inline") {
    const addedNoise = Math.round(clamp(state.progress / 0.75, 0, 1) * NOISE_CELLS);
    const addedAnswers = Math.round(clamp(state.progress / 0.75, 0, 1) * ANSWER_CELLS);
    const signalCells = SPEC_CELLS + addedAnswers;
    const mainTotalCells = signalCells + addedNoise;
    return {
      mainTotalCells,
      signalCells,
      signalPct: Math.round((signalCells / mainTotalCells) * 100),
    };
  } else {
    const deliveredAnswers = state.progress >= 0.72 ? ANSWER_CELLS : 0;
    const signalCells = SPEC_CELLS + deliveredAnswers;
    return {
      mainTotalCells: signalCells,
      signalCells,
      signalPct: 100,
    };
  }
}
