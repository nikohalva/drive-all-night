import { BALANCE } from '../config/balance';
import { PARTS } from '../config/catalog';
import { CITY_LANES, LANE_HALF } from '../config/cities';
import type { TxResult } from './economy';
import { spareRoom } from './garage';
import type { GameState } from './game-state';
import { hash2 } from './rng';
import { isPassable, terrainAt } from './terrain';
import { nearestCopy, zoneAt } from './world';

export type Temper = 'warlike' | 'wary' | 'trader';
export type Standing = 'HOSTILE' | 'WARY' | 'NEUTRAL' | 'FRIENDLY' | 'ALLIED';

/** A night baron's mine: fixed on the planet; open only while the night covers it. */
export interface Mine {
  id: string;
  x: number;
  y: number;
  baron: string;
  clan: string;
  temper: Temper;
  /** A checked open spot by the entrance where the rig comes back out. */
  exitX: number;
  exitY: number;
}

export interface Relation {
  standing: number;
  allied: boolean;
}

export const MINE_COUNT = 12;
/** Hostile barons' war parties hunt within this distance of their mine. */
export const MINE_HUNT_RADIUS = 4000;
/** Allied clan riders may join battles within this distance of their mine. */
export const ALLY_HELP_RADIUS = 5000;
/** How close you must be to a mine entrance to enter. */
export const MINE_ENTRY_RADIUS = 44;

const TRIBUTE_X = 10;
const TRIBUTE_X_GAIN = 4;
const TRIBUTE_CREDITS = 200;
const TRIBUTE_CREDITS_GAIN = 5;
const ALLIANCE_COST = 500;
const ALLIANCE_GAIN = 10;

const BARONS = [
  'VEX MORROW', 'OLD CINDER', 'LADY QUILL', 'HOLLOW JACK', 'THE GLOAM', 'MARROW KANE',
  'SABLE RUTH', 'IRON TAMSIN', 'DREGS HOLLOWAY', 'NYX VARGA', 'MOTHER ASH', 'COAL DUKE',
];
const CLANS = [
  'DUSKBORN', 'LANTERN EATERS', 'PALE TUNNEL', 'ASHCOATS', 'BLACK SEAM', 'QUIET DRILL',
  'EMBER RATS', 'LONG SHADOW', 'GRIT CHOIR', 'NIGHT SAPPERS', 'DEEP HAND', 'CINDER KIN',
];

const STOCK: Record<Temper, string[]> = {
  warlike: ['weapon-2', 'weapon-3', 'armor-2', 'armor-3', 'engine-3'],
  wary: ['armor-2', 'weapon-2', 'tank-2', 'tank-3'],
  trader: ['cargo-3', 'collector-3', 'tank-3', 'engine-2', 'collector-2'],
};

const sites = new Map<number, Mine[]>();

/** The tunnel mouth sits this far below the mine's centre. */
export const ENTRANCE_DY = 24;

/** A spot next to the entrance with open ground all round it, inside the entry radius. */
export function exitNear(seed: number, ex: number, ey: number): { x: number; y: number } | null {
  for (const [dx, dy] of [[36, 0], [-36, 0], [0, 36], [26, 26], [-26, 26], [20, 0], [-20, 0], [0, 20]]) {
    const x = ex + dx;
    const y = ey + dy;
    const clear = [[0, 0], [8, 0], [-8, 0], [0, 8], [0, -8]].every(([ox, oy]) => isPassable(terrainAt(seed, x + ox, y + oy)));
    if (clear) return { x, y };
  }
  return null;
}

export function openGround(seed: number, x: number, y: number): boolean {
  for (const [dx, dy] of [
    [0, 0], [40, 0], [-40, 0], [0, 40], [0, -40], [28, 28], [-28, 28], [28, -28], [-28, -28],
  ]) {
    if (!isPassable(terrainAt(seed, x + dx, y + dy))) return false;
  }
  return true;
}

/** The planet's mines for world `seed`: one per twelfth of the track, on open ground, off the city lanes. */
export function mineSites(seed: number): Mine[] {
  const cached = sites.get(seed);
  if (cached) return cached;
  const slot = BALANCE.WORLD_LEN / MINE_COUNT;
  const offset = Math.floor(hash2(seed + 702, 0, 0) * MINE_COUNT);
  const mines: Mine[] = [];
  for (let i = 0; i < MINE_COUNT; i++) {
    let x = 0;
    let y = 0;
    let exit: { x: number; y: number } | null = null;
    for (let attempt = 0; attempt < 2000 && !exit; attempt++) {
      y = Math.round(i * slot + 1000 + hash2(seed + 700, i, attempt) * (slot - 2000));
      x = Math.round(BALANCE.EDGE + 250 + hash2(seed + 701, i, attempt) * (BALANCE.WORLD_WIDTH - 2 * BALANCE.EDGE - 500));
      if (CITY_LANES.some((lane) => Math.abs(x - lane) < LANE_HALF + 150)) continue;
      if (!openGround(seed, x, y) || !isPassable(terrainAt(seed, x, y + ENTRANCE_DY))) continue;
      exit = exitNear(seed, x, y + ENTRANCE_DY);
    }
    const h = hash2(seed + 703, i, 0);
    mines.push({
      id: `mine-${i}`,
      x,
      y,
      exitX: exit ? exit.x : x,
      exitY: exit ? exit.y : y + ENTRANCE_DY,
      baron: BARONS[(i + offset) % BARONS.length],
      clan: CLANS[(i + offset * 5) % CLANS.length],
      temper: h < 0.3 ? 'warlike' : h < 0.7 ? 'wary' : 'trader',
    });
  }
  sites.set(seed, mines);
  return mines;
}

export const mineById = (seed: number, id: string): Mine | undefined => mineSites(seed).find((m) => m.id === id);

export const initialStanding = (t: Temper): number => (t === 'warlike' ? -40 : t === 'wary' ? 0 : 20);

export function relation(s: GameState, m: Mine): Relation {
  const r = s.barons[m.id];
  return { standing: r?.standing ?? initialStanding(m.temper), allied: r?.allied ?? false };
}

export function statusOf(r: Relation): Standing {
  if (r.allied) return 'ALLIED';
  if (r.standing < -20) return 'HOSTILE';
  if (r.standing < 0) return 'WARY';
  if (r.standing < 40) return 'NEUTRAL';
  return 'FRIENDLY';
}

/** Map / UI colour for a standing. */
export const STANDING_COLOR: Record<Standing, string> = {
  HOSTILE: '#ff3030',
  WARY: '#ffb03a',
  NEUTRAL: '#c8b8e8',
  FRIENDLY: '#7dff3a',
  ALLIED: '#3ef0ff',
};

/** Mines open their gates only while the night covers them. */
export function isMineOpen(m: Mine, t: number): boolean {
  const zone = zoneAt(m.y, t);
  return zone === 'sunset' || zone === 'deep' || zone === 'predawn';
}

/** Ids of mines not yet known that are now within `sight` of (x, y). */
export function discoverMines(s: GameState, x: number, y: number, sight: number): string[] {
  return mineSites(s.seed)
    .filter((m) => !s.known.includes(m.id) && Math.hypot(m.x - x, nearestCopy(m.y, y) - y) <= sight)
    .map((m) => m.id);
}

export function nearestMine(s: GameState, x: number, y: number): { mine: Mine; dist: number } {
  let best = { mine: mineSites(s.seed)[0], dist: Infinity };
  for (const m of mineSites(s.seed)) {
    const dist = Math.hypot(m.x - x, nearestCopy(m.y, y) - y);
    if (dist < best.dist) best = { mine: m, dist };
  }
  return best;
}

export function adjustStanding(s: GameState, mineId: string, delta: number): GameState {
  const m = mineById(s.seed, mineId);
  if (!m) return s;
  const r = relation(s, m);
  const standing = Math.max(-100, Math.min(100, r.standing + delta));
  return { ...s, barons: { ...s.barons, [mineId]: { ...r, standing } } };
}

const fail = (reason: 'credits' | 'nothing' | 'refused' | 'slot'): TxResult => ({ ok: false, reason });

export function tributeX(s: GameState, mineId: string): TxResult {
  if (s.vehicle.cargo < TRIBUTE_X) return fail('nothing');
  const paid = { ...s, vehicle: { ...s.vehicle, cargo: s.vehicle.cargo - TRIBUTE_X } };
  return { ok: true, state: adjustStanding(paid, mineId, TRIBUTE_X_GAIN) };
}

export function tributeCredits(s: GameState, mineId: string): TxResult {
  if (s.credits < TRIBUTE_CREDITS) return fail('credits');
  return { ok: true, state: adjustStanding({ ...s, credits: s.credits - TRIBUTE_CREDITS }, mineId, TRIBUTE_CREDITS_GAIN) };
}

export function swearAlliance(s: GameState, mineId: string): TxResult {
  const m = mineById(s.seed, mineId);
  if (!m) return fail('nothing');
  const r = relation(s, m);
  if (r.allied) return fail('nothing');
  if (statusOf(r) !== 'FRIENDLY') return fail('refused');
  if (s.credits < ALLIANCE_COST) return fail('credits');
  const paid = { ...s, credits: s.credits - ALLIANCE_COST };
  const raised = adjustStanding(paid, mineId, ALLIANCE_GAIN);
  return { ok: true, state: { ...raised, barons: { ...raised.barons, [mineId]: { ...relation(raised, m), allied: true } } } };
}

export const baronStock = (m: Mine): string[] => STOCK[m.temper];

/** Clan prices: dear to strangers, fair to friends, and allies get a further 20% off. */
export const baronPrice = (price: number, r: Relation): number =>
  Math.round(price * (1.2 - r.standing / 250) * (r.allied ? 0.8 : 1));

export function buyFromBaron(s: GameState, mineId: string, partId: string): TxResult {
  const m = mineById(s.seed, mineId);
  const part = PARTS[partId];
  if (!m || !part || !baronStock(m).includes(partId)) return fail('nothing');
  const r = relation(s, m);
  const status = statusOf(r);
  if (status === 'HOSTILE' || status === 'WARY') return fail('refused');
  const price = baronPrice(part.price, r);
  if (s.credits < price) return fail('credits');
  if (spareRoom(s) === 0) return fail('slot');
  return {
    ok: true,
    state: { ...s, credits: s.credits - price, vehicle: { ...s.vehicle, owned: [...s.vehicle.owned, partId] } },
  };
}

export const TRIBUTE = { x: TRIBUTE_X, xGain: TRIBUTE_X_GAIN, credits: TRIBUTE_CREDITS, creditsGain: TRIBUTE_CREDITS_GAIN, alliance: ALLIANCE_COST } as const;
