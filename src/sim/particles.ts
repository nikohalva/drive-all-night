import { BALANCE, NIGHT_LEN } from '../config/balance';
import { hash2 } from './rng';
import { isPassable, terrainAt } from './terrain';
import { behindSunset, sunsetsPassed } from './world';

const CELLS_Y = BALANCE.WORLD_LEN / BALANCE.CELL;

const wrapCell = (cy: number): number => ((cy % CELLS_Y) + CELLS_Y) % CELLS_Y;
const centreX = (cx: number): number => (cx + 0.5) * BALANCE.CELL;
const centreY = (cy: number): number => (wrapCell(cy) + 0.5) * BALANCE.CELL;

/** Particle X density at a distance behind the sunset line (0 on the day side). */
export function baseDensity(behind: number): number {
  if (behind >= NIGHT_LEN) return 0;
  return BALANCE.DENSITY_MAX * Math.exp(-behind / (BALANCE.DECAY_FRAC * NIGHT_LEN));
}

/** Does grid cell (cx, cy) hold Particle X right now (ignoring depletion)? */
export function cellHasX(seed: number, cx: number, cy: number, t: number): boolean {
  const y = centreY(cy);
  if (!isPassable(terrainAt(seed, centreX(cx), y))) return false;
  return hash2(seed, cx, wrapCell(cy)) < baseDensity(behindSunset(y, t));
}

/**
 * Cells collected this night. A cell stays empty only until the sunset line
 * sweeps over it again, which is when the next day showers it with fresh X.
 */
export class DepletionMap {
  private readonly marks = new Map<string, number>();

  private static key(cx: number, cy: number): string {
    return `${cx},${wrapCell(cy)}`;
  }

  isDepleted(cx: number, cy: number, t: number): boolean {
    const stored = this.marks.get(DepletionMap.key(cx, cy));
    return stored !== undefined && stored === sunsetsPassed(centreY(cy), t);
  }

  mark(cx: number, cy: number, t: number): void {
    this.marks.set(DepletionMap.key(cx, cy), sunsetsPassed(centreY(cy), t));
  }

  /** Forget cells whose night is over. */
  prune(t: number): void {
    for (const [key, stored] of this.marks) {
      const cy = Number(key.split(',')[1]);
      if (stored !== sunsetsPassed(centreY(cy), t)) this.marks.delete(key);
    }
  }
}

/** Sweep a circle of `radius` px; returns the amount of Particle X gathered. */
export function collect(
  seed: number,
  map: DepletionMap,
  x: number,
  y: number,
  radius: number,
  t: number,
): number {
  const cell = BALANCE.CELL;
  let count = 0;
  for (let cx = Math.floor((x - radius) / cell); cx <= Math.floor((x + radius) / cell); cx++) {
    for (let cy = Math.floor((y - radius) / cell); cy <= Math.floor((y + radius) / cell); cy++) {
      const dx = (cx + 0.5) * cell - x;
      const dy = (cy + 0.5) * cell - y;
      if (dx * dx + dy * dy > radius * radius) continue;
      if (!cellHasX(seed, cx, cy, t) || map.isDepleted(cx, cy, t)) continue;
      map.mark(cx, cy, t);
      count++;
    }
  }
  return count * BALANCE.X_PER_CELL;
}
