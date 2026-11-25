import { describe, expect, it } from "vitest";
import {
  decodeFloat16,
  encodeFloat16,
  inspectOctaveGap,
  toggleFloat16Bit,
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
});
