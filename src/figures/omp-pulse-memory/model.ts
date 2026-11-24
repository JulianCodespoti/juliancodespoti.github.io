import { clamp, stepSpring, type SpringScalar } from "../../runtime/canvas/math";

/* ==========================================================================
   1. True-Scale Memory Pool Model (14 MB daemon = 1 unit, 281 MB worker = 20)
   ========================================================================== */

export const DAEMON_MB = 14;
export const WORKER_MB = 281;
export const WORKER_UNITS = 20; // 281 / 14 ~= 20.07 -> true 20:1 visual proportion
export const POOL_CAP = 3;

export const DEMO_CHATS = ["Chat 1", "Chat 2", "Chat 3", "Chat 4", "Chat 5"] as const;

export type PoolStrategy = "eager" | "lazy";

export interface WorkerVisual {
  id: number;
  chat: string;
  slot: number;
  scale: SpringScalar;
  flash: number; // 0..1 highlight flash when retargeted or reused
}

export interface MemoryPoolState {
  strategy: PoolStrategy;
  selectedChat: string;
  browsed: string[];
  workers: WorkerVisual[];
  nextId: number;
  retargets: number;
  lastEvent: string;
}

export function createMemoryPool(strategy: PoolStrategy = "lazy"): MemoryPoolState {
  const state: MemoryPoolState = {
    strategy,
    selectedChat: DEMO_CHATS[0],
    browsed: [DEMO_CHATS[0], DEMO_CHATS[1], DEMO_CHATS[2]],
    workers: [],
    nextId: 1,
    retargets: 0,
    lastEvent:
      strategy === "lazy"
        ? "Browsing reads from disk (14 MB). Tap Reply to warm a worker."
        : "Every opened chat boots its own 281 MB worker.",
  };
  syncWorkersForStrategy(state);
  return state;
}

function syncWorkersForStrategy(state: MemoryPoolState) {
  if (state.strategy === "eager") {
    const existingByChat = new Map(state.workers.map((w) => [w.chat, w]));
    state.workers = state.browsed.map((chat, idx) => {
      const prev = existingByChat.get(chat);
      if (prev) {
        prev.slot = idx;
        return prev;
      }
      return {
        id: state.nextId++,
        chat,
        slot: idx,
        scale: { value: 0.2, velocity: 0 },
        flash: 0.7,
      };
    });
  } else {
    // Keep up to POOL_CAP most recent workers, or 0 if switching fresh
    const kept = state.workers.slice(-POOL_CAP);
    kept.forEach((w, idx) => {
      w.slot = idx;
    });
    state.workers = kept;
  }
}

export function setPoolStrategy(state: MemoryPoolState, next: PoolStrategy) {
  if (state.strategy === next) return;
  state.strategy = next;
  if (next === "lazy") {
    // Start lazy mode cleanly with just 0 workers while browsing, so the 20:1 drop is immediate
    state.workers = [];
    state.lastEvent = "Browsing reads directly from disk (14 MB). Tap Reply to warm a worker.";
  } else {
    syncWorkersForStrategy(state);
    state.lastEvent = `Eager mode: ${state.browsed.length} open chats hold ${state.browsed.length} separate 281 MB workers.`;
  }
}

export function openPoolChat(state: MemoryPoolState, chat: string) {
  state.selectedChat = chat;
  if (!state.browsed.includes(chat)) {
    state.browsed = [...state.browsed, chat];
  }
  if (state.strategy === "eager") {
    syncWorkersForStrategy(state);
    const w = state.workers.find((x) => x.chat === chat);
    if (w) w.flash = 0.8;
    state.lastEvent = `Opened "${chat}" and spawned a dedicated 281 MB worker.`;
  } else {
    const existing = state.workers.find((x) => x.chat === chat);
    if (existing) existing.flash = 0.6;
    state.lastEvent = `Reading "${chat}" directly from disk (0 MB extra).`;
  }
}

export function replyInPoolChat(state: MemoryPoolState, chat = state.selectedChat) {
  state.selectedChat = chat;
  if (!state.browsed.includes(chat)) {
    state.browsed = [...state.browsed, chat];
  }
  if (state.strategy === "eager") {
    syncWorkersForStrategy(state);
    return;
  }

  const existing = state.workers.find((w) => w.chat === chat);
  if (existing) {
    existing.flash = 1;
    state.lastEvent = `"${chat}" already has a warm worker ready.`;
    return;
  }

  if (state.workers.length < POOL_CAP) {
    state.workers.push({
      id: state.nextId++,
      chat,
      slot: state.workers.length,
      scale: { value: 0.15, velocity: 0 },
      flash: 0.9,
    });
    state.lastEvent = `Pre-warmed worker slot ${state.workers.length} for "${chat}" as you started typing.`;
    return;
  }

  // LRU retarget: reuse slot 0 in place (59 ms switch_session) and rotate to back
  const reused = state.workers.shift()!;
  const prevChat = reused.chat;
  reused.chat = chat;
  reused.flash = 1;
  state.workers.push(reused);
  state.workers.forEach((w, idx) => {
    w.slot = idx;
  });
  state.retargets += 1;
  state.lastEvent = `Retargeted warm worker from "${prevChat}" to "${chat}" in 59 ms (cap holds at 3).`;
}

export function getPoolTotalMb(state: MemoryPoolState): number {
  return DAEMON_MB + state.workers.length * WORKER_MB;
}

export function stepMemoryPool(state: MemoryPoolState, dt: number) {
  for (const w of state.workers) {
    stepSpring(w.scale, 1, dt, 300, 24);
    w.flash = Math.max(0, w.flash - dt * 1.9);
  }
}

/* ==========================================================================
   2. Real-Time Scaled File Race Model (36.4 ms full scan vs 0.59 ms tail)
   ========================================================================== */

export const FILE_SIZE_MB = 44;
export const FULL_SCAN_MS = 36.4;
export const TAIL_SEEK_MS = 0.59;
export const TAIL_READ_KB = 70;
export const RACE_TIME_SCALE = 60; // 1 ms real = 60 ms visual (36.4 ms -> 2.18 s, 0.59 ms -> 35 ms)

export interface TailRaceState {
  elapsedRealMs: number;
  running: boolean;
}

export function createTailRace(): TailRaceState {
  return { elapsedRealMs: 0, running: true };
}

export function restartTailRace(state: TailRaceState) {
  state.elapsedRealMs = 0;
  state.running = true;
}

export function stepTailRace(state: TailRaceState, dt: number) {
  if (!state.running) return;
  state.elapsedRealMs += (dt * 1000) / RACE_TIME_SCALE;
  if (state.elapsedRealMs >= FULL_SCAN_MS) {
    state.elapsedRealMs = FULL_SCAN_MS;
    state.running = false;
  }
}

export function getTailRaceSnapshot(state: TailRaceState) {
  const fullProgress = clamp(state.elapsedRealMs / FULL_SCAN_MS, 0, 1);
  const tailProgress = clamp(state.elapsedRealMs / TAIL_SEEK_MS, 0, 1);
  return {
    fullProgress,
    tailProgress,
    fullDone: fullProgress >= 1,
    tailDone: tailProgress >= 1,
    fullMs: Math.min(state.elapsedRealMs, FULL_SCAN_MS),
    tailMs: Math.min(state.elapsedRealMs, TAIL_SEEK_MS),
    fullMbRead: fullProgress * FILE_SIZE_MB,
    tailKbRead: tailProgress * TAIL_READ_KB,
  };
}

/* ==========================================================================
   3. Real UTF-16 Common-Prefix Delta Algorithm + Live Wire Particle Sim
   ========================================================================== */

export interface PrefixDelta {
  keep: number; // UTF-16 code units to retain (safe for JS String.prototype.slice)
  append: string;
  fullBytes: number;
  deltaBytes: number;
}

function utf8ByteLength(str: string): number {
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i++; // skip low surrogate
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

/** Exact UTF-16 suffix-replacement delta matching OMP Pulse's server/delta.rs. */
export function computeUtf16Delta(prev: string, next: string): PrefixDelta {
  const maxCommon = Math.min(prev.length, next.length);
  let keep = 0;
  while (keep < maxCommon && prev.charCodeAt(keep) === next.charCodeAt(keep)) {
    keep++;
  }
  // Never split a UTF-16 surrogate pair (e.g., emojis)
  if (keep > 0 && keep < prev.length) {
    const code = prev.charCodeAt(keep - 1);
    if (code >= 0xd800 && code <= 0xdbff) {
      keep--;
    }
  }
  const append = next.slice(keep);
  const fullBytes = 24 + utf8ByteLength(next);
  const deltaBytes = 14 + utf8ByteLength(append);
  return { keep, append, fullBytes, deltaBytes };
}

export function applyUtf16Delta(prev: string, delta: Pick<PrefixDelta, "keep" | "append">): string {
  return prev.slice(0, delta.keep) + delta.append;
}

export interface WirePacket {
  id: number;
  lane: "full" | "delta";
  x: number; // 0..1 across wire
  widthPx: number;
  bytes: number;
  speed: number;
}

export interface DeltaWireSim {
  packets: WirePacket[];
  totalFullBytes: number;
  totalDeltaBytes: number;
  lastDelta: PrefixDelta | null;
  nextId: number;
}

export function createDeltaWireSim(): DeltaWireSim {
  return {
    packets: [],
    totalFullBytes: 0,
    totalDeltaBytes: 0,
    lastDelta: null,
    nextId: 1,
  };
}

export function emitWireUpdate(sim: DeltaWireSim, prev: string, next: string): PrefixDelta {
  const delta = computeUtf16Delta(prev, next);
  sim.lastDelta = delta;
  sim.totalFullBytes += delta.fullBytes;
  sim.totalDeltaBytes += delta.deltaBytes;

  // Map bytes to visible proportional width (capped gently so extreme inputs still fit the wire)
  const fullWidth = clamp(18 + delta.fullBytes * 1.15, 20, 185);
  const deltaWidth = clamp(14 + delta.deltaBytes * 0.45, 16, 46);

  sim.packets.push({
    id: sim.nextId++,
    lane: "full",
    x: 0,
    widthPx: fullWidth,
    bytes: delta.fullBytes,
    speed: 0.92,
  });
  sim.packets.push({
    id: sim.nextId++,
    lane: "delta",
    x: 0,
    widthPx: deltaWidth,
    bytes: delta.deltaBytes,
    speed: 1.18,
  });

  // Cap in-flight particles if user holds down a key rapidly
  if (sim.packets.length > 48) {
    sim.packets.splice(0, sim.packets.length - 48);
  }
  return delta;
}

export function stepDeltaWire(sim: DeltaWireSim, dt: number) {
  for (let i = sim.packets.length - 1; i >= 0; i--) {
    const p = sim.packets[i];
    p.x += p.speed * dt;
    if (p.x >= 1.12) {
      sim.packets.splice(i, 1);
    }
  }
}

/* ==========================================================================
   4. Back-Pressure Particle Pipe Model (Hold-to-Lose-Signal Physics)
   ========================================================================== */

export type BackpressureMode = "clear" | "latch";

export interface PipeParticle {
  id: number;
  phase: "intake" | "bounce" | "drain";
  x: number; // normalized 0..1 within its pipe segment
  yOffset: number;
  opacity: number;
}

export interface BackpressureSim {
  mode: BackpressureMode;
  offline: boolean;
  latched: boolean;
  queueFill: number; // 0..6
  capacity: number;
  overflows: number;
  rssMb: number;
  rssHistory: number[];
  gateAngle: SpringScalar; // -68 (open) to 0 (closed)
  flash: number;
  spawnTimer: number;
  drainTimer: number;
  sparkTimer: number;
  particles: PipeParticle[];
  nextId: number;
}

export function createBackpressureSim(mode: BackpressureMode = "latch"): BackpressureSim {
  return {
    mode,
    offline: false,
    latched: false,
    queueFill: 1,
    capacity: 6,
    overflows: 0,
    rssMb: 14,
    rssHistory: Array.from({ length: 44 }, () => 14),
    gateAngle: { value: -68, velocity: 0 },
    flash: 0,
    spawnTimer: 0,
    drainTimer: 0,
    sparkTimer: 0,
    particles: [],
    nextId: 1,
  };
}

export function resetBackpressureSim(sim: BackpressureSim, mode: BackpressureMode = sim.mode) {
  sim.mode = mode;
  sim.latched = false;
  sim.queueFill = 1;
  sim.overflows = 0;
  sim.rssMb = 14;
  sim.rssHistory = Array.from({ length: 44 }, () => 14);
  sim.gateAngle = { value: -68, velocity: 0 };
  sim.flash = 0;
  sim.particles = [];
}

export function stepBackpressureSim(sim: BackpressureSim, dt: number) {
  // When user releases Hold (back online), unlatch and gradually let RSS settle only in latch mode
  if (!sim.offline && sim.latched) {
    sim.latched = false;
  }

  stepSpring(sim.gateAngle, sim.latched ? 0 : -68, dt, 340, 26);
  sim.flash = Math.max(0, sim.flash - dt * 2.5);

  // Spawn intake chunks continuously from Watcher (slows slightly when latched to show backpressure)
  sim.spawnTimer += dt;
  const spawnInterval = sim.latched ? 0.65 : 0.34;
  if (sim.spawnTimer >= spawnInterval) {
    sim.spawnTimer = 0;
    sim.particles.push({
      id: sim.nextId++,
      phase: "intake",
      x: 0,
      yOffset: 0,
      opacity: 1,
    });
  }

  // Drain buffer to Phone whenever online
  if (!sim.offline && sim.queueFill > 0) {
    sim.drainTimer += dt;
    if (sim.drainTimer >= 0.24) {
      sim.drainTimer = 0;
      sim.queueFill = Math.max(0, sim.queueFill - 1);
      sim.particles.push({
        id: sim.nextId++,
        phase: "drain",
        x: 0,
        yOffset: 0,
        opacity: 1,
      });
    }
  } else {
    sim.drainTimer = 0;
  }

  // Advance particles
  for (let i = sim.particles.length - 1; i >= 0; i--) {
    const p = sim.particles[i];
    if (p.phase === "intake") {
      p.x += dt * 2.1;
      // Hit closed gate at x ~= 0.68
      if (sim.latched && p.x >= 0.66) {
        p.phase = "bounce";
        p.x = 0.66;
        continue;
      }
      if (p.x >= 1) {
        sim.particles.splice(i, 1);
        if (!sim.offline) {
          // Steady streaming pass-through when online
          sim.queueFill = Math.min(2, sim.queueFill + 1);
        } else {
          // Offline: stack into buffer tank
          const next = sim.queueFill + 1;
          if (next >= sim.capacity) {
            sim.overflows += 1;
            sim.flash = 1;
            if (sim.mode === "latch") {
              sim.latched = true;
              sim.queueFill = 1; // holds 1 resync order, gate swings shut
            } else {
              // Clear-only bug: drops to 1 resync, reopens immediately, RSS climbs!
              sim.queueFill = 1;
              sim.rssMb = Math.min(321, sim.rssMb + 42);
            }
          } else {
            sim.queueFill = next;
          }
        }
      }
    } else if (p.phase === "bounce") {
      p.x -= dt * 1.4;
      p.yOffset += dt * 16;
      p.opacity -= dt * 2.4;
      if (p.opacity <= 0) {
        sim.particles.splice(i, 1);
      }
    } else if (p.phase === "drain") {
      p.x += dt * 2.3;
      if (p.x >= 1) {
        sim.particles.splice(i, 1);
      }
    }
  }

  // Record sparkline sample every 120 ms
  sim.sparkTimer += dt;
  if (sim.sparkTimer >= 0.12) {
    sim.sparkTimer = 0;
    sim.rssHistory.push(sim.rssMb);
    if (sim.rssHistory.length > 44) {
      sim.rssHistory.shift();
    }
  }
}
