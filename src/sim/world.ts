import { BALANCE, NIGHT_LEN } from '../config/balance';

export type Zone = 'sunset' | 'deep' | 'predawn' | 'scorch' | 'dawn';

const L = BALANCE.WORLD_LEN;

/** Wrap a position along the looping y axis into [0, WORLD_LEN). */
export function wrapAlong(y: number): number {
  return ((y % L) + L) % L;
}

/** Where the sunset line is at world time t (it travels toward -y). */
export function sunsetY(t: number): number {
  return wrapAlong(BALANCE.SUN_START_Y - BALANCE.SUN_SPEED * t);
}

/** Distance from the sunset line back toward the dawn, in [0, WORLD_LEN). */
export function behindSunset(y: number, t: number): number {
  return wrapAlong(y - sunsetY(t));
}

export function zoneAt(y: number, t: number): Zone {
  const b = behindSunset(y, t);
  if (b < NIGHT_LEN) {
    if (b < BALANCE.SUNSET_ZONE_FRAC * NIGHT_LEN) return 'sunset';
    if (b < BALANCE.PREDAWN_FRAC * NIGHT_LEN) return 'deep';
    return 'predawn';
  }
  const aheadDepth = L - b;
  const dawnDepth = b - NIGHT_LEN;
  return aheadDepth < dawnDepth ? 'scorch' : 'dawn';
}

/** How far ahead of the sunset line (into the scorching day) y is; 0 elsewhere. */
export function scorchDepth(y: number, t: number): number {
  return zoneAt(y, t) === 'scorch' ? L - behindSunset(y, t) : 0;
}

export function heatDps(y: number, t: number): number {
  if (zoneAt(y, t) !== 'scorch') return 0;
  const depth = scorchDepth(y, t);
  return BALANCE.HEAT_BASE_DPS * (1 + depth / BALANCE.HEAT_RAMP) ** 2;
}

export function secondsUntilDawn(y: number, t: number): number {
  const zone = zoneAt(y, t);
  if (zone === 'scorch') return Infinity;
  if (zone === 'dawn') return 0;
  return Math.max(0, (NIGHT_LEN - behindSunset(y, t)) / BALANCE.SUN_SPEED);
}

/** How many times the sunset line has crossed y during (0, t]. */
export function sunsetsPassed(y: number, t: number): number {
  const d = wrapAlong(BALANCE.SUN_START_Y - y);
  const travelled = BALANCE.SUN_SPEED * t;
  if (travelled < d) return 0;
  return Math.floor((travelled - d) / L) + 1;
}

/** The y' congruent to y (mod WORLD_LEN) that is closest to refY. */
export function nearestCopy(y: number, refY: number): number {
  return y + L * Math.round((refY - y) / L);
}

export function cityPosition(t: number): { x: number; y: number } {
  return {
    x: BALANCE.WORLD_WIDTH / 2,
    y: wrapAlong(sunsetY(t) + BALANCE.CITY_BEHIND_FRAC * NIGHT_LEN),
  };
}
