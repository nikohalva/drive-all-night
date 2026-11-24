import { BALANCE } from '../config/balance';
import { CITY_LANES, LANE_HALF } from '../config/cities';
import { hash2 } from './rng';
import { wrapAlong } from './world';

export type Terrain = 'sand' | 'dunes' | 'rock' | 'cliff' | 'mountain' | 'canyon' | 'mesa';

export const TERRAIN_SPEED: Record<Terrain, number> = {
  sand: 1,
  dunes: 0.6,
  rock: 0.8,
  cliff: 0,
  mountain: 0,
  canyon: 0,
  mesa: 0,
};

export const isPassable = (t: Terrain): boolean => TERRAIN_SPEED[t] > 0;

const L = BALANCE.WORLD_LEN;
const BASE_LATTICE = 64;
const MOUNTAIN_LATTICE = 640;
/** Above this the mountain noise is solid rock wall; just below it are slow foothills. */
const MOUNTAIN_LEVEL = 0.7;
const FOOTHILL_LEVEL = 0.65;

/** Canyons sit in slots this far apart along the track (divides the world length). */
export const RIFT_SPACING = 2400;
const RIFT_SLOTS = L / RIFT_SPACING;
const RIFT_CHANCE = 0.55;
const RIFT_WIGGLE = 130;
const PASS_SEGMENT = 700;
const PASS_WIDTH = 120;

const MESA_CELL = 160;
const MESA_CELLS_Y = L / MESA_CELL;
const MESA_CHANCE = 0.05;

const smooth = (t: number): number => t * t * (3 - 2 * t);
const mod = (n: number, m: number): number => ((n % m) + m) % m;

/** Value noise on a lattice of `size` px; the y lattice wraps so the seam is seamless. */
function valueNoise(seed: number, x: number, y: number, size: number): number {
  const cellsY = L / size;
  const gx = x / size;
  const gy = wrapAlong(y) / size;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = smooth(gx - ix);
  const fy = smooth(gy - iy);
  const iy1 = (iy + 1) % cellsY;
  const a = hash2(seed, ix, iy);
  const b = hash2(seed, ix + 1, iy);
  const c = hash2(seed, ix, iy1);
  const d = hash2(seed, ix + 1, iy1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

export interface Rift {
  exists: boolean;
  /** Track position of the rift's resting line (unwrapped for slot k). */
  base: number;
  halfWidth: number;
  /** The band of y the rift can wiggle across. */
  top: number;
  bottom: number;
  /** Centre x of the pass in each 700 px stretch. */
  passes: number[];
  phase1: number;
  phase2: number;
  slot: number;
}

/** The canyon in slot k (k may be outside 0..slots-1; positions follow k, randomness wraps). */
export function riftAt(seed: number, k: number): Rift {
  const slot = mod(k, RIFT_SLOTS);
  const base = k * RIFT_SPACING + 300 + hash2(seed + 901, slot, 0) * (RIFT_SPACING - 600);
  const halfWidth = 18 + hash2(seed + 903, slot, 0) * 10;
  const passes: number[] = [];
  for (let seg = 0; seg * PASS_SEGMENT < BALANCE.WORLD_WIDTH; seg++) {
    passes.push(passStart(seed, slot, seg) + PASS_WIDTH / 2);
  }
  return {
    exists: hash2(seed + 900, slot, 0) < RIFT_CHANCE,
    base,
    halfWidth,
    top: base - RIFT_WIGGLE - halfWidth,
    bottom: base + RIFT_WIGGLE + halfWidth,
    passes,
    phase1: hash2(seed + 902, slot, 0) * Math.PI * 2,
    phase2: hash2(seed + 905, slot, 0) * Math.PI * 2,
    slot,
  };
}

function passStart(seed: number, slot: number, seg: number): number {
  return seg * PASS_SEGMENT + 40 + hash2(seed + 904, slot, seg) * (PASS_SEGMENT - PASS_WIDTH - 80);
}

function isCanyon(seed: number, x: number, y: number): boolean {
  const k0 = Math.floor(y / RIFT_SPACING);
  for (let k = k0 - 1; k <= k0 + 1; k++) {
    const r = riftAt(seed, k);
    if (!r.exists) continue;
    const centre = r.base + 90 * Math.sin(x / 260 + r.phase1) + 40 * Math.sin(x / 97 + r.phase2);
    if (Math.abs(y - centre) > r.halfWidth) continue;
    const seg = Math.floor(x / PASS_SEGMENT);
    const start = passStart(seed, r.slot, seg);
    if (x >= start && x < start + PASS_WIDTH) continue;
    return true;
  }
  return false;
}

function isMesa(seed: number, x: number, y: number): boolean {
  const cx0 = Math.floor(x / MESA_CELL);
  const cy0 = Math.floor(y / MESA_CELL);
  for (let cy = cy0 - 1; cy <= cy0 + 1; cy++) {
    const wcy = mod(cy, MESA_CELLS_Y);
    for (let cx = cx0 - 1; cx <= cx0 + 1; cx++) {
      if (hash2(seed + 950, cx, wcy) >= MESA_CHANCE) continue;
      const mx = cx * MESA_CELL + 20 + hash2(seed + 951, cx, wcy) * (MESA_CELL - 40);
      const my = cy * MESA_CELL + 20 + hash2(seed + 952, cx, wcy) * (MESA_CELL - 40);
      const r = 10 + hash2(seed + 953, cx, wcy) * 16;
      if ((x - mx) ** 2 + (y - my) ** 2 <= r * r) return true;
    }
  }
  return false;
}

const nearLane = (x: number): boolean => CITY_LANES.some((lane) => Math.abs(x - lane) < LANE_HALF);

export function terrainAt(seed: number, x: number, rawY: number): Terrain {
  if (x < BALANCE.EDGE || x >= BALANCE.WORLD_WIDTH - BALANCE.EDGE) return 'cliff';
  const y = wrapAlong(rawY);
  const lane = nearLane(x);

  if (!lane && isCanyon(seed, x, y)) return 'canyon';

  const m = 0.7 * valueNoise(seed + 500, x, y, MOUNTAIN_LATTICE) + 0.3 * valueNoise(seed + 501, x, y, MOUNTAIN_LATTICE / 2);
  if (m > MOUNTAIN_LEVEL) return lane ? 'rock' : 'mountain';
  if (m > FOOTHILL_LEVEL) return 'rock';

  if (!lane && isMesa(seed, x, y)) return 'mesa';

  const n = 0.65 * valueNoise(seed, x, y, BASE_LATTICE) + 0.35 * valueNoise(seed + 101, x, y, BASE_LATTICE / 2);
  return n < 0.55 ? 'sand' : n < 0.78 ? 'dunes' : 'rock';
}
