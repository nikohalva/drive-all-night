import { REPAIR_KIT } from '../config/catalog';
import type { GameState } from './game-state';
import type { Pirate } from './pirates';
import type { Rng } from './rng';
import { addCargo, type VehicleState, type VehicleStats, type WeaponStats } from './vehicle';

export type Action =
  | { type: 'fire'; weapon: number; target: number }
  | { type: 'brace' }
  | { type: 'repair' }
  | { type: 'flee' };

export interface BattleState {
  round: number;
  player: {
    hp: number;
    maxHp: number;
    armor: number;
    speed: number;
    weapons: WeaponStats[];
    repairKits: number;
  };
  enemies: Pirate[];
  log: string[];
  outcome: 'ongoing' | 'won' | 'lost' | 'fled';
}

const MAX_LOG = 20;

export function startBattle(stats: VehicleStats, v: VehicleState, enemies: Pirate[]): BattleState {
  return {
    round: 1,
    player: {
      hp: v.hp,
      maxHp: stats.maxHp,
      armor: stats.armor,
      speed: stats.topSpeed,
      weapons: stats.weapons.map((w) => ({ ...w })),
      repairKits: v.repairKits,
    },
    enemies: enemies.map((e) => ({ ...e })),
    log: ['Pirates attack!'],
    outcome: 'ongoing',
  };
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** One round: the player acts, then every living pirate shoots back. */
export function takeTurn(b: BattleState, a: Action, rng: Rng): BattleState {
  if (b.outcome !== 'ongoing') return b;

  const player = { ...b.player };
  const enemies = b.enemies.map((e) => ({ ...e }));
  const log = [...b.log];
  let braced = false;

  switch (a.type) {
    case 'fire': {
      const weapon = player.weapons[a.weapon];
      if (!weapon) return b;
      let target = enemies[a.target];
      if (!target || target.hp <= 0) target = enemies.find((e) => e.hp > 0) as Pirate;
      if (target) {
        if (rng() < weapon.accuracy) {
          const dmg = Math.max(1, weapon.damage - target.armor);
          target.hp = Math.max(0, target.hp - dmg);
          log.push(`${weapon.name} hits ${target.name} for ${dmg}.`);
        } else {
          log.push(`${weapon.name} misses ${target.name}.`);
        }
      }
      break;
    }
    case 'brace':
      braced = true;
      log.push('You brace for impact.');
      break;
    case 'repair':
      if (player.repairKits > 0) {
        player.repairKits -= 1;
        player.hp = Math.min(player.maxHp, player.hp + REPAIR_KIT.heal);
        log.push('You patch the hull.');
      } else {
        log.push('No repair kits left!');
      }
      break;
    case 'flee': {
      const fastest = Math.max(0, ...enemies.filter((e) => e.hp > 0).map((e) => e.speed));
      const chance = clamp(0.35 + (player.speed - fastest) / 100, 0.1, 0.9);
      if (rng() < chance) {
        log.push('You break away!');
        return { ...b, player, enemies, log: log.slice(-MAX_LOG), outcome: 'fled' };
      }
      log.push("You can't shake them!");
      break;
    }
  }

  if (enemies.every((e) => e.hp <= 0)) {
    log.push('The pirates are finished.');
    return { ...b, round: b.round + 1, player, enemies, log: log.slice(-MAX_LOG), outcome: 'won' };
  }

  let outcome: BattleState['outcome'] = 'ongoing';
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    if (rng() < enemy.accuracy) {
      let dmg = Math.max(1, enemy.damage - player.armor);
      if (braced) dmg = Math.ceil(dmg / 2);
      player.hp = Math.max(0, player.hp - dmg);
      log.push(`${enemy.name} hits you for ${dmg}.`);
    } else {
      log.push(`${enemy.name} misses.`);
    }
    if (player.hp <= 0) {
      outcome = 'lost';
      log.push('Your rig is dead in the sand.');
      break;
    }
  }

  return { ...b, round: b.round + 1, player, enemies, log: log.slice(-MAX_LOG), outcome };
}

export function battleLoot(enemies: Pirate[], rng: Rng): { credits: number; cargo: number } {
  let credits = 0;
  let cargo = 0;
  for (const e of enemies) {
    credits += 30 * e.level + Math.floor(rng() * 20 * e.level);
    cargo += 8 * e.level;
  }
  return { credits, cargo };
}

/** Fold a finished battle back into the game state. */
export function applyBattleResult(
  s: GameState,
  b: BattleState,
  loot: { credits: number; cargo: number },
): GameState {
  const carried = { ...s.vehicle, hp: b.player.hp, repairKits: b.player.repairKits };
  switch (b.outcome) {
    case 'won': {
      const { v } = addCargo(carried, loot.cargo);
      return { ...s, vehicle: v, credits: s.credits + loot.credits };
    }
    case 'fled':
      return { ...s, vehicle: carried };
    case 'lost':
      return { ...s, vehicle: { ...carried, hp: 0, cargo: 0 } };
    default:
      return s;
  }
}
