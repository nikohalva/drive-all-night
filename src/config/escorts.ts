import type { HullId } from './catalog';

export type EscortKind = 'collector' | 'gunship' | 'guardian' | 'scout' | 'tanker' | 'medic';
export type Tier = 1 | 2 | 3;
export type Row = 'front' | 'back';

export const ESCORT_KINDS: readonly EscortKind[] = ['collector', 'gunship', 'guardian', 'scout', 'tanker', 'medic'];

export interface EscortDef {
  kind: EscortKind;
  tier: Tier;
  name: string;
  price: number;
  hp: number;
  armor: number;
  /** Top speed on the road; the caravan moves at its slowest vehicle's speed. */
  speed: number;
  cargoCap: number;
  tankCap: number;
  collectRadius: number;
  damage: number;
  accuracy: number;
  /** Can shoot the enemy back row even while their front row stands. */
  longRange: boolean;
  /** Hull points restored by a REPAIR order (medics). */
  heal: number;
  /** Extra range for spotting mines and pirates (scouts). */
  sight: number;
  /** Where it lines up when a battle starts. */
  row: Row;
}

/** How many escorts each lead hull can command. */
export const CARAVAN_CAP: Record<HullId, number> = { scout: 2, hauler: 4, juggernaut: 6 };

/** Extra fuel burned per escort per second at full throttle. */
export const ESCORT_FUEL_PER_SECOND = 0.08;

/** Refund when an escort is sold back to a city. */
export const ESCORT_RESALE = 0.5;

type Row3<T> = [T, T, T];
interface KindSpec {
  name: string;
  row: Row;
  price: Row3<number>;
  hp: Row3<number>;
  armor: Row3<number>;
  speed: Row3<number>;
  cargoCap?: Row3<number>;
  tankCap?: Row3<number>;
  collectRadius?: Row3<number>;
  damage?: Row3<number>;
  accuracy?: Row3<number>;
  longRange?: Row3<boolean>;
  heal?: Row3<number>;
  sight?: Row3<number>;
}

const SPECS: Record<EscortKind, KindSpec> = {
  collector: {
    name: 'DUST SWEEPER',
    row: 'back',
    price: [500, 1400, 3200],
    hp: [30, 50, 80],
    armor: [0, 1, 2],
    speed: [85, 95, 105],
    cargoCap: [60, 120, 220],
    collectRadius: [8, 12, 16],
  },
  gunship: {
    name: 'LANCE GUNSHIP',
    row: 'front',
    price: [900, 2200, 4800],
    hp: [45, 80, 130],
    armor: [1, 2, 4],
    speed: [90, 100, 110],
    damage: [9, 15, 24],
    accuracy: [0.78, 0.78, 0.8],
    longRange: [false, false, true],
  },
  guardian: {
    name: 'BULWARK',
    row: 'front',
    price: [800, 2000, 4400],
    hp: [70, 120, 190],
    armor: [3, 5, 8],
    speed: [75, 85, 95],
    damage: [4, 6, 9],
    accuracy: [0.7, 0.7, 0.72],
  },
  scout: {
    name: 'NIGHT FOX',
    row: 'back',
    price: [600, 1500, 3400],
    hp: [30, 45, 70],
    armor: [0, 1, 2],
    speed: [120, 135, 150],
    damage: [5, 7, 10],
    accuracy: [0.85, 0.85, 0.88],
    sight: [400, 600, 800],
  },
  tanker: {
    name: 'FUEL HAULER',
    row: 'back',
    price: [500, 1300, 3000],
    hp: [40, 70, 110],
    armor: [1, 2, 3],
    speed: [80, 90, 100],
    tankCap: [60, 120, 200],
  },
  medic: {
    name: 'PATCH RIG',
    row: 'back',
    price: [900, 2100, 4600],
    hp: [40, 65, 100],
    armor: [1, 2, 3],
    speed: [85, 95, 105],
    heal: [20, 35, 55],
  },
};

const TIER_NAME = ['', 'MK1', 'MK2', 'MK3'];

export function escortDef(kind: EscortKind, tier: Tier): EscortDef {
  const s = SPECS[kind];
  const i = tier - 1;
  return {
    kind,
    tier,
    name: `${s.name} ${TIER_NAME[tier]}`,
    price: s.price[i],
    hp: s.hp[i],
    armor: s.armor[i],
    speed: s.speed[i],
    cargoCap: s.cargoCap?.[i] ?? 0,
    tankCap: s.tankCap?.[i] ?? 0,
    collectRadius: s.collectRadius?.[i] ?? 0,
    damage: s.damage?.[i] ?? 0,
    accuracy: s.accuracy?.[i] ?? 0,
    longRange: s.longRange?.[i] ?? false,
    heal: s.heal?.[i] ?? 0,
    sight: s.sight?.[i] ?? 0,
    row: s.row,
  };
}

/** One line on what the role is for, shown in the motor pool. */
export const ESCORT_ROLE: Record<EscortKind, string> = {
  collector: 'SWEEPS PARTICLE X, ADDS HOLD',
  gunship: 'HEAVY GUNS',
  guardian: 'ARMOUR. GUARDS AN ALLY',
  scout: 'FAST. SEES FAR. SPOTS TARGETS',
  tanker: 'ADDS FUEL CAPACITY',
  medic: 'REPAIRS ALLIES IN BATTLE',
};
