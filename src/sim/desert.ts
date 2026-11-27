/** Where the desert's scenery and wrecks are, and what searching a wreck gives. */
import { BALANCE } from '../config/balance';
import { PARTS, SLOT_TYPES } from '../config/catalog';
import { CITY_LANES, LANE_HALF } from '../config/cities';
import { ROLE_NAME } from '../config/crew';
import { SCENERY, SCENERY_KINDS, WRECK, type SceneryKind } from '../config/desert';
import { caravanStats } from './caravan';
import { addSurvivor } from './crew';
import { spareRoom } from './garage';
import type { GameState } from './game-state';
import { hash2, makeRng } from './rng';
import { isPassable, terrainAt } from './terrain';
import { nearestCopy } from './world';

export interface Scenery {
  x: number;
  y: number;
  kind: SceneryKind;
  /** Mirror image, for variety. */
  flip: boolean;
}

export interface Wreck {
  id: string;
  x: number;
  y: number;
}

const wrapCell = (row: number, cellH: number): number => {
  const rows = BALANCE.WORLD_LEN / cellH;
  return ((row % rows) + rows) % rows;
};

/** Scenery whose anchor lies inside the rectangle. */
export function sceneryIn(seed: number, x: number, y: number, w: number, h: number): Scenery[] {
  const out: Scenery[] = [];
  const size = SCENERY.CELL;
  for (let row = Math.floor(y / size); row * size < y + h; row++) {
    const wr = wrapCell(row, size);
    for (let col = Math.max(0, Math.floor(x / size)); col * size < x + w; col++) {
      if (hash2(seed + 900, col, wr) >= SCENERY.CHANCE) continue;
      const px = Math.round(col * size + hash2(seed + 901, col, wr) * (size - 1));
      const py = Math.round(row * size + hash2(seed + 902, col, wr) * (size - 1));
      if (px < x || px >= x + w || py < y || py >= y + h) continue;
      if (px >= BALANCE.WORLD_WIDTH - BALANCE.EDGE || px < BALANCE.EDGE || !isPassable(terrainAt(seed, px, py))) continue;
      out.push({
        x: px,
        y: py,
        kind: SCENERY_KINDS[Math.floor(hash2(seed + 903, col, wr) * SCENERY_KINDS.length)],
        flip: hash2(seed + 904, col, wr) < 0.5,
      });
    }
  }
  return out;
}

const cache = new Map<number, Wreck[]>();

/** Every wreck on the planet for this seed. */
export function allWrecks(seed: number): Wreck[] {
  const cached = cache.get(seed);
  if (cached) return cached;
  const out: Wreck[] = [];
  const cols = Math.floor(BALANCE.WORLD_WIDTH / WRECK.CELL_W);
  const rows = BALANCE.WORLD_LEN / WRECK.CELL_H;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (hash2(seed + 910, col, row) >= WRECK.CHANCE) continue;
      const x = Math.round((col + 0.15 + 0.7 * hash2(seed + 911, col, row)) * WRECK.CELL_W);
      const y = Math.round((row + 0.15 + 0.7 * hash2(seed + 912, col, row)) * WRECK.CELL_H);
      if (x < BALANCE.EDGE + 40 || x > BALANCE.WORLD_WIDTH - BALANCE.EDGE - 40) continue;
      if (CITY_LANES.some((lane) => Math.abs(x - lane) < LANE_HALF)) continue;
      const open = [[0, 0], [24, 0], [-24, 0], [0, 24], [0, -24]].every(([dx, dy]) =>
        isPassable(terrainAt(seed, x + dx, y + dy)),
      );
      if (open) out.push({ id: `wreck-${col}-${row}`, x, y });
    }
  }
  cache.set(seed, out);
  return out;
}

const distance = (w: Wreck, x: number, y: number): number => Math.hypot(w.x - x, nearestCopy(w.y, y) - y);

/** The unsearched wreck the rig is beside, if any. */
export function wreckInReach(s: GameState, x: number, y: number): Wreck | null {
  return (
    allWrecks(s.seed).find((w) => distance(w, x, y) <= WRECK.REACH && !s.wrecks.searched.includes(w.id)) ?? null
  );
}

/** Remember unsearched wrecks within sight; returns the same state when there is nothing new. */
export function discoverWrecks(s: GameState, x: number, y: number, sight: number): GameState {
  const fresh = allWrecks(s.seed).filter(
    (w) => distance(w, x, y) <= sight && !s.wrecks.found.includes(w.id) && !s.wrecks.searched.includes(w.id),
  );
  if (fresh.length === 0) return s;
  return { ...s, wrecks: { ...s.wrecks, found: [...s.wrecks.found, ...fresh.map((w) => w.id)] } };
}

/** Go through a wreck. What is inside depends only on the world and the wreck. */
export function searchWreck(s: GameState, id: string): { state: GameState; report: string[] } {
  const index = allWrecks(s.seed).findIndex((w) => w.id === id);
  if (index < 0 || s.wrecks.searched.includes(id)) return { state: s, report: [] };
  const rng = makeRng(Math.floor(hash2(s.seed + 920, index, 0) * 4294967296));
  const caps = caravanStats(s);
  const report: string[] = [];
  let state: GameState = {
    ...s,
    wrecks: { found: s.wrecks.found.filter((w) => w !== id), searched: [...s.wrecks.searched, id] },
  };

  // every roll is made whether or not there is room, so a wreck's contents never change
  const hasFuel = rng() < WRECK.FUEL_CHANCE;
  const amount = Math.round(
    hasFuel ? WRECK.FUEL_MIN + rng() * WRECK.FUEL_SPREAD : WRECK.CARGO_MIN + rng() * WRECK.CARGO_SPREAD,
  );
  const part = rng() < WRECK.PART_CHANCE ? `${SLOT_TYPES[Math.floor(rng() * SLOT_TYPES.length)]}-${rng() < WRECK.RARE_PART ? 3 : 2}` : null;
  const survivor = rng() < WRECK.SURVIVOR_CHANCE ? Math.floor(rng() * 4294967296) : null;

  const key = hasFuel ? 'fuel' : 'cargo';
  const room = (hasFuel ? caps.tankCap : caps.cargoCap) - state.vehicle[key];
  const taken = Math.floor(Math.min(amount, Math.max(0, room)));
  const label = hasFuel ? 'FUEL' : 'CARGO';
  if (taken > 0) {
    state = { ...state, vehicle: { ...state.vehicle, [key]: state.vehicle[key] + taken } };
    report.push(`${label} +${taken}`);
  } else {
    report.push(`${label} FOUND, BUT NO ROOM`);
  }

  if (part) {
    const name = PARTS[part].name.toUpperCase();
    if (spareRoom(state) > 0) {
      state = { ...state, vehicle: { ...state.vehicle, owned: [...state.vehicle.owned, part] } };
      report.push(`FOUND ${name}`);
    } else {
      report.push(`NO ROOM FOR ${name}`);
    }
  }

  if (survivor !== null) {
    const joined = addSurvivor(state, survivor);
    if (joined) {
      state = joined.state;
      report.push(`A SURVIVOR JOINS: ${joined.member.name}, ${ROLE_NAME[joined.member.role]}`);
    } else {
      report.push('A SURVIVOR, BUT YOU HAVE NO SEAT');
    }
  }
  return { state, report };
}
