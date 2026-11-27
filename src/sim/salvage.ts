/** What can be dragged away from a won fight. */
import { PARTS, SLOT_TYPES } from '../config/catalog';
import { CARAVAN_CAP, escortDef, type EscortKind, type Tier } from '../config/escorts';
import { SALVAGE } from '../config/holdings';
import { spareRoom } from './garage';
import type { GameState } from './game-state';
import type { Pirate } from './pirates';
import type { Rng } from './rng';

const KINDS: readonly EscortKind[] = ['gunship', 'guardian', 'scout', 'collector', 'tanker'];

const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)];

export function applySalvage(s: GameState, enemies: readonly Pirate[], rng: Rng): { state: GameState; report: string[] } {
  let state = s;
  const report: string[] = [];
  const level = Math.max(1, ...enemies.map((e) => e.level));

  for (const enemy of enemies) {
    if (rng() >= SALVAGE.PART_CHANCE) continue;
    const tier = enemy.level >= SALVAGE.GOOD_LEVEL && rng() < 0.3 ? 3 : 2;
    const id = `${pick(rng, SLOT_TYPES)}-${tier}`;
    const name = PARTS[id].name.toUpperCase();
    if (spareRoom(state) === 0) {
      report.push(`NO ROOM FOR ${name}`);
      continue;
    }
    state = { ...state, vehicle: { ...state.vehicle, owned: [...state.vehicle.owned, id] } };
    report.push(`SALVAGED ${name}`);
  }

  if (enemies.length > 0 && rng() < SALVAGE.VEHICLE_CHANCE + SALVAGE.VEHICLE_CHANCE_PER_LEVEL * level) {
    const kind = pick(rng, KINDS);
    const tier: Tier = level >= SALVAGE.GOOD_LEVEL ? 2 : 1;
    const def = escortDef(kind, tier);
    if (state.caravan.length >= CARAVAN_CAP[state.vehicle.hullId]) {
      report.push(`NO ROOM FOR A CAPTURED ${def.name}`);
    } else {
      const escort = { id: state.nextEscortId, kind, tier, hp: Math.ceil(def.hp * SALVAGE.VEHICLE_HP) };
      state = { ...state, caravan: [...state.caravan, escort], nextEscortId: state.nextEscortId + 1 };
      report.push(`CAPTURED ${def.name} - IT NEEDS CREW`);
    }
  }
  return { state, report };
}
