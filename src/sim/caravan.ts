import { CITY_BY_ID, START_CITY, cityPrice, type CityDef } from '../config/cities';
import {
  CARAVAN_CAP,
  ESCORT_FUEL_PER_SECOND,
  ESCORT_RESALE,
  escortDef,
  type EscortKind,
  type Tier,
} from '../config/escorts';
import type { TxResult } from './economy';
import type { GameState } from './game-state';
import { vehicleStats } from './vehicle';

/** One escort vehicle in the caravan. hp 0 means wrecked: towed along, doing nothing. */
export interface Escort {
  id: number;
  kind: EscortKind;
  tier: Tier;
  hp: number;
}

/** How far the lead alone can see mines and pirates coming, in px. */
export const BASE_SIGHT = 700;

export const isWrecked = (e: Escort): boolean => e.hp <= 0;

export interface CaravanStats {
  cargoCap: number;
  tankCap: number;
  /** The caravan travels at its slowest vehicle's speed. */
  topSpeed: number;
  /** Working collectors and their sweep radius. */
  collectors: { id: number; radius: number }[];
  sight: number;
  /** Added to the chance of fleeing a battle. */
  fleeBonus: number;
  escorts: number;
  wrecked: number;
  /** Extra fuel per second at full throttle for towing everyone along. */
  fuelBurnExtra: number;
}

const HOME = CITY_BY_ID[START_CITY];

export function caravanStats(s: GameState): CaravanStats {
  const lead = vehicleStats(s.vehicle);
  let cargoCap = lead.cargoCap;
  let tankCap = lead.tankCap;
  let topSpeed = lead.topSpeed;
  let sight = BASE_SIGHT;
  let fleeBonus = 0;
  let wrecked = 0;
  const collectors: { id: number; radius: number }[] = [];
  for (const e of s.caravan) {
    const def = escortDef(e.kind, e.tier);
    cargoCap += def.cargoCap;
    tankCap += def.tankCap;
    topSpeed = Math.min(topSpeed, def.speed);
    if (isWrecked(e)) {
      wrecked++;
      continue;
    }
    if (def.collectRadius > 0) collectors.push({ id: e.id, radius: def.collectRadius });
    if (def.kind === 'scout') {
      sight += def.sight;
      fleeBonus += 0.1;
    }
  }
  return {
    cargoCap,
    tankCap,
    topSpeed,
    collectors,
    sight,
    fleeBonus,
    escorts: s.caravan.length,
    wrecked,
    fuelBurnExtra: s.caravan.length * ESCORT_FUEL_PER_SECOND,
  };
}

const fail = (reason: 'credits' | 'slot' | 'nothing'): TxResult => ({ ok: false, reason });

export function buyEscort(s: GameState, kind: EscortKind, tier: Tier, city: CityDef = HOME): TxResult {
  if (!city.escortStock.includes(kind)) return fail('nothing');
  if (s.caravan.length >= CARAVAN_CAP[s.vehicle.hullId]) return fail('slot');
  const def = escortDef(kind, tier);
  const price = cityPrice(def.price, city);
  if (s.credits < price) return fail('credits');
  return {
    ok: true,
    state: {
      ...s,
      credits: s.credits - price,
      caravan: [...s.caravan, { id: s.nextEscortId, kind, tier, hp: def.hp }],
      nextEscortId: s.nextEscortId + 1,
    },
  };
}

export function sellEscort(s: GameState, id: number): TxResult {
  const e = s.caravan.find((x) => x.id === id);
  if (!e) return fail('nothing');
  const refund = Math.floor(escortDef(e.kind, e.tier).price * ESCORT_RESALE);
  const after: GameState = { ...s, credits: s.credits + refund, caravan: s.caravan.filter((x) => x.id !== id) };
  // what no longer fits goes with the vehicle that held it
  const caps = caravanStats(after);
  return {
    ok: true,
    state: {
      ...after,
      vehicle: { ...after.vehicle, fuel: Math.min(after.vehicle.fuel, caps.tankCap), cargo: Math.min(after.vehicle.cargo, caps.cargoCap) },
    },
  };
}

/** Repair escorts in caravan order, as far as the credits go. */
export function repairEscorts(s: GameState, city: CityDef = HOME): TxResult {
  const damaged = s.caravan.some((e) => e.hp < escortDef(e.kind, e.tier).hp);
  if (!damaged) return fail('nothing');
  let credits = s.credits;
  let healedAny = false;
  const caravan = s.caravan.map((e) => {
    const missing = escortDef(e.kind, e.tier).hp - e.hp;
    if (missing <= 0) return e;
    const affordable = Math.floor(credits / city.repairPrice);
    const heal = Math.min(missing, affordable);
    if (heal <= 0) return e;
    credits -= Math.ceil(heal * city.repairPrice);
    healedAny = true;
    return { ...e, hp: e.hp + heal };
  });
  if (!healedAny) return fail('credits');
  return { ok: true, state: { ...s, credits, caravan } };
}
