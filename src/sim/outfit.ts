/** Putting parts on escorts, and selling the spares. */
import { PARTS, type SlotType } from '../config/catalog';
import type { CityId } from '../config/cities';
import { ESCORT_SLOTS, PART_RESALE, PART_SCRAP } from '../config/outfit';
import { caravanStats, type Escort } from './caravan';
import type { TxFailure, TxResult } from './economy';
import { escortStats } from './escort-stats';
import { garageAt, hasGarage, spareRoom, stash } from './garage';
import type { GameState } from './game-state';
import { vehicleStats } from './vehicle';

export type PartSource = 'aboard' | 'garage';

const fail = (reason: TxFailure): TxResult => ({ ok: false, reason });
const done = (state: GameState): TxResult => ({ ok: true, state });

/** Take one copy of a spare out of where it is. Null when it is not there. */
function takeSpare(s: GameState, city: CityId, partId: string, from: PartSource): GameState | null {
  if (from === 'aboard') {
    const at = s.vehicle.owned.indexOf(partId);
    return at < 0 ? null : { ...s, vehicle: { ...s.vehicle, owned: s.vehicle.owned.filter((_, i) => i !== at) } };
  }
  const g = garageAt(s, city);
  const at = g.parts.indexOf(partId);
  if (at < 0 || !hasGarage(s, city)) return null;
  return { ...s, garages: { ...s.garages, [city]: { ...g, parts: g.parts.filter((_, i) => i !== at) } } };
}

/** Hull, fuel and cargo can never exceed what the vehicles can now hold. */
export function clampToCaps(s: GameState): GameState {
  const caps = caravanStats(s);
  return {
    ...s,
    vehicle: {
      ...s.vehicle,
      hp: Math.min(s.vehicle.hp, vehicleStats(s.vehicle).maxHp),
      fuel: Math.min(s.vehicle.fuel, caps.tankCap),
      cargo: Math.min(s.vehicle.cargo, caps.cargoCap),
    },
    caravan: s.caravan.map((e) => ({ ...e, hp: Math.min(e.hp, escortStats(e).hp) })),
  };
}

const withFitted = (s: GameState, id: number, change: (f: NonNullable<Escort['fitted']>) => void): GameState => ({
  ...s,
  caravan: s.caravan.map((e) => {
    if (e.id !== id) return e;
    const fitted = { ...e.fitted };
    change(fitted);
    return { ...e, fitted };
  }),
});

export function fitEscort(
  s: GameState,
  city: CityId,
  id: number,
  slot: SlotType,
  partId: string,
  from: PartSource,
): TxResult {
  const e = s.caravan.find((x) => x.id === id);
  if (!e) return fail('nothing');
  if (!ESCORT_SLOTS[e.kind].includes(slot) || PARTS[partId]?.slot !== slot) return fail('slot');
  let next = takeSpare(s, city, partId, from);
  if (!next) return fail('not-owned');
  const previous = e.fitted?.[slot];
  next = withFitted(next, id, (f) => {
    f[slot] = partId;
  });
  if (previous) {
    // a part taken from the spares leaves room for the one coming off
    if (from === 'aboard' || spareRoom(next) > 0) {
      next = { ...next, vehicle: { ...next.vehicle, owned: [...next.vehicle.owned, previous] } };
    } else {
      next = stash(next, city, previous);
    }
  }
  return done(clampToCaps(next));
}

export function unfitEscort(s: GameState, city: CityId, id: number, slot: SlotType): TxResult {
  const previous = s.caravan.find((x) => x.id === id)?.fitted?.[slot];
  if (!previous) return fail('nothing');
  const bare = withFitted(s, id, (f) => {
    delete f[slot];
  });
  if (spareRoom(s) > 0) {
    return done(clampToCaps({ ...bare, vehicle: { ...bare.vehicle, owned: [...bare.vehicle.owned, previous] } }));
  }
  return hasGarage(s, city) ? done(clampToCaps(stash(bare, city, previous))) : fail('slot');
}

export function partValue(partId: string): number {
  const price = PARTS[partId]?.price ?? 0;
  return price > 0 ? Math.floor(price * PART_RESALE) : PART_SCRAP;
}

/** Sell a spare to a city. Like cargo, the money goes to any debt first. */
export function sellPart(s: GameState, city: CityId, partId: string, from: PartSource): TxResult {
  const without = takeSpare(s, city, partId, from);
  if (!without) return fail('not-owned');
  const value = partValue(partId);
  const toDebt = Math.min(s.debt, value);
  return done({ ...without, debt: s.debt - toDebt, credits: s.credits + (value - toDebt) });
}
