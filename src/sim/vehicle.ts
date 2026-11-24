import { BALANCE } from '../config/balance';
import { HULLS, PARTS, SLOT_TYPES, type HullId, type Part, type SlotType } from '../config/catalog';

export interface VehicleState {
  hullId: HullId;
  /** Part ids per slot type; null is an empty slot. */
  fitted: Record<SlotType, (string | null)[]>;
  /** Owned parts that are not fitted. */
  owned: string[];
  hp: number;
  fuel: number;
  cargo: number;
  repairKits: number;
}

export interface WeaponStats {
  name: string;
  damage: number;
  accuracy: number;
}

export interface VehicleStats {
  maxHp: number;
  topSpeed: number;
  accel: number;
  tankCap: number;
  collectRadius: number;
  cargoCap: number;
  armor: number;
  weapons: WeaponStats[];
  strength: number;
}

function fittedParts(v: VehicleState, slot?: SlotType): Part[] {
  const slots = slot ? [slot] : SLOT_TYPES;
  const out: Part[] = [];
  for (const s of slots) {
    for (const id of v.fitted[s]) {
      if (id && PARTS[id]) out.push(PARTS[id]);
    }
  }
  return out;
}

export function starterVehicle(): VehicleState {
  const v: VehicleState = {
    hullId: 'scout',
    fitted: {
      engine: ['engine-1'],
      tank: ['tank-1'],
      collector: ['collector-1'],
      cargo: ['cargo-1'],
      armor: ['armor-1'],
      weapon: ['weapon-1'],
    },
    owned: [],
    hp: 0,
    fuel: 0,
    cargo: 0,
    repairKits: 1,
  };
  const stats = vehicleStats(v);
  return { ...v, hp: stats.maxHp, fuel: stats.tankCap };
}

export function vehicleStats(v: VehicleState): VehicleStats {
  const hull = HULLS[v.hullId];
  const all = fittedParts(v);
  const sum = (key: 'tankCap' | 'cargoCap' | 'armor' | 'hpBonus'): number =>
    all.reduce((n, p) => n + (p.stats[key] ?? 0), 0);

  const engines = fittedParts(v, 'engine');
  const bestEngine = engines.reduce<Part | null>(
    (best, p) => (!best || (p.stats.topSpeed ?? 0) > (best.stats.topSpeed ?? 0) ? p : best),
    null,
  );

  const radii = fittedParts(v, 'collector')
    .map((p) => p.stats.collectRadius ?? 0)
    .sort((a, b) => b - a);
  const collectRadius = radii.length ? radii[0] + 4 * (radii.length - 1) : 0;

  return {
    maxHp: hull.baseHp + sum('hpBonus'),
    topSpeed: bestEngine?.stats.topSpeed ?? 0,
    accel: bestEngine?.stats.accel ?? 0,
    tankCap: sum('tankCap'),
    collectRadius,
    cargoCap: sum('cargoCap'),
    armor: sum('armor'),
    weapons: fittedParts(v, 'weapon').map((p) => ({
      name: p.name,
      damage: p.stats.damage ?? 0,
      accuracy: p.stats.accuracy ?? 0,
    })),
    strength: 2 * hull.tier + all.reduce((n, p) => n + p.tier, 0),
  };
}

/** Burn fuel for `seconds` at `throttle` (-1..1); bigger hulls burn more. */
export function burnFuel(v: VehicleState, throttle: number, seconds: number, extraPerSecond = 0): VehicleState {
  const burn = (BALANCE.FUEL_PER_SECOND * HULLS[v.hullId].tier + extraPerSecond) * Math.abs(throttle) * seconds;
  return { ...v, fuel: Math.max(0, v.fuel - burn) };
}

export function addCargo(
  v: VehicleState,
  amount: number,
  cargoCap = vehicleStats(v).cargoCap,
): { v: VehicleState; added: number } {
  const room = Math.max(0, cargoCap - v.cargo);
  const added = Math.max(0, Math.min(amount, room));
  return { v: { ...v, cargo: v.cargo + added }, added };
}

/** Move as much cargo as fits into the fuel tank. */
export function transferToTank(v: VehicleState, tankCap = vehicleStats(v).tankCap): VehicleState {
  const room = Math.max(0, tankCap - v.fuel);
  const moved = Math.min(room, v.cargo);
  return { ...v, fuel: v.fuel + moved, cargo: v.cargo - moved };
}

export function isBroken(v: VehicleState): boolean {
  return v.hp <= 0 || v.fuel <= 0;
}
