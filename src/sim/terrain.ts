import { BALANCE } from '../config/balance';
import { hash2 } from './rng';
import { wrapAlong } from './world';

export type Terrain = 'sand' | 'dunes' | 'rock' | 'cliff';

export const TERRAIN_SPEED: Record<Terrain, number> = { sand: 1, dunes: 0.6, rock: 0.8, cliff: 0 };

const LATTICE = 64;
/** The city drives down the middle; keep a lane of non-cliff ground there. */
const CITY_LANE = 300;

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Value noise on a lattice of `size` px; the y lattice wraps so the seam is seamless. */
function valueNoise(seed: number, x: number, y: number, size: number): number {
  const cellsY = BALANCE.WORLD_LEN / size;
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

export function terrainAt(seed: number, x: number, y: number): Terrain {
  if (x < BALANCE.EDGE || x >= BALANCE.WORLD_WIDTH - BALANCE.EDGE) return 'cliff';
  const n = 0.65 * valueNoise(seed, x, y, LATTICE) + 0.35 * valueNoise(seed + 101, x, y, LATTICE / 2);
  let kind: Terrain = n < 0.55 ? 'sand' : n < 0.78 ? 'dunes' : n < 0.93 ? 'rock' : 'cliff';
  if (kind === 'cliff' && Math.abs(x - BALANCE.WORLD_WIDTH / 2) < CITY_LANE) kind = 'rock';
  return kind;
}
