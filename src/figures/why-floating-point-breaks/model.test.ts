import { describe, expect, it } from "vitest";
import {
  decodeFloat16,
  encodeFloat16,
  formatHex16,
  inspectOctaveGap,
  snapFloat16Offset,
  stepFloat16Ulp,
  toggleFloat16Bit,
  traceFloat16Addition,
} from "./model";

describe("IEEE 754 binary16 model", () => {
  it("encodes and decodes exact reference values including 0.1 repeating mantissa and special values", () => {
    const one = decodeFloat16(encodeFloat16(1.0));
    expect(one.bits).toBe(0x3c00);
    expect(one.value).toBe(1);
    expect(one.ulp).toBeCloseTo(1 / 1024, 10);

    // 0.1 in binary16 cannot be exact: nearest is 0x2e66 = 0.0999755859375
    const tenth = decodeFloat16(encodeFloat16(0.1));
    expect(tenth.bits).toBe(0x2e66);
    expect(tenth.value).toBeCloseTo(0.0999755859375, 12);
    expect(tenth.value).not.toBe(0.1);

    // Flipping sign bit negates cleanly
    const negOne = decodeFloat16(toggleFloat16Bit(0x3c00, 0));
    expect(negOne.value).toBe(-1);

    expect(decodeFloat16(0x7c00).kind).toBe("infinity");
    expect(decodeFloat16(0x7e00).kind).toBe("nan");
  });

  it("proves 2048 + 1 rounds back to 2048 in binary16 when ULP reaches 2.0", () => {
    const at1024 = inspectOctaveGap(10);
    expect(at1024.x).toBe(1024);
    expect(at1024.rightGap).toBe(1);
    expect(at1024.addOneResult).toBe(1025);
    expect(at1024.stuck).toBe(false);

    const at2048 = inspectOctaveGap(11);
    expect(at2048.x).toBe(2048);
    expect(at2048.leftGap).toBe(1);
    expect(at2048.rightGap).toBe(2);
    expect(at2048.addOneResult).toBe(2048);
    expect(at2048.stuck).toBe(true);

    const at4096 = inspectOctaveGap(12);
    expect(at4096.rightGap).toBe(4);
    expect(at4096.stuck).toBe(true);
  });

  it("traces exponent alignment and dropped bits for 0.1 + 0.2, 1.0 + 0.5, and 2048 + 1", () => {
    const tenthPlusFifth = traceFloat16Addition(0.1, 0.2, "0.1 + 0.2");
    expect(tenthPlusFifth.shift).toBe(1);
    expect(tenthPlusFifth.lostBits).toBe(true);
    expect(tenthPlusFifth.resultValue).not.toBe(0.3);

    const exact = traceFloat16Addition(1.0, 0.5, "1.0 + 0.5");
    expect(exact.resultValue).toBe(1.5);
    expect(exact.lostBits).toBe(false);

    const stuck = traceFloat16Addition(2048, 1, "2048 + 1");
    expect(stuck.shift).toBe(11);
    expect(stuck.smallAlignedKept.every((b) => b === null)).toBe(true);
    expect(stuck.resultValue).toBe(2048);
  });

  it("steps exactly +/- 1 ULP across positive, negative, zero, and large values", () => {
    const b01 = encodeFloat16(0.1);
    expect(formatHex16(b01)).toBe("0x2e66");
    const next01 = decodeFloat16(stepFloat16Ulp(b01, 1));
    expect(next01.value).toBeGreaterThan(0.1);
    expect(next01.value - decodeFloat16(b01).value).toBeCloseTo(decodeFloat16(b01).ulp, 12);

    const b2048 = encodeFloat16(2048);
    expect(decodeFloat16(stepFloat16Ulp(b2048, 1)).value).toBe(2050);
    expect(decodeFloat16(stepFloat16Ulp(b2048, -1)).value).toBe(2047);

    // Crosses zero cleanly and preserves NaN
    expect(stepFloat16Ulp(0x0000, -1)).toBe(0x8001);
    expect(stepFloat16Ulp(0x8001, 1)).toBe(0x0000);
    expect(stepFloat16Ulp(0x7e00, 1)).toBe(0x7e00);
  });

  it("snaps arbitrary offsets around 2^11 using round-to-nearest-even", () => {
    expect(snapFloat16Offset(11, 1).snapped).toBe(2048);
    expect(snapFloat16Offset(11, 1).stuck).toBe(true);
    expect(snapFloat16Offset(11, 1.25).snapped).toBe(2050);
    expect(snapFloat16Offset(11, 1.25).stuck).toBe(false);
  });
});
