/** Putting parts on escorts, and selling the spares. */
import { HULLS, PARTS, type SlotType } from '../config/catalog';
import type { EscortKind } from '../config/escorts';
import type { CityId } from '../config/cities';
import { ESCORT_SLOTS } from '../config/outfit';
import { caravanStats, type Escort } from './caravan';
import type { TxFailure, TxResult } from './economy';
import { escortStats, partValue } from './escort-stats';
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

const change = (s: GameState, id: number, edit: (e: Escort) => Escort): GameState => ({
  ...s,
  caravan: s.caravan.map((e) => (e.id === id ? edit(e) : e)),
});

/** What is in this slot of a caravan vehicle. Bought escorts have one of each slot they take. */
const partIn = (e: Escort, slot: SlotType, index: number): string | null =>
  (e.rig ? e.rig.fitted[slot][index] : e.fitted?.[slot]) ?? null;

function setPart(e: Escort, slot: SlotType, index: number, partId: string | null): Escort {
  if (e.rig) {
    const list = [...e.rig.fitted[slot]];
    list[index] = partId;
    return { ...e, rig: { ...e.rig, fitted: { ...e.rig.fitted, [slot]: list } } };
  }
  const fitted = { ...e.fitted };
  if (partId) fitted[slot] = partId;
  else delete fitted[slot];
  return { ...e, fitted };
}

const takesSlot = (e: Escort, slot: SlotType, index: number): boolean =>
  e.rig ? index >= 0 && index < HULLS[e.rig.hullId].slots[slot] : index === 0 && ESCORT_SLOTS[e.kind as EscortKind].includes(slot);

export function fitEscort(
  s: GameState,
  city: CityId,
  id: number,
  slot: SlotType,
  partId: string,
  from: PartSource,
  index = 0,
): TxResult {
  const e = s.caravan.find((x) => x.id === id);
  if (!e) return fail('nothing');
  if (!takesSlot(e, slot, index) || PARTS[partId]?.slot !== slot) return fail('slot');
  let next = takeSpare(s, city, partId, from);
  if (!next) return fail('not-owned');
  const previous = partIn(e, slot, index);
  next = change(next, id, (x) => setPart(x, slot, index, partId));
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

export function unfitEscort(s: GameState, city: CityId, id: number, slot: SlotType, index = 0): TxResult {
  const e = s.caravan.find((x) => x.id === id);
  const previous = e ? partIn(e, slot, index) : null;
  if (!e || !previous) return fail('nothing');
  // a rig with no engine or tank could never be driven again
  if (e.rig && (slot === 'engine' || slot === 'tank') && e.rig.fitted[slot].filter(Boolean).length <= 1) {
    return fail('required');
  }
  const bare = change(s, id, (x) => setPart(x, slot, index, null));
  if (spareRoom(s) > 0) {
    return done(clampToCaps({ ...bare, vehicle: { ...bare.vehicle, owned: [...bare.vehicle.owned, previous] } }));
  }
  return hasGarage(s, city) ? done(clampToCaps(stash(bare, city, previous))) : fail('slot');
}

export { partValue };

/** Sell a spare to a city. Like cargo, the money goes to any debt first. */
export function sellPart(s: GameState, city: CityId, partId: string, from: PartSource): TxResult {
  const without = takeSpare(s, city, partId, from);
  if (!without) return fail('not-owned');
  const value = partValue(partId);
  const toDebt = Math.min(s.debt, value);
  return done({ ...without, debt: s.debt - toDebt, credits: s.credits + (value - toDebt) });
}
