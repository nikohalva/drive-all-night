import { HULLS, PARTS, REPAIR_KIT, SLOT_TYPES, type HullId, type SlotType } from '../config/catalog';
import { CITY_BY_ID, START_CITY, cityPrice, type CityDef } from '../config/cities';
import { caravanStats } from './caravan';
import { HOME_GARAGE } from '../config/holdings';
import { hasGarage, parkVehicle, spareRoom, stash } from './garage';
import { clampToCaps } from './outfit';
import type { GameState } from './game-state';
import { vehicleStats, type VehicleState } from './vehicle';

export type TxFailure = 'credits' | 'slot' | 'not-owned' | 'nothing' | 'required' | 'refused';

export type TxResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: TxFailure };

const fail = (reason: TxFailure): TxResult => ({ ok: false, reason });
const done = (state: GameState): TxResult => ({ ok: true, state });
const withVehicle = (s: GameState, patch: Partial<VehicleState>): GameState => ({
  ...s,
  vehicle: { ...s.vehicle, ...patch },
});

const HOME = CITY_BY_ID[START_CITY];

export { cityPrice };

/** Sell all cargo; proceeds clear debt first, the rest becomes credits. */
export function sellCargo(s: GameState, city: CityDef = HOME): TxResult {
  if (s.vehicle.cargo <= 0) return fail('nothing');
  const proceeds = Math.floor(s.vehicle.cargo * city.sellPrice);
  const toDebt = Math.min(s.debt, proceeds);
  return done({
    ...withVehicle(s, { cargo: 0 }),
    debt: s.debt - toDebt,
    credits: s.credits + (proceeds - toDebt),
    flags: { ...s.flags, easyStartOver: true },
  });
}

export function buyPart(s: GameState, partId: string, city: CityDef = HOME): TxResult {
  const part = PARTS[partId];
  if (!part || !city.stock.includes(partId)) return fail('nothing');
  const price = cityPrice(part.price, city);
  if (s.credits < price) return fail('credits');
  const paid = { ...s, credits: s.credits - price };
  if (spareRoom(s) > 0) return done(withVehicle(paid, { owned: [...s.vehicle.owned, partId] }));
  // no room aboard: it is delivered to your garage here, if you have one
  return hasGarage(s, city.id) ? done(stash(paid, city.id, partId)) : fail('slot');
}

/** Fit an owned part into a slot, returning whatever was there to the garage. */
export function fitPart(s: GameState, partId: string, slot: SlotType, index: number): TxResult {
  const at = s.vehicle.owned.indexOf(partId);
  if (at < 0) return fail('not-owned');
  const part = PARTS[partId];
  if (!part || part.slot !== slot) return fail('slot');
  if (!Number.isInteger(index) || index < 0 || index >= HULLS[s.vehicle.hullId].slots[slot]) return fail('slot');

  const slotParts = [...s.vehicle.fitted[slot]];
  while (slotParts.length <= index) slotParts.push(null);
  const previous = slotParts[index];
  slotParts[index] = partId;

  const owned = s.vehicle.owned.filter((_, i) => i !== at);
  if (previous) owned.push(previous);
  return done(clampToCaps(withVehicle(s, { owned, fitted: { ...s.vehicle.fitted, [slot]: slotParts } })));
}

export function unfitPart(s: GameState, slot: SlotType, index: number, city: CityDef = HOME): TxResult {
  const previous = s.vehicle.fitted[slot][index];
  if (!previous) return fail('nothing');
  // a rig with no engine cannot move and one with no tank cannot run: neither can be rescued from the map
  if ((slot === 'engine' || slot === 'tank') && s.vehicle.fitted[slot].filter(Boolean).length <= 1) {
    return fail('required');
  }
  const slotParts = [...s.vehicle.fitted[slot]];
  slotParts[index] = null;
  const removed = withVehicle(s, { fitted: { ...s.vehicle.fitted, [slot]: slotParts } });
  if (spareRoom(s) > 0) return done(clampToCaps(withVehicle(removed, { owned: [...s.vehicle.owned, previous] })));
  return hasGarage(s, city.id) ? done(clampToCaps(stash(removed, city.id, previous))) : fail('slot');
}

/** The gear a new hull leaves the yard with: one basic part of each kind. */
function factoryFit(hullId: HullId): VehicleState['fitted'] {
  const fitted = {} as VehicleState['fitted'];
  for (const slot of SLOT_TYPES) {
    fitted[slot] = Array.from({ length: HULLS[hullId].slots[slot] }, (_, i) => (i === 0 ? `${slot}-1` : null));
  }
  return fitted;
}

/**
 * Buy a bigger hull. The old rig is parked with its parts, in this city's garage or else towed
 * home. Buying the largest hull wins.
 */
export function buyHull(s: GameState, hullId: HullId, city: CityDef = HOME): TxResult {
  const hull = HULLS[hullId];
  if (hull.tier <= HULLS[s.vehicle.hullId].tier) return fail('nothing');
  const price = cityPrice(hull.price, city);
  if (s.credits < price) return fail('credits');

  const garage = hasGarage(s, city.id) ? city.id : HOME_GARAGE;
  const old = {
    id: s.nextEscortId,
    kind: 'rig' as const,
    tier: HULLS[s.vehicle.hullId].tier,
    hp: s.vehicle.hp,
    rig: { hullId: s.vehicle.hullId, fitted: s.vehicle.fitted },
  };
  const next: VehicleState = { ...s.vehicle, hullId, fitted: factoryFit(hullId) };
  const bought: GameState = {
    ...parkVehicle(s, garage, old),
    nextEscortId: s.nextEscortId + 1,
    vehicle: { ...next, hp: vehicleStats(next).maxHp },
    credits: s.credits - price,
    flags: { ...s.flags, won: s.flags.won || hullId === 'juggernaut' },
  };
  return done(clampToCaps(bought));
}

export function buyRepairKit(s: GameState): TxResult {
  if (s.credits < REPAIR_KIT.price) return fail('credits');
  return done({
    ...withVehicle(s, { repairKits: s.vehicle.repairKits + 1 }),
    credits: s.credits - REPAIR_KIT.price,
  });
}

/** Repair as much hull as the credits cover (all of it when affordable). */
export function repairFull(s: GameState, city: CityDef = HOME): TxResult {
  const missing = vehicleStats(s.vehicle).maxHp - s.vehicle.hp;
  if (missing <= 0) return fail('nothing');
  const fullCost = Math.ceil(missing * city.repairPrice);
  if (s.credits >= fullCost) {
    return done({ ...withVehicle(s, { hp: s.vehicle.hp + missing }), credits: s.credits - fullCost });
  }
  const healed = Math.floor(s.credits / city.repairPrice);
  if (healed <= 0) return fail('credits');
  return done({
    ...withVehicle(s, { hp: s.vehicle.hp + healed }),
    credits: s.credits - Math.ceil(healed * city.repairPrice),
  });
}

/** Refuel as much as the credits cover (a full tank when affordable). */
export function refuelFull(s: GameState, city: CityDef = HOME): TxResult {
  const missing = caravanStats(s).tankCap - s.vehicle.fuel;
  if (missing <= 0) return fail('nothing');
  const fullCost = Math.ceil(missing * city.fuelPrice);
  if (s.credits >= fullCost) {
    return done({ ...withVehicle(s, { fuel: s.vehicle.fuel + missing }), credits: s.credits - fullCost });
  }
  const units = Math.floor(s.credits / city.fuelPrice);
  if (units <= 0) return fail('credits');
  return done({
    ...withVehicle(s, { fuel: s.vehicle.fuel + units }),
    credits: s.credits - Math.ceil(units * city.fuelPrice),
  });
}
