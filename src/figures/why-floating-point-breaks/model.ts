import { clamp } from "../../runtime/canvas/math";

/* ==========================================================================
   1. Exact IEEE 754 binary16 (Half-Precision) Bit Decoder & Encoder
   ========================================================================== */

export interface Float16Decoded {
  bits: number; // 0..0xffff
  sign: 0 | 1;
  expRaw: number; // 0..31
  mantissaRaw: number; // 0..1023
  exponent: number; // unbiased exponent (-14..15)
  kind: "zero" | "subnormal" | "normal" | "infinity" | "nan";
  value: number;
  ulp: number; // gap to next representable float16
  mantissaFrac: number; // mantissaRaw / 1024
  bitArray: (0 | 1)[]; // length 16, MSB first [15..0]
}

export function decodeFloat16(rawBits: number): Float16Decoded {
  const bits = rawBits & 0xffff;
  const sign = ((bits >>> 15) & 1) as 0 | 1;
  const expRaw = (bits >>> 10) & 0x1f;
  const mantissaRaw = bits & 0x3ff;
  const mantissaFrac = mantissaRaw / 1024;
  const signMul = sign === 1 ? -1 : 1;

  const bitArray: (0 | 1)[] = [];
  for (let i = 15; i >= 0; i--) {
    bitArray.push(((bits >>> i) & 1) as 0 | 1);
  }

  if (expRaw === 0) {
    if (mantissaRaw === 0) {
      return {
        bits,
        sign,
        expRaw,
        mantissaRaw,
        exponent: -14,
        kind: "zero",
        value: sign === 1 ? -0 : 0,
        ulp: Math.pow(2, -24),
        mantissaFrac,
        bitArray,
      };
    }
    return {
      bits,
      sign,
      expRaw,
      mantissaRaw,
      exponent: -14,
      kind: "subnormal",
      value: signMul * Math.pow(2, -14) * mantissaFrac,
      ulp: Math.pow(2, -24),
      mantissaFrac,
      bitArray,
    };
  }

  if (expRaw === 31) {
    if (mantissaRaw === 0) {
      return {
        bits,
        sign,
        expRaw,
        mantissaRaw,
        exponent: 16,
        kind: "infinity",
        value: signMul * Infinity,
        ulp: Infinity,
        mantissaFrac,
        bitArray,
      };
    }
    return {
      bits,
      sign,
      expRaw,
      mantissaRaw,
      exponent: 16,
      kind: "nan",
      value: NaN,
      ulp: NaN,
      mantissaFrac,
      bitArray,
    };
  }

  const exponent = expRaw - 15;
  const value = signMul * Math.pow(2, exponent) * (1 + mantissaFrac);
  const ulp = Math.pow(2, exponent - 10);

  return {
    bits,
    sign,
    expRaw,
    mantissaRaw,
    exponent,
    kind: "normal",
    value,
    ulp,
    mantissaFrac,
    bitArray,
  };
}

/** Round-to-nearest-even IEEE 754 binary16 encoder. */
export function encodeFloat16(input: number): number {
  if (Number.isNaN(input)) return 0x7e00;
  const sign = Object.is(input, -0) || input < 0 ? 1 : 0;
  const abs = Math.abs(input);
  if (abs === 0) return sign << 15;
  if (!Number.isFinite(abs) || abs >= 65520) return (sign << 15) | (31 << 10);

  // Subnormal range (< 2^-14)
  if (abs < Math.pow(2, -14)) {
    const scaled = abs / Math.pow(2, -24);
    const mant = roundToNearestEven(scaled);
    if (mant >= 1024) return (sign << 15) | (1 << 10);
    return (sign << 15) | mant;
  }

  const exp = Math.floor(Math.log2(abs));
  const expRaw = exp + 15;
  const sig = (abs / Math.pow(2, exp) - 1) * 1024;
  let mant = roundToNearestEven(sig);
  let finalExpRaw = expRaw;
  if (mant >= 1024) {
    mant = 0;
    finalExpRaw += 1;
    if (finalExpRaw >= 31) return (sign << 15) | (31 << 10);
  }
  return (sign << 15) | (finalExpRaw << 10) | mant;
}

function roundToNearestEven(x: number): number {
  const floor = Math.floor(x);
  const frac = x - floor;
  if (frac > 0.5) return floor + 1;
  if (frac < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

export function toggleFloat16Bit(bits: number, bitIndexMsbFirst: number): number {
  const shift = 15 - clamp(bitIndexMsbFirst, 0, 15);
  return (bits ^ (1 << shift)) & 0xffff;
}

export const FLOAT16_PRESETS = [
  { label: "0.1", bits: encodeFloat16(0.1) }, // 0x2e66 -> 0.0999755859375 (repeating 1001100110)
  { label: "0.2", bits: encodeFloat16(0.2) }, // 0x3266 -> 0.199951171875
  { label: "1.0", bits: encodeFloat16(1.0) }, // 0x3c00
  { label: "2048", bits: encodeFloat16(2048) }, // 0x6800 (ulp = 2 -> 2048 + 1 === 2048!)
  { label: "NaN", bits: 0x7e00 },
] as const;

export function formatFloat16Value(d: Float16Decoded): string {
  if (d.kind === "nan") return "NaN";
  if (d.kind === "infinity") return d.sign === 1 ? "-Infinity" : "+Infinity";
  if (d.kind === "zero") return d.sign === 1 ? "-0" : "0";
  if (Math.abs(d.value) >= 100) return d.value.toLocaleString("en-US", { maximumFractionDigits: 4 });
  if (Math.abs(d.value) >= 0.001) return Number(d.value.toPrecision(7)).toString();
  return d.value.toExponential(4);
}

/* ==========================================================================
   2. Doubling-Gap Number Line Model (Why x + 1 === x in float16 & float32)
   ========================================================================== */

export interface OctaveGapInfo {
  octave: number; // k in [7..13] -> x = 2^k (128 .. 8192 in float16)
  x: number;
  leftGap: number; // gap just below 2^k
  rightGap: number; // gap at and above 2^k (exact 2x of leftGap!)
  addOneResult: number; // actual float16(x + 1)
  stuck: boolean; // true when float16(x + 1) === x!
}

export function inspectOctaveGap(octave: number): OctaveGapInfo {
  const k = clamp(Math.round(octave), 7, 13);
  const x = Math.pow(2, k);
  const rightGap = Math.pow(2, k - 10);
  const leftGap = rightGap / 2;
  const addOneBits = encodeFloat16(x + 1);
  const addOneResult = decodeFloat16(addOneBits).value;
  return {
    octave: k,
    x,
    leftGap,
    rightGap,
    addOneResult,
    stuck: addOneResult === x,
  };
}
