import { clamp, stepSpring, type SpringScalar } from "../../runtime/canvas/math";

/* ==========================================================================
   1. Handoff Tax Race Model (4-Agent Swarm vs. Single Warm Loop)
   ========================================================================== */

export interface TimelineSegment {
  label: string;
  kind: "work" | "handoff";
  durationSec: number;
}

export const SWARM_SEGMENTS: readonly TimelineSegment[] = [
  { label: "Plan", kind: "work", durationSec: 2.6 },
  { label: "Cold handoff", kind: "handoff", durationSec: 3.1 },
  { label: "Search", kind: "work", durationSec: 3.0 },
  { label: "Cold handoff", kind: "handoff", durationSec: 3.4 },
  { label: "Code", kind: "work", durationSec: 3.6 },
  { label: "Cold handoff", kind: "handoff", durationSec: 3.3 },
  { label: "Review", kind: "work", durationSec: 2.8 },
];

export const SINGLE_SEGMENTS: readonly TimelineSegment[] = [
  { label: "Plan", kind: "work", durationSec: 2.2 },
  { label: "Search", kind: "work", durationSec: 2.5 },
  { label: "Code", kind: "work", durationSec: 3.2 },
  { label: "Verify", kind: "work", durationSec: 2.3 },
];

export const SWARM_TOTAL_SEC = SWARM_SEGMENTS.reduce((a, s) => a + s.durationSec, 0); // 21.8s
export const SINGLE_TOTAL_SEC = SINGLE_SEGMENTS.reduce((a, s) => a + s.durationSec, 0); // 10.2s
export const SWARM_TOKENS_K = 118;
export const SINGLE_TOKENS_K = 34;

export interface HandoffRaceState {
  elapsedSec: number;
  running: boolean;
}

export function createHandoffRace(): HandoffRaceState {
  return { elapsedSec: 0, running: true };
}

export function restartHandoffRace(state: HandoffRaceState) {
  state.elapsedSec = 0;
  state.running = true;
}

export function stepHandoffRace(state: HandoffRaceState, dt: number) {
  if (!state.running) return;
  // 5x compressed real-time clock so the 21.8s vs 10.2s race plays in ~4.3s vs ~2.0s
  state.elapsedSec += dt * 5.0;
  if (state.elapsedSec >= SWARM_TOTAL_SEC) {
    state.elapsedSec = SWARM_TOTAL_SEC;
    state.running = false;
  }
}

export function getHandoffRaceSnapshot(state: HandoffRaceState) {
  const swarmTime = Math.min(state.elapsedSec, SWARM_TOTAL_SEC);
  const singleTime = Math.min(state.elapsedSec, SINGLE_TOTAL_SEC);
  return {
    swarmTime,
    singleTime,
    swarmProgress: clamp(swarmTime / SWARM_TOTAL_SEC, 0, 1),
    singleProgress: clamp(singleTime / SINGLE_TOTAL_SEC, 0, 1),
    swarmDone: swarmTime >= SWARM_TOTAL_SEC,
    singleDone: singleTime >= SINGLE_TOTAL_SEC,
    swarmTokensK: Math.round((swarmTime / SWARM_TOTAL_SEC) * SWARM_TOKENS_K),
    singleTokensK: Math.round((singleTime / SINGLE_TOTAL_SEC) * SINGLE_TOKENS_K),
  };
}

/* ==========================================================================
   2. Disposable Subagent Context Hygiene Model (60fps particle transfer)
   ========================================================================== */

export type HygieneMode = "inline" | "subagent";

export interface HygieneParticle {
  id: number;
  x: number; // 0..1 along active path
  route: "to_main" | "to_sub" | "summary_to_main";
  size: number;
}

export interface ContextHygieneState {
  mode: HygieneMode;
  stepTimer: number;
  emittedChunks: number; // 0..4 noisy repo search chunks
  mainTokensK: SpringScalar;
  subTokensK: SpringScalar;
  subAlive: SpringScalar; // 0..1 visibility of temporary subagent
  summarySent: boolean;
  done: boolean;
  particles: HygieneParticle[];
  nextId: number;
}

export function createContextHygiene(mode: HygieneMode = "subagent"): ContextHygieneState {
  return {
    mode,
    stepTimer: 0,
    emittedChunks: 0,
    mainTokensK: { value: 8, velocity: 0 },
    subTokensK: { value: 0, velocity: 0 },
    subAlive: { value: mode === "subagent" ? 1 : 0, velocity: 0 },
    summarySent: false,
    done: false,
    particles: [],
    nextId: 1,
  };
}

export function resetContextHygiene(state: ContextHygieneState, mode: HygieneMode = state.mode) {
  const fresh = createContextHygiene(mode);
  Object.assign(state, fresh);
}

export function stepContextHygiene(state: ContextHygieneState, dt: number) {
  const targetMain =
    state.mode === "inline"
      ? 8 + state.emittedChunks * 10
      : state.summarySent
        ? 8.4
        : 8;
  const targetSub =
    state.mode === "subagent" && !state.done
      ? state.emittedChunks * 10
      : 0;
  const targetAlive = state.mode === "subagent" && !state.done ? 1 : 0;

  stepSpring(state.mainTokensK, targetMain, dt, 220, 24);
  stepSpring(state.subTokensK, targetSub, dt, 220, 24);
  stepSpring(state.subAlive, targetAlive, dt, 180, 22);

  // Emit 4 noisy 10K-token search chunks
  if (state.emittedChunks < 4) {
    state.stepTimer += dt;
    if (state.stepTimer >= 0.48) {
      state.stepTimer = 0;
      state.emittedChunks += 1;
      state.particles.push({
        id: state.nextId++,
        x: 0,
        route: state.mode === "inline" ? "to_main" : "to_sub",
        size: 7.5,
      });
    }
  } else if (state.mode === "subagent" && !state.summarySent && state.particles.length === 0) {
    state.stepTimer += dt;
    if (state.stepTimer >= 0.35) {
      state.summarySent = true;
      state.particles.push({
        id: state.nextId++,
        x: 0,
        route: "summary_to_main",
        size: 4.5,
      });
    }
  } else if (state.mode === "subagent" && state.summarySent && state.particles.length === 0 && !state.done) {
    state.done = true;
  } else if (state.mode === "inline" && state.emittedChunks >= 4 && state.particles.length === 0) {
    state.done = true;
  }

  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.x += dt * 1.9;
    if (p.x >= 1) {
      state.particles.splice(i, 1);
    }
  }
}

/* ==========================================================================
   3. Error Compounding / Telephone Game Model
   ========================================================================== */

export interface ChainReliability {
  stepFidelity: number; // 0.75 .. 0.99
  hops: number;
  unverifiedSurvival: number; // p^hops
  verifiedSurvival: number; // fresh independent verifier catches 84% of residual errors
  stageSurvival: number[]; // per-hop survival curve
}

export function computeChainReliability(stepFidelity: number, hops = 5): ChainReliability {
  const p = clamp(stepFidelity, 0.5, 0.999);
  const stageSurvival: number[] = [];
  for (let i = 1; i <= hops; i++) {
    stageSurvival.push(Math.pow(p, i));
  }
  const unverifiedSurvival = stageSurvival[stageSurvival.length - 1];
  // An independent fresh-context verifier catches ~84% of errors missed by the writer's own context
  const verifierCatchRate = 0.84;
  const verifiedSurvival = 1 - (1 - unverifiedSurvival) * (1 - verifierCatchRate);

  return {
    stepFidelity: p,
    hops,
    unverifiedSurvival,
    verifiedSurvival,
    stageSurvival,
  };
}

/* ==========================================================================
   4. Topology Comparison Sandbox Model
   ========================================================================== */

export type TopologyKind = "single" | "swarm" | "dispatcher";

export interface TopologySpec {
  id: TopologyKind;
  name: string;
  costMultiplier: number;
  latencyMultiplier: number;
  contextCleanliness: number; // 0..100
  summary: string;
}

export const TOPOLOGIES: Record<TopologyKind, TopologySpec> = {
  single: {
    id: "single",
    name: "Single loop",
    costMultiplier: 1.0,
    latencyMultiplier: 1.0,
    contextCleanliness: 68,
    summary: "Fastest and cheapest on focused tasks. Context only gets noisy on huge codebase sweeps.",
  },
  swarm: {
    id: "swarm",
    name: "4-agent role swarm",
    costMultiplier: 3.5,
    latencyMultiplier: 2.1,
    contextCleanliness: 52,
    summary: "Pays cold-cache prefill and handoff drift at every role boundary without shared state.",
  },
  dispatcher: {
    id: "dispatcher",
    name: "Dispatcher + subagents + verifier",
    costMultiplier: 1.35,
    latencyMultiplier: 1.15,
    contextCleanliness: 94,
    summary: "One main owner keeps the cache warm, delegates noisy reads to disposable subagents, and verifies fresh.",
  },
};
