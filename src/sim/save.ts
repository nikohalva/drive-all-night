import { HULLS, SLOT_TYPES } from '../config/catalog';
import type { GameState } from './game-state';

export const SAVE_KEY = 'drive-all-night/save-v1';

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

function looksLikeGameState(x: unknown): x is GameState {
  if (!isObj(x) || x.version !== 1) return false;
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

/** Parse a stored save; anything missing, corrupt or from another version is null. */
export function deserialize(raw: string | null): GameState | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
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
