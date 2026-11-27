import type { HullId } from './catalog';
import type { CityId } from './cities';

/** Spare parts the rig can carry; the rest has to stay in a garage. */
export const SPARE_SLOTS: Record<HullId, number> = { scout: 3, hauler: 6, juggernaut: 10 };

/** Vehicles one garage can hold. */
export const GARAGE_VEHICLES = 6;

/** The garage you start with. */
export const HOME_GARAGE: CityId = 'citadel';

export const GARAGE_PRICE = 3000;
export const GARAGE_RENT = 200;
/** World seconds one rent payment covers. */
export const RENT_SECONDS = 1200;

/** The round amount offered next to "all" at the bank. */
export const BANK_STEP = 500;

export const SALVAGE = {
  /** Chance of a spare part, per enemy beaten. */
  PART_CHANCE: 0.25,
  /** Chance of capturing a vehicle, per fight, plus a little per enemy level. */
  VEHICLE_CHANCE: 0.06,
  VEHICLE_CHANCE_PER_LEVEL: 0.005,
  /** Captured vehicles limp in with this share of their hull. */
  VEHICLE_HP: 0.3,
  /** From this level, loot can be better. */
  GOOD_LEVEL: 8,
} as const;
