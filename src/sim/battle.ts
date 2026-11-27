import { REPAIR_KIT } from '../config/catalog';
import { escortDef, type EscortKind, type Row } from '../config/escorts';
import { caravanStats, isWrecked } from './caravan';
import { crewGun, driverSpeed, isCrewed, leadTopSpeed } from './crew';
import type { GameState } from './game-state';
import type { EnemyRole, Pirate } from './pirates';
import type { Rng } from './rng';
import { addCargo, vehicleStats } from './vehicle';

export type Side = 'player' | 'enemy';

export interface Gun {
  name: string;
  damage: number;
  accuracy: number;
}

export interface Unit {
  uid: string;
  side: Side;
  name: string;
  role: 'lead' | EscortKind | EnemyRole;
  row: Row;
  hp: number;
  maxHp: number;
  armor: number;
  speed: number;
  guns: Gun[];
  longRange: boolean;
  heal: number;
  escortId?: number;
  level?: number;
  /** An allied clan rider: fights for you on auto orders. */
  ally?: boolean;
}

export type OrderType = 'fire' | 'guard' | 'repair' | 'spot' | 'brace' | 'move' | 'kit' | 'flee';

export type Order =
  | { type: 'fire'; target: string }
  | { type: 'guard'; target: string }
  | { type: 'repair'; target: string }
  | { type: 'spot' }
  | { type: 'brace' }
  | { type: 'move' }
  | { type: 'kit' }
  | { type: 'flee' };

export interface BattleState {
  round: number;
  units: Unit[];
  repairKits: number;
  /** Added to the flee chance (scouts). */
  fleeBonus: number;
  log: string[];
  outcome: 'ongoing' | 'won' | 'lost' | 'fled';
  /** Cargo ripped away by harpoon hits during the fight. */
  stolenCargo: number;
  /** Cargo carried when the fight began (harpoons cannot take more). */
  cargoAtStart: number;
}

const MAX_LOG = 30;
const SPOT_BONUS = 0.15;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

export const isAlive = (u: Unit): boolean => u.hp > 0;
export const living = (b: BattleState, side: Side): Unit[] => b.units.filter((u) => u.side === side && isAlive(u));

export function startBattle(s: GameState, enemies: Pirate[], allies: Pirate[] = []): BattleState {
  const stats = vehicleStats(s.vehicle);
  const units: Unit[] = [
    {
      uid: 'lead',
      side: 'player',
      name: 'YOUR RIG',
      role: 'lead',
      row: 'front',
      hp: s.vehicle.hp,
      maxHp: stats.maxHp,
      armor: stats.armor,
      speed: leadTopSpeed(s),
      guns: stats.weapons.map((w) => crewGun(s, 'lead', w)),
      longRange: false,
      heal: 0,
    },
  ];
  for (const e of s.caravan) {
    if (isWrecked(e) || !isCrewed(s, e.id)) continue;
    const def = escortDef(e.kind, e.tier);
    units.push({
      uid: `escort-${e.id}`,
      side: 'player',
      name: def.name,
      role: e.kind,
      row: def.row,
      hp: e.hp,
      maxHp: def.hp,
      armor: def.armor,
      speed: driverSpeed(s, e.id, def.speed),
      guns: def.damage > 0 ? [crewGun(s, e.id, { name: def.name, damage: def.damage, accuracy: def.accuracy })] : [],
      longRange: def.longRange,
      heal: def.heal,
      escortId: e.id,
    });
  }
  allies.forEach((p, i) =>
    units.push({
      uid: `ally-${i}`,
      side: 'player',
      name: p.name,
      role: p.role,
      row: p.row,
      hp: p.hp,
      maxHp: p.maxHp,
      armor: p.armor,
      speed: p.speed,
      guns: [{ name: p.name, damage: p.damage, accuracy: p.accuracy }],
      longRange: p.longRange,
      heal: 0,
      level: p.level,
      ally: true,
    }),
  );
  enemies.forEach((p, i) =>
    units.push({
      uid: `enemy-${i}`,
      side: 'enemy',
      name: p.name,
      role: p.role,
      row: p.row,
      hp: p.hp,
      maxHp: p.maxHp,
      armor: p.armor,
      speed: p.speed,
      guns: [{ name: p.name, damage: p.damage, accuracy: p.accuracy }],
      longRange: p.longRange,
      heal: 0,
      level: p.level,
    }),
  );
  return {
    round: 1,
    units,
    repairKits: s.vehicle.repairKits,
    fleeBonus: caravanStats(s).fleeBonus,
    log: ['Contact! Give your orders.'],
    outcome: 'ongoing',
    stolenCargo: 0,
    cargoAtStart: s.vehicle.cargo,
  };
}

/** Opponents `attacker` can hit: the front row while it stands, unless long range or spotted. */
export function targetsFor(b: BattleState, attacker: Unit, spotted: boolean): Unit[] {
  const foes = living(b, attacker.side === 'player' ? 'enemy' : 'player');
  const front = foes.filter((u) => u.row === 'front');
  return attacker.longRange || spotted || front.length === 0 ? foes : front;
}

/** The orders a unit can be given, in menu order. */
export function ordersFor(b: BattleState, u: Unit): OrderType[] {
  const out: OrderType[] = [];
  if (u.guns.length > 0) out.push('fire');
  if (u.role === 'guardian') out.push('guard');
  if (u.role === 'medic') out.push('repair');
  if (u.role === 'scout') out.push('spot');
  out.push('brace', 'move');
  if (u.role === 'lead') {
    if (b.repairKits > 0) out.push('kit');
    out.push('flee');
  }
  return out;
}

/**
 * Sensible orders for a quick fight: everyone with a gun shoots, guardians cover an ally who is
 * badly hurt, medics patch anyone worn down, scouts spot only when enough guns benefit.
 */
export function autoOrders(b: BattleState): Record<string, Order> {
  const orders: Record<string, Order> = {};
  const mine = living(b, 'player');
  const byNeed = (limit: number): Unit | undefined =>
    mine.filter((u) => u.hp < u.maxHp * limit).sort((a, c) => a.hp / a.maxHp - c.hp / c.maxHp)[0];
  const badlyHurt = byNeed(0.5);
  const wornDown = byNeed(0.7);
  const foesFront = living(b, 'enemy').filter((u) => u.row === 'front');
  const foesBack = living(b, 'enemy').filter((u) => u.row === 'back');
  const shooters = mine.filter((u) => u.guns.length > 0).length;
  for (const u of mine) {
    const target = targetsFor(b, u, false).sort((a, c) => a.hp - c.hp)[0];
    const fire: Order | undefined = u.guns.length > 0 && target ? { type: 'fire', target: target.uid } : undefined;
    if (u.role === 'guardian' && badlyHurt && badlyHurt.uid !== u.uid) {
      orders[u.uid] = { type: 'guard', target: badlyHurt.uid };
    } else if (u.role === 'medic') {
      orders[u.uid] = wornDown ? { type: 'repair', target: wornDown.uid } : { type: 'brace' };
    } else if (u.role === 'scout' && foesFront.length > 0 && foesBack.length > 0 && shooters - 1 >= 3) {
      orders[u.uid] = { type: 'spot' };
    } else {
      orders[u.uid] = fire ?? { type: 'brace' };
    }
  }
  return orders;
}

/** Play one round: your orders in caravan order, then every living enemy attacks. */
export function resolveRound(b: BattleState, orders: Record<string, Order>, rng: Rng): BattleState {
  if (b.outcome !== 'ongoing') return b;
  const units = b.units.map((u) => ({ ...u }));
  const state: BattleState = { ...b, units, log: [...b.log] };
  const log = (line: string): void => {
    state.log.push(line);
  };
  const byUid = (uid: string): Unit | undefined => units.find((u) => u.uid === uid);
  const mine = units.filter((u) => u.side === 'player' && isAlive(u));
  const leadUnit = mine.find((u) => u.role === 'lead');

  // flee is the lead's call and replaces the round
  if (leadUnit && orders[leadUnit.uid]?.type === 'flee') {
    const slowest = Math.min(...mine.map((u) => u.speed));
    const fastest = Math.max(0, ...living(state, 'enemy').map((u) => u.speed));
    const chance = clamp(0.35 + (slowest - fastest) / 100 + b.fleeBonus, 0.1, 0.9);
    if (rng() < chance) {
      log('The caravan breaks away!');
      return finish(state, 'fled');
    }
    log("You can't shake them!");
  }

  const spotted = mine.some((u) => u.role === 'scout' && orders[u.uid]?.type === 'spot');
  if (spotted) log('Scouts mark the targets.');
  const guards = new Map<string, string>(); // protected uid -> guardian uid
  const bracing = new Set<string>();
  for (const u of mine) {
    const o = orders[u.uid];
    if (o?.type === 'guard' && u.role === 'guardian' && byUid(o.target)?.side === 'player') guards.set(o.target, u.uid);
    if (!o || o.type === 'brace') bracing.add(u.uid);
  }

  for (const u of mine) {
    if (!isAlive(u)) continue;
    const o: Order = orders[u.uid] ?? { type: 'brace' };
    switch (o.type) {
      case 'fire': {
        const valid = targetsFor(state, u, spotted);
        let target = valid.find((t) => t.uid === o.target);
        if (!target) target = [...valid].sort((a, c) => a.hp - c.hp)[0];
        if (!target) break;
        for (const gun of u.guns) {
          if (!isAlive(target)) break;
          if (rng() < Math.min(0.95, gun.accuracy + (spotted ? SPOT_BONUS : 0))) {
            const dmg = Math.max(1, gun.damage - target.armor);
            target.hp = Math.max(0, target.hp - dmg);
            log(`${gun.name} hits ${target.name} for ${dmg}.`);
          } else {
            log(`${gun.name} misses.`);
          }
        }
        break;
      }
      case 'repair': {
        const ally = byUid(o.target);
        if (u.role !== 'medic' || !ally || ally.side !== 'player' || !isAlive(ally)) break;
        const before = ally.hp;
        ally.hp = Math.min(ally.maxHp, ally.hp + u.heal);
        log(`${u.name} patches ${ally.name} (+${Math.round(ally.hp - before)}).`);
        break;
      }
      case 'kit':
        if (u.role === 'lead' && state.repairKits > 0) {
          state.repairKits -= 1;
          u.hp = Math.min(u.maxHp, u.hp + REPAIR_KIT.heal);
          log('You patch the hull.');
        }
        break;
      case 'move':
        u.row = u.row === 'front' ? 'back' : 'front';
        log(`${u.name} moves to the ${u.row} row.`);
        break;
      case 'guard': {
        const ally = byUid(o.target);
        if (ally) log(`${u.name} guards ${ally.name}.`);
        break;
      }
      default:
        break;
    }
    if (living(state, 'enemy').length === 0) {
      log('The attackers are finished.');
      return finish(state, 'won');
    }
  }

  // enemies pick on the weakest target they can reach
  for (const e of units.filter((x) => x.side === 'enemy' && isAlive(x))) {
    const target = targetsFor(state, e, false).sort((a, c) => a.hp - c.hp)[0];
    if (!target) break;
    for (const gun of e.guns) {
      if (rng() >= gun.accuracy) {
        log(`${e.name} misses.`);
        continue;
      }
      const guardian = guards.has(target.uid) ? byUid(guards.get(target.uid) as string) : undefined;
      const recipient = guardian && isAlive(guardian) ? guardian : target;
      let dmg = Math.max(1, gun.damage - recipient.armor);
      if (recipient !== target) dmg = Math.ceil(dmg / 2);
      if (bracing.has(recipient.uid)) dmg = Math.ceil(dmg / 2);
      recipient.hp = Math.max(0, recipient.hp - dmg);
      const grab = Math.min(5, (state.cargoAtStart ?? 0) - state.stolenCargo);
      if (e.role === 'harpoon' && recipient === target && grab > 0) {
        state.stolenCargo += grab;
        log(`${e.name} rips away ${Math.round(grab)} cargo!`);
      }
      log(
        recipient === target
          ? `${e.name} hits ${target.name} for ${dmg}.`
          : `${recipient.name} shields ${target.name}, taking ${dmg}.`,
      );
    }
    if (leadUnit && !isAlive(leadUnit)) {
      log('Your rig is dead in the sand.');
      return finish(state, 'lost');
    }
  }

  return { ...state, round: state.round + 1, log: state.log.slice(-MAX_LOG) };
}

function finish(state: BattleState, outcome: BattleState['outcome']): BattleState {
  return { ...state, round: state.round + 1, outcome, log: state.log.slice(-MAX_LOG) };
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

/** Fold a finished battle back into the game: hull for the lead and every escort, kits, loot. */
export function applyBattleResult(
  s: GameState,
  b: BattleState,
  loot: { credits: number; cargo: number },
): GameState {
  if (b.outcome === 'ongoing') return s;
  const leadUnit = b.units.find((u) => u.role === 'lead');
  const caravan = s.caravan.map((e) => {
    const u = b.units.find((x) => x.escortId === e.id);
    return u ? { ...e, hp: u.hp } : e;
  });
  const vehicle = {
    ...s.vehicle,
    hp: leadUnit ? leadUnit.hp : s.vehicle.hp,
    repairKits: b.repairKits,
    cargo: Math.max(0, s.vehicle.cargo - (b.stolenCargo ?? 0)),
  };
  const next: GameState = { ...s, caravan, vehicle };
  if (b.outcome === 'won') {
    const { v } = addCargo(vehicle, loot.cargo, caravanStats(next).cargoCap);
    return { ...next, vehicle: v, credits: s.credits + loot.credits };
  }
  // the winners strip the cargo and every credit you carry; the bank is out of their reach
  if (b.outcome === 'lost') return { ...next, credits: 0, vehicle: { ...vehicle, hp: 0, cargo: 0 } };
  return next;
}
