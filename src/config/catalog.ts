export type SlotType = 'engine' | 'tank' | 'collector' | 'cargo' | 'armor' | 'weapon';
export type HullId = 'scout' | 'hauler' | 'juggernaut';

export const SLOT_TYPES: readonly SlotType[] = ['engine', 'tank', 'collector', 'cargo', 'armor', 'weapon'];

export interface Hull {
  id: HullId;
  name: string;
  tier: 1 | 2 | 3;
  price: number;
  baseHp: number;
  slots: Record<SlotType, number>;
}

export interface PartStats {
  topSpeed?: number;
  accel?: number;
  tankCap?: number;
  collectRadius?: number;
  cargoCap?: number;
  armor?: number;
  hpBonus?: number;
  damage?: number;
  accuracy?: number;
}

export interface Part {
  id: string;
  name: string;
  slot: SlotType;
  tier: 1 | 2 | 3;
  price: number;
  stats: PartStats;
}

export const HULLS: Record<HullId, Hull> = {
  scout: {
    id: 'scout',
    name: 'Scout',
    tier: 1,
    price: 0,
    baseHp: 60,
    slots: { engine: 1, tank: 1, collector: 1, cargo: 1, armor: 1, weapon: 1 },
  },
  hauler: {
    id: 'hauler',
    name: 'Hauler',
    tier: 2,
    price: 4000,
    baseHp: 140,
    slots: { engine: 1, tank: 1, collector: 2, cargo: 1, armor: 1, weapon: 2 },
  },
  juggernaut: {
    id: 'juggernaut',
    name: 'Juggernaut',
    tier: 3,
    price: 15000,
    baseHp: 300,
    slots: { engine: 1, tank: 1, collector: 3, cargo: 2, armor: 2, weapon: 3 },
  },
};

const part = (
  id: string,
  name: string,
  slot: SlotType,
  tier: 1 | 2 | 3,
  price: number,
  stats: PartStats,
): [string, Part] => [id, { id, name, slot, tier, price, stats }];

export const PARTS: Record<string, Part> = Object.fromEntries([
  part('engine-1', 'Sand Runner', 'engine', 1, 0, { topSpeed: 80, accel: 60 }),
  part('engine-2', 'Dune Hammer', 'engine', 2, 600, { topSpeed: 105, accel: 80 }),
  part('engine-3', 'Dusk Chaser', 'engine', 3, 2200, { topSpeed: 130, accel: 100 }),
  part('tank-1', 'Jerry Cell', 'tank', 1, 0, { tankCap: 40 }),
  part('tank-2', 'Dune Drum', 'tank', 2, 400, { tankCap: 80 }),
  part('tank-3', 'Void Reservoir', 'tank', 3, 1500, { tankCap: 140 }),
  part('collector-1', 'Sweeper Bar', 'collector', 1, 0, { collectRadius: 8 }),
  part('collector-2', 'Wide Sweeper', 'collector', 2, 500, { collectRadius: 12 }),
  part('collector-3', 'Ion Rake', 'collector', 3, 1800, { collectRadius: 18 }),
  part('cargo-1', 'Hopper', 'cargo', 1, 0, { cargoCap: 60 }),
  part('cargo-2', 'Bulk Hold', 'cargo', 2, 700, { cargoCap: 140 }),
  part('cargo-3', 'Vault Bay', 'cargo', 3, 2500, { cargoCap: 300 }),
  part('armor-1', 'Plate Skirt', 'armor', 1, 0, { armor: 1, hpBonus: 0 }),
  part('armor-2', 'Ablative Shell', 'armor', 2, 900, { armor: 3, hpBonus: 20 }),
  part('armor-3', 'Bastion Armor', 'armor', 3, 3000, { armor: 6, hpBonus: 50 }),
  part('weapon-1', 'Pulse Gun', 'weapon', 1, 0, { damage: 8, accuracy: 0.8 }),
  part('weapon-2', 'Twin Autocannon', 'weapon', 2, 1200, { damage: 14, accuracy: 0.75 }),
  part('weapon-3', 'Arc Lance', 'weapon', 3, 3500, { damage: 24, accuracy: 0.7 }),
]);

export const REPAIR_KIT = { price: 60, heal: 40 } as const;
