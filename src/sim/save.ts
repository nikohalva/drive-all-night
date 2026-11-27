import { HULLS, SLOT_TYPES } from '../config/catalog';
import { ESCORT_KINDS } from '../config/escorts';
import { CREW_ROLES, TRAIT_IDS } from '../config/crew';
import { HOME_GARAGE } from '../config/holdings';
import type { EscortKind } from '../config/escorts';
import { rookie } from './crew';
import type { GameState } from './game-state';

export const SAVE_KEY = 'drive-all-night/save-v1';
/** The save format this build writes; older formats are upgraded on load. */
export const CURRENT_SAVE_VERSION = 8;

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

/** localStorage, or null when it is missing or blocked (private mode, sandboxed frames). */
export function safeStorage(): KV | null {
  try {
    const ls = (globalThis as { localStorage?: KV }).localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}

export function serialize(s: GameState): string {
  return JSON.stringify(s);
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown): boolean => typeof x === 'number' && Number.isFinite(x);

const isRig = (r: unknown): boolean => {
  if (!isObj(r) || typeof r.hullId !== 'string' || !(r.hullId in HULLS) || !isObj(r.fitted)) return false;
  const fitted = r.fitted;
  return SLOT_TYPES.every((slot) => Array.isArray(fitted[slot]));
};

const isEscort = (e: unknown): boolean =>
  isObj(e) &&
  isNum(e.id) &&
  isNum(e.hp) &&
  [1, 2, 3].includes(e.tier as number) &&
  (e.kind === 'rig' ? isRig(e.rig) : ESCORT_KINDS.includes(e.kind as never)) &&
  (e.fitted === undefined || (isObj(e.fitted) && Object.values(e.fitted).every((id) => typeof id === 'string')));

function looksLikeGameState(x: unknown): x is GameState {
  if (!isObj(x) || x.version !== CURRENT_SAVE_VERSION) return false;
  if (!Array.isArray(x.known) || !x.known.every((id) => typeof id === 'string')) return false;
  if (!isNum(x.nextEscortId) || !Array.isArray(x.caravan)) return false;
  if (!isObj(x.barons)) return false;
  for (const r of Object.values(x.barons)) {
    if (!isObj(r) || !isNum(r.standing) || typeof r.allied !== 'boolean') return false;
  }
  if (!x.caravan.every(isEscort)) return false;
  if (!isNum(x.nextCrewId) || !Array.isArray(x.crew) || !Array.isArray(x.hired)) return false;
  for (const m of x.crew) {
    if (!isObj(m) || !isNum(m.id) || !isNum(m.health) || !isNum(m.face) || typeof m.name !== 'string') return false;
    if (!CREW_ROLES.includes(m.role as never) || !TRAIT_IDS.includes(m.trait as never)) return false;
    if (![0, 1, 2, 3].includes(m.skill as number)) return false;
    if (m.post !== null && m.post !== 'lead' && !isNum(m.post)) return false;
    if (!isNum(m.owed) || !isNum(m.missed)) return false;
  }
  if (!isNum(x.bank) || !isObj(x.garages)) return false;
  for (const g of Object.values(x.garages)) {
    if (!isObj(g) || typeof g.owned !== 'boolean' || !isNum(g.rentUntil)) return false;
    if (!Array.isArray(g.parts) || !g.parts.every((id) => typeof id === 'string')) return false;
    if (!Array.isArray(g.vehicles) || !g.vehicles.every(isEscort)) return false;
  }
  const w = x.wrecks;
  const isIds = (list: unknown): boolean => Array.isArray(list) && list.every((id) => typeof id === 'string');
  if (!isObj(w) || !isIds(w.found) || !isIds(w.searched)) return false;
  if (!isNum(x.seed) || !isNum(x.t) || !isNum(x.credits) || !isNum(x.debt)) return false;

  const p = x.player;
  if (!isObj(p) || !isNum(p.x) || !isNum(p.y) || !isNum(p.heading)) return false;

  const v = x.vehicle;
  if (!isObj(v) || typeof v.hullId !== 'string' || !(v.hullId in HULLS)) return false;
  if (!isNum(v.hp) || !isNum(v.fuel) || !isNum(v.cargo) || !isNum(v.repairKits)) return false;
  if (!Array.isArray(v.owned) || !v.owned.every((id) => typeof id === 'string')) return false;
  if (!isObj(v.fitted)) return false;
  for (const slot of SLOT_TYPES) {
    const parts = v.fitted[slot];
    if (!Array.isArray(parts) || !parts.every((id) => id === null || typeof id === 'string')) return false;
  }

  const f = x.flags;
  if (!isObj(f)) return false;
  return ['easyStartOver', 'firstRescueUsed', 'won', 'victoryShown'].every((k) => typeof f[k] === 'boolean');
}

/** Bring an older save up to the current format; leaves anything unrecognised alone. */
function upgrade(x: unknown): unknown {
  if (!isObj(x) || typeof x.version !== 'number') return x;
  let v: Record<string, unknown> = { ...x };
  if (v.version === 1) v = { ...v, version: 2, known: [] };
  if (v.version === 2) v = { ...v, version: 3, caravan: [], nextEscortId: 1 };
  if (v.version === 3) v = { ...v, version: 4, barons: {} };
  if (v.version === 4) {
    // escorts now need someone aboard: give each one a green hand
    const escorts = Array.isArray(v.caravan) ? v.caravan.filter(isObj) : [];
    const crew = escorts
      .filter((e) => ESCORT_KINDS.includes(e.kind as never))
      .map((e, i) => rookie(Number(v.seed), i + 1, e.kind as EscortKind, Number(e.id)));
    v = { ...v, version: 5, crew, nextCrewId: crew.length + 1, hired: [] };
  }
  if (v.version === 5) {
    const home = { owned: true, rentUntil: 0, parts: [], vehicles: [] };
    v = { ...v, version: 6, bank: 0, garages: { [HOME_GARAGE]: home } };
  }
  if (v.version === 6) v = { ...v, version: 7, wrecks: { found: [], searched: [] } };
  if (v.version === 7) {
    const crew = Array.isArray(v.crew) ? v.crew.map((m) => (isObj(m) ? { ...m, owed: 0, missed: 0 } : m)) : v.crew;
    v = { ...v, version: 8, crew };
  }
  return v;
}

/** Parse a stored save; anything missing, corrupt or from another version is null. */
export function deserialize(raw: string | null): GameState | null {
  if (!raw) return null;
  try {
    const parsed = upgrade(JSON.parse(raw));
    return looksLikeGameState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveGame(s: GameState, kv: KV | null = safeStorage()): boolean {
  if (!kv) return false;
  try {
    kv.setItem(SAVE_KEY, serialize(s));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(kv: KV | null = safeStorage()): GameState | null {
  if (!kv) return null;
  try {
    return deserialize(kv.getItem(SAVE_KEY));
  } catch {
    return null;
  }
}
