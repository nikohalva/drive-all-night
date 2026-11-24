import { BALANCE, NIGHT_LEN } from '../config/balance';
import { CITIES, CITY_BY_ID, START_CITY, type CityId } from '../config/cities';

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

/** Where city `id` is at world time t (it keeps its distance behind the sunset line). */
export function cityPos(id: CityId, t: number): { id: CityId; x: number; y: number } {
  const def = CITY_BY_ID[id];
  return { id, x: def.laneX, y: wrapAlong(sunsetY(t) + def.behindFrac * NIGHT_LEN) };
}

export function cityPositions(t: number): { id: CityId; x: number; y: number }[] {
  return CITIES.map((c) => cityPos(c.id, t));
}

/** The city closest to (x, y), measured through the wrap; y is the copy nearest the point. */
export function nearestCity(x: number, y: number, t: number): { id: CityId; x: number; y: number } {
  let best = cityPositions(t)[0];
  let bestD = Infinity;
  for (const c of cityPositions(t)) {
    const cy = nearestCopy(c.y, y);
    const d = Math.hypot(c.x - x, cy - y);
    if (d < bestD) {
      bestD = d;
      best = { ...c, y: cy };
    }
  }
  return best;
}

/** The starting city's position (kept for code that only cares about one city). */
export function cityPosition(t: number): { x: number; y: number } {
  return cityPos(START_CITY, t);
}
