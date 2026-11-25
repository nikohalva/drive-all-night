/**
 * Collector escorts fan out into side lanes so they sweep fresh ground instead of the strip
 * the lead has just emptied. A lane position is derived from the lead's path every frame, so
 * a collector can never get stuck: where the ground is blocked it simply tucks back in.
 */
import type { Follower } from './convoy';

/** Half-width of an escort's body, kept clear of obstacles. */
const BODY = 8;
/** Side by side, two escorts need at least this much room. */
const ESCORT_GAP = 26;
/** Closer to the column than this is not worth leaving it for. */
const MIN_OFFSET = 10;
/** How fast a collector swings back out once the ground opens up, px/s. */
const EASE_SPEED = 60;

/**
 * Signed sideways offsets (positive = right of travel) for collectors with these sweep radii:
 * alternating sides, far enough out that no two sweeps or bodies overlap.
 */
export function collectorLanes(bodyGap: number, leadRadius: number, radii: readonly number[]): number[] {
  const last: ({ off: number; r: number } | null)[] = [null, null];
  return radii.map((r, i) => {
    const side = i % 2;
    const prev = last[side];
    const off = prev ? prev.off + Math.max(ESCORT_GAP, prev.r + r) : Math.max(bodyGap, leadRadius + r);
    last[side] = { off, r };
    return side === 0 ? off : -off;
  });
}

/** The point `offset` px to the side of a convoy position. */
export function offsetSpot(f: Follower, offset: number): { x: number; y: number } {
  return { x: f.x - Math.sin(f.heading) * offset, y: f.y + Math.cos(f.heading) * offset };
}

/** How much of the wanted offset is open ground, walking outward from the column. */
export function clearOffset(f: Follower, want: number, blocked: (x: number, y: number) => boolean): number {
  const side = Math.sign(want);
  const reach = Math.abs(want);
  for (let d = 0; d <= reach + BODY; d += 2) {
    const p = offsetSpot(f, side * d);
    if (!blocked(p.x, p.y)) continue;
    const room = Math.min(reach, d - BODY - 2);
    return room >= MIN_OFFSET ? side * room : 0;
  }
  return want;
}

/** Tuck in at once; swing out gradually. Changing sides goes through the column. */
export function easeOffset(current: number, allowed: number, dt: number): number {
  if (current !== 0 && Math.sign(current) !== Math.sign(allowed)) return 0;
  if (Math.abs(allowed) <= Math.abs(current)) return allowed;
  const step = Math.min(EASE_SPEED * dt, Math.abs(allowed) - Math.abs(current));
  return current + Math.sign(allowed) * step;
}
