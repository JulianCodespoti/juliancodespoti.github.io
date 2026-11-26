export interface SpringScalar {
  value: number;
  velocity: number;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function easeOutCubic(t: number): number {
  const u = 1 - clamp(t, 0, 1);
  return 1 - u * u * u;
}

/** Wrap an angular difference into [-PI, PI] for shortest-path rotation. */
export function wrapAngleDiff(target: number, current: number): number {
  let diff = (target - current) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

/** Smooth spring integration for 60fps Canvas 2D motion. */
export function stepSpring(
  s: SpringScalar,
  target: number,
  dt: number,
  stiffness = 260,
  damping = 26,
): number {
  if (dt <= 0) return s.value;
  const accel = (target - s.value) * stiffness - s.velocity * damping;
  s.velocity += accel * dt;
  s.value += s.velocity * dt;
  if (Math.abs(target - s.value) < 0.001 && Math.abs(s.velocity) < 0.01) {
    s.value = target;
    s.velocity = 0;
  }
  return s.value;
}

/** Damped spring for angles in radians with shortest-arc wrapping. */
export function stepAngularSpring(
  s: SpringScalar,
  target: number,
  dt: number,
  stiffness = 220,
  damping = 18,
): number {
  if (dt <= 0) return s.value;
  const diff = wrapAngleDiff(target, s.value);
  const accel = diff * stiffness - s.velocity * damping;
  s.velocity += accel * dt;
  s.value += s.velocity * dt;
  return s.value;
}
