/** Arcade top-down handling. Heading 0 faces +x; -PI/2 faces up the screen (toward the sunset). */
export interface Kinematics {
  x: number;
  y: number;
  heading: number;
  vx: number;
  vy: number;
}

export interface DriveInput {
  /** -1 (brake, then reverse) .. 1 (full throttle). */
  throttle: number;
  /** -1 (left) .. 1 (right). */
  steer: number;
}

export interface DriveStats {
  topSpeed: number;
  accel: number;
}

export interface DriveEnv {
  /** True where the rig cannot go (cliffs, the city's hull). */
  blocked(x: number, y: number): boolean;
  /** 0..1 fraction of top speed the ground allows. */
  terrainSpeed(x: number, y: number): number;
}

/** Radians per second at full steering and full speed. */
export const TURN_RATE = 2.6;
/** How quickly sideways motion dies out; lower is driftier. */
export const GRIP = 6;
/** Coasting drag per second when off the throttle. */
export const DRAG = 1.2;
/** Reverse top speed as a fraction of the forward cap. */
export const REVERSE_FRACTION = 0.4;
/** Below this forward speed (px/s) steering fades out. */
const STEER_FULL_SPEED = 30;

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

export const speedOf = (k: Kinematics): number => Math.hypot(k.vx, k.vy);

/** Signed speed along the heading (negative when reversing). */
export const forwardSpeed = (k: Kinematics): number => k.vx * Math.cos(k.heading) + k.vy * Math.sin(k.heading);

export function stepDriving(
  k: Kinematics,
  input: DriveInput,
  dt: number,
  stats: DriveStats,
  env: DriveEnv,
): Kinematics {
  if (!(dt > 0)) return k;
  const throttle = clamp(input.throttle, -1, 1);
  const steer = clamp(input.steer, -1, 1);

  // Steering needs forward motion, and flips when reversing.
  const fwd0 = forwardSpeed(k);
  const turnScale = clamp(Math.abs(fwd0) / STEER_FULL_SPEED, 0, 1) * (fwd0 < 0 ? -1 : 1);
  const heading = k.heading + steer * TURN_RATE * turnScale * dt;

  const dx = Math.cos(heading);
  const dy = Math.sin(heading);
  let f = k.vx * dx + k.vy * dy; // along the heading
  let l = -k.vx * dy + k.vy * dx; // sideways

  const cap = stats.topSpeed * clamp(env.terrainSpeed(k.x, k.y), 0, 1);
  if (throttle !== 0) {
    const target = throttle > 0 ? throttle * cap : throttle * REVERSE_FRACTION * cap;
    const rate = (throttle < 0 && f > 0 ? 2 : 1) * stats.accel * dt;
    f += clamp(target - f, -rate, rate);
  } else {
    f *= Math.exp(-DRAG * dt);
    if (f > cap) f = Math.max(cap, f - stats.accel * dt);
  }
  l *= Math.exp(-GRIP * dt);

  const vx = dx * f - dy * l;
  const vy = dy * f + dx * l;
  const nx = k.x + vx * dt;
  const ny = k.y + vy * dt;
  if (env.blocked(nx, ny)) return { x: k.x, y: k.y, heading, vx: vx * 0.5, vy: vy * 0.5 };
  return { x: nx, y: ny, heading, vx, vy };
}
