/** Sheltering underground: vacant mines, waiting for a city, and the repairs done meanwhile. */
import { BALANCE } from '../config/balance';
import { CITY_LANES, LANE_HALF, type CityId } from '../config/cities';
import { CREW } from '../config/crew';
import { ENTRANCE_DY, exitNear, mineSites, openGround, type Standing } from './barons';
import { caravanBonus } from './crew';
import { escortStats } from './escort-stats';
import type { GameState } from './game-state';
import { hash2 } from './rng';
import { isPassable, terrainAt } from './terrain';
import { vehicleStats } from './vehicle';
import { cityPos, nearestCopy } from './world';

export const VACANT_COUNT = 10;
/** Hull points a mechanic restores per second of shelter, per skill level. */
const SHELTER_REPAIR = 0.12;

/** An abandoned mine: nobody to please, and its gate never closes. */
export interface Vacant {
  id: string;
  x: number;
  y: number;
  exitX: number;
  exitY: number;
}

const cache = new Map<number, Vacant[]>();

export function vacantSites(seed: number): Vacant[] {
  const cached = cache.get(seed);
  if (cached) return cached;
  const slot = BALANCE.WORLD_LEN / VACANT_COUNT;
  const barons = mineSites(seed);
  const out: Vacant[] = [];
  for (let i = 0; i < VACANT_COUNT; i++) {
    for (let attempt = 0; attempt < 2000; attempt++) {
      const y = Math.round(i * slot + 1000 + hash2(seed + 800, i, attempt) * (slot - 2000));
      const x = Math.round(BALANCE.EDGE + 250 + hash2(seed + 801, i, attempt) * (BALANCE.WORLD_WIDTH - 2 * BALANCE.EDGE - 500));
      if (CITY_LANES.some((lane) => Math.abs(x - lane) < LANE_HALF + 150)) continue;
      if (barons.some((m) => Math.hypot(m.x - x, nearestCopy(m.y, y) - y) < 800)) continue;
      if (!openGround(seed, x, y) || !isPassable(terrainAt(seed, x, y + ENTRANCE_DY))) continue;
      const exit = exitNear(seed, x, y + ENTRANCE_DY);
      if (!exit) continue;
      out.push({ id: `vacant-${i}`, x, y, exitX: exit.x, exitY: exit.y });
      break;
    }
  }
  cache.set(seed, out);
  return out;
}

/** Ids of vacant mines not yet known that are now within sight. */
export function discoverVacant(s: GameState, x: number, y: number, sight: number): string[] {
  return vacantSites(s.seed)
    .filter((v) => !s.known.includes(v.id) && Math.hypot(v.x - x, nearestCopy(v.y, y) - y) <= sight)
    .map((v) => v.id);
}

export const canRest = (standing: Standing): boolean => standing !== 'HOSTILE' && standing !== 'WARY';

/** Seconds from time `t` until this city draws level with a place at `y`. */
export function waitSeconds(t: number, y: number, city: CityId): number {
  // cities travel toward -y, so this is how far the city still has to come
  const ahead = cityPos(city, t).y - y;
  const distance = ((ahead % BALANCE.WORLD_LEN) + BALANCE.WORLD_LEN) % BALANCE.WORLD_LEN;
  return distance / BALANCE.SUN_SPEED;
}

/**
 * Time passes in shelter. Wounds close (faster with a medic) and a mechanic repairs every
 * vehicle, wrecks included. Nobody is on the road, so no wages build up.
 */
export function rest(s: GameState, seconds: number): GameState {
  if (seconds <= 0) return s;
  const heal = CREW.HEAL_PER_SECOND + CREW.MEDIC_HEAL_PER_SECOND * caravanBonus(s, 'medic');
  const crew = s.crew.map((m) => ({
    ...m,
    health: Math.min(100, m.health + heal * (m.trait === 'hardy' ? 2 : 1) * seconds),
  }));
  const mend = SHELTER_REPAIR * caravanBonus(s, 'mechanic') * seconds;
  const patched = (hp: number, max: number): number => (mend > 0 ? Math.min(max, hp + mend) : hp);
  return {
    ...s,
    t: s.t + seconds,
    crew,
    vehicle: { ...s.vehicle, hp: patched(s.vehicle.hp, vehicleStats(s.vehicle).maxHp) },
    caravan: s.caravan.map((e) => ({ ...e, hp: patched(e.hp, escortStats(e).hp) })),
  };
}
