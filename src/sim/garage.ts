/** City garages: where spare parts and vehicles wait for you. */
import { CARAVAN_CAP } from '../config/escorts';
import type { CityId } from '../config/cities';
import { GARAGE_PRICE, GARAGE_RENT, GARAGE_VEHICLES, RENT_SECONDS, SPARE_SLOTS } from '../config/holdings';
import { caravanStats, type Escort } from './caravan';
import type { TxFailure, TxResult } from './economy';
import type { GameState } from './game-state';

export interface Garage {
  owned: boolean;
  /** World time the rent is paid until. */
  rentUntil: number;
  parts: string[];
  vehicles: Escort[];
}

const EMPTY: Garage = { owned: false, rentUntil: 0, parts: [], vehicles: [] };

const fail = (reason: TxFailure): TxResult => ({ ok: false, reason });
const done = (state: GameState): TxResult => ({ ok: true, state });

export const garageAt = (s: GameState, city: CityId): Garage => s.garages[city] ?? EMPTY;

/** Whether you can use the garage now. What is inside stays there either way. */
export function hasGarage(s: GameState, city: CityId): boolean {
  const g = garageAt(s, city);
  return g.owned || s.t < g.rentUntil;
}

export const spareRoom = (s: GameState): number => Math.max(0, SPARE_SLOTS[s.vehicle.hullId] - s.vehicle.owned.length);

const put = (s: GameState, city: CityId, patch: Partial<Garage>): GameState => ({
  ...s,
  garages: { ...s.garages, [city]: { ...garageAt(s, city), ...patch } },
});

export function buyGarage(s: GameState, city: CityId): TxResult {
  if (garageAt(s, city).owned) return fail('nothing');
  if (s.credits < GARAGE_PRICE) return fail('credits');
  return done(put({ ...s, credits: s.credits - GARAGE_PRICE }, city, { owned: true }));
}

export function rentGarage(s: GameState, city: CityId): TxResult {
  const g = garageAt(s, city);
  if (g.owned) return fail('nothing');
  if (s.credits < GARAGE_RENT) return fail('credits');
  const rentUntil = Math.max(s.t, g.rentUntil) + RENT_SECONDS;
  return done(put({ ...s, credits: s.credits - GARAGE_RENT }, city, { rentUntil }));
}

const without = <T>(list: T[], index: number): T[] => list.filter((_, i) => i !== index);

/** Put a part straight into the garage (a purchase or a removed part with no room aboard). */
export const stash = (s: GameState, city: CityId, partId: string): GameState =>
  put(s, city, { parts: [...garageAt(s, city).parts, partId] });

export function storePart(s: GameState, city: CityId, partId: string): TxResult {
  const at = s.vehicle.owned.indexOf(partId);
  if (!hasGarage(s, city) || at < 0) return fail('nothing');
  return done(stash({ ...s, vehicle: { ...s.vehicle, owned: without(s.vehicle.owned, at) } }, city, partId));
}

export function takePart(s: GameState, city: CityId, partId: string): TxResult {
  const { parts } = garageAt(s, city);
  const at = parts.indexOf(partId);
  if (!hasGarage(s, city) || at < 0) return fail('nothing');
  if (spareRoom(s) === 0) return fail('slot');
  const aboard = { ...s, vehicle: { ...s.vehicle, owned: [...s.vehicle.owned, partId] } };
  return done(put(aboard, city, { parts: without(parts, at) }));
}

export function parkEscort(s: GameState, city: CityId, id: number): TxResult {
  const e = s.caravan.find((x) => x.id === id);
  if (!e || !hasGarage(s, city)) return fail('nothing');
  const { vehicles } = garageAt(s, city);
  if (vehicles.length >= GARAGE_VEHICLES) return fail('slot');
  const after: GameState = {
    ...s,
    caravan: s.caravan.filter((x) => x.id !== id),
    crew: s.crew.map((m) => (m.post === id ? { ...m, post: null } : m)),
  };
  // what no longer fits stays behind with the vehicle that held it
  const caps = caravanStats(after);
  const vehicle = {
    ...after.vehicle,
    fuel: Math.min(after.vehicle.fuel, caps.tankCap),
    cargo: Math.min(after.vehicle.cargo, caps.cargoCap),
  };
  return done(put({ ...after, vehicle }, city, { vehicles: [...vehicles, e] }));
}

export function takeEscort(s: GameState, city: CityId, id: number): TxResult {
  const { vehicles } = garageAt(s, city);
  const e = vehicles.find((x) => x.id === id);
  if (!e || !hasGarage(s, city)) return fail('nothing');
  if (s.caravan.length >= CARAVAN_CAP[s.vehicle.hullId]) return fail('slot');
  return done(put({ ...s, caravan: [...s.caravan, e] }, city, { vehicles: vehicles.filter((x) => x.id !== id) }));
}
