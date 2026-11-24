import { describe, expect, it } from "vitest";
import {
  applyUtf16Delta,
  computeUtf16Delta,
  createBackpressureSim,
  createDeltaWireSim,
  createMemoryPool,
  createTailRace,
  DAEMON_MB,
  DEMO_CHATS,
  emitWireUpdate,
  FULL_SCAN_MS,
  getPoolTotalMb,
  getTailRaceSnapshot,
  openPoolChat,
  POOL_CAP,
  replyInPoolChat,
  setPoolStrategy,
  stepBackpressureSim,
  stepTailRace,
  TAIL_SEEK_MS,
  WORKER_MB,
} from "./model";

describe("MemoryPoolModel", () => {
  it("keeps browsing at 14 MB in lazy mode and caps workers at 3 via LRU retargeting", () => {
    const pool = createMemoryPool("lazy");
    openPoolChat(pool, DEMO_CHATS[3]);
    openPoolChat(pool, DEMO_CHATS[4]);
    expect(pool.workers.length).toBe(0);
    expect(getPoolTotalMb(pool)).toBe(DAEMON_MB);

    // Reply across 4 distinct chats: should cap at 3 and record 1 retarget
    replyInPoolChat(pool, DEMO_CHATS[0]);
    replyInPoolChat(pool, DEMO_CHATS[1]);
    replyInPoolChat(pool, DEMO_CHATS[2]);
    expect(pool.workers.length).toBe(POOL_CAP);
    expect(getPoolTotalMb(pool)).toBe(DAEMON_MB + POOL_CAP * WORKER_MB);

    replyInPoolChat(pool, DEMO_CHATS[3]);
    expect(pool.workers.length).toBe(POOL_CAP);
    expect(pool.retargets).toBe(1);
    expect(pool.workers.map((w) => w.chat)).toEqual([DEMO_CHATS[1], DEMO_CHATS[2], DEMO_CHATS[3]]);
  });

  it("spawns one worker per opened chat in eager mode", () => {
    const pool = createMemoryPool("lazy");
    openPoolChat(pool, DEMO_CHATS[3]);
    openPoolChat(pool, DEMO_CHATS[4]);
    setPoolStrategy(pool, "eager");
    expect(pool.workers.length).toBe(5);
    expect(getPoolTotalMb(pool)).toBe(DAEMON_MB + 5 * WORKER_MB);
  });
});

describe("TailRaceModel", () => {
  it("finishes tail seek ~62x faster than full scan on the shared scaled clock", () => {
    const race = createTailRace();
    // Advance 0.05s visual -> 0.83 ms real (past 0.59 ms tail, barely started on 36.4 ms full)
    stepTailRace(race, 0.05);
    const early = getTailRaceSnapshot(race);
    expect(early.tailDone).toBe(true);
    expect(early.fullDone).toBe(false);
    expect(early.tailMs).toBeCloseTo(TAIL_SEEK_MS, 2);
    expect(early.fullProgress).toBeLessThan(0.05);

    // Advance 2.5s visual -> well past 2.18s full scan
    stepTailRace(race, 2.5);
    const end = getTailRaceSnapshot(race);
    expect(end.fullDone).toBe(true);
    expect(end.fullMs).toBeCloseTo(FULL_SCAN_MS, 2);
  });
});

describe("computeUtf16Delta & DeltaWireSim", () => {
  it("reconstructs strings identically including trailing edits and emojis without splitting surrogate pairs", () => {
    const samples: [string, string][] = [
      ["", "Hello"],
      ["Hello", "Hello world"],
      ["Hello world   ", "Hello world!"],
      ["Ship 🚀", "Ship 🎉"],
      ["All 9 tests pass ✅", "All 9 tests pass ✅ on arm64"],
    ];

    for (const [prev, next] of samples) {
      const d = computeUtf16Delta(prev, next);
      expect(applyUtf16Delta(prev, d)).toBe(next);
    }

    // Surrogate-pair safety: "Ship 🚀" -> "Ship 🎉" share the high surrogate 0xD83D; must back off cleanly!
    const emojiDelta = computeUtf16Delta("Ship 🚀", "Ship 🎉");
    expect(emojiDelta.keep).toBe(5);
    expect(emojiDelta.append).toBe("🎉");
  });

  it("accumulates dramatically fewer delta bytes than full resends over a streaming turn", () => {
    const sim = createDeltaWireSim();
    const tokens = ["All ", "9 ", "Vitest ", "cases ", "pass ", "cleanly ", "on ", "arm64 ", "in ", "0.59 ms."];
    let text = "";
    for (const t of tokens) {
      const next = text + t;
      emitWireUpdate(sim, text, next);
      text = next;
    }
    expect(sim.totalDeltaBytes).toBeLessThan(sim.totalFullBytes * 0.5);
  });
});

describe("BackpressurePipeSim", () => {
  it("latches closed and keeps RSS flat during an offline burst in latch mode", () => {
    const sim = createBackpressureSim("latch");
    sim.offline = true;
    for (let i = 0; i < 200; i++) {
      stepBackpressureSim(sim, 0.03);
    }
    expect(sim.latched).toBe(true);
    expect(sim.overflows).toBe(1);
    expect(sim.rssMb).toBe(14);

    // Reconnecting unlatches and drains
    sim.offline = false;
    stepBackpressureSim(sim, 0.03);
    expect(sim.latched).toBe(false);
  });

  it("oscillates and climbs RSS repeatedly during an offline burst in clear-only mode", () => {
    const sim = createBackpressureSim("clear");
    sim.offline = true;
    for (let i = 0; i < 250; i++) {
      stepBackpressureSim(sim, 0.03);
    }
    expect(sim.latched).toBe(false);
    expect(sim.overflows).toBeGreaterThan(2);
    expect(sim.rssMb).toBeGreaterThan(100);
  });
});
