import { REPAIR_KIT } from '../src/config/catalog';
import {
  applyBattleResult,
  autoOrders,
  battleLoot,
  ordersFor,
  resolveRound,
  startBattle,
  targetsFor,
  type BattleState,
  type Order,
  type Unit,
} from '../src/sim/battle';
import { buyEscort } from '../src/sim/caravan';
import { buyHull } from '../src/sim/economy';
import { newGame, type GameState } from '../src/sim/game-state';
import { makePirateGroup, type Pirate } from '../src/sim/pirates';
import { makeRng } from '../src/sim/rng';

const hit = () => 0;
const miss = () => 0.99;

function ok(r: { ok: boolean; state?: GameState }): GameState {
  if (!r.ok || !r.state) throw new Error('expected an ok transaction');
  return r.state;
}

/** A hauler leading a guardian, a medic, a scout and a collector. */
function caravanGame(): GameState {
  let s = ok(buyHull({ ...newGame(1), credits: 99999 }, 'hauler'));
  for (const kind of ['guardian', 'medic', 'scout', 'collector'] as const) s = ok(buyEscort(s, kind, 1));
  return s;
}

const unit = (b: BattleState, pred: (u: Unit) => boolean): Unit => {
  const u = b.units.find(pred);
  if (!u) throw new Error('unit not found');
  return u;
};
const lead = (b: BattleState) => unit(b, (u) => u.role === 'lead');
const role = (b: BattleState, r: string) => unit(b, (u) => u.role === r);
const enemies = (b: BattleState) => b.units.filter((u) => u.side === 'enemy');

test('a battle lines up the lead and every working escort', () => {
  let s = caravanGame();
  s = { ...s, caravan: s.caravan.map((e) => (e.kind === 'collector' ? { ...e, hp: 0 } : e)) };
  const b = startBattle(s, makePirateGroup(hit, 6, false));
  const mine = b.units.filter((u) => u.side === 'player');
  expect(mine.map((u) => u.role)).toEqual(['lead', 'guardian', 'medic', 'scout']); // wrecked collector stays out
  expect(lead(b).row).toBe('front');
  expect(role(b, 'guardian').row).toBe('front');
  expect(role(b, 'medic').row).toBe('back');
  expect(enemies(b).map((u) => u.row)).toEqual(['front', 'back']);
  expect(b.repairKits).toBe(1);
  expect(b.outcome).toBe('ongoing');
});

test('the starter rig alone still beats an easy-start pirate', () => {
  let wins = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const rng = makeRng(seed);
    let b = startBattle(newGame(1), makePirateGroup(rng, 1, true));
    while (b.outcome === 'ongoing') b = resolveRound(b, autoOrders(b), rng);
    if (b.outcome === 'won') wins++;
  }
  expect(wins).toBeGreaterThanOrEqual(190);
});

test('the front row shields the back row unless spotted or shooting long range', () => {
  const b = startBattle(newGame(1), makePirateGroup(hit, 6, false));
  const me = lead(b);
  expect(targetsFor(b, me, false).map((u) => u.row)).toEqual(['front']);
  expect(targetsFor(b, me, true).map((u) => u.row)).toEqual(['front', 'back']);
  expect(targetsFor(b, { ...me, longRange: true }, false)).toHaveLength(2);
  const frontDown: BattleState = { ...b, units: b.units.map((u) => (u.side === 'enemy' && u.row === 'front' ? { ...u, hp: 0 } : u)) };
  expect(targetsFor(frontDown, me, false).map((u) => u.row)).toEqual(['back']);
});

test('firing at the back row without a spotter hits the front row instead', () => {
  const b = startBattle(newGame(1), makePirateGroup(hit, 6, false));
  const [front, back] = enemies(b);
  const after = resolveRound(b, { [lead(b).uid]: { type: 'fire', target: back.uid } }, hit);
  expect(enemies(after)[1].hp).toBe(back.hp);
  expect(enemies(after)[0].hp).toBeLessThan(front.hp);
});

test('a spotting scout lets the whole caravan reach the back row', () => {
  const s = caravanGame();
  const b = startBattle(s, makePirateGroup(hit, 6, false));
  const back = enemies(b)[1];
  const orders: Record<string, Order> = {
    [role(b, 'scout').uid]: { type: 'spot' },
    [lead(b).uid]: { type: 'fire', target: back.uid },
  };
  expect(enemies(resolveRound(b, orders, hit))[1].hp).toBeLessThan(back.hp);
});

test('a guardian takes the hits meant for the ally it guards, at half damage', () => {
  const b = startBattle(caravanGame(), makePirateGroup(hit, 1, true));
  const g = role(b, 'guardian');
  const me = lead(b);
  // make the lead the obvious target
  const weak: BattleState = { ...b, units: b.units.map((u) => (u.uid === me.uid ? { ...u, hp: 5 } : u)) };
  const orders: Record<string, Order> = { [g.uid]: { type: 'guard', target: me.uid }, [me.uid]: { type: 'brace' } };
  const after = resolveRound(weak, orders, hit);
  expect(lead(after).hp).toBe(5);
  const pirateDamage = 6; // level 1
  expect(g.hp - role(after, 'guardian').hp).toBe(Math.ceil(Math.max(1, pirateDamage - g.armor) / 2));
});

test('a medic repairs an ally, capped at full hull', () => {
  const b = startBattle(caravanGame(), makePirateGroup(miss, 1, true));
  const me = lead(b);
  const hurt: BattleState = { ...b, units: b.units.map((u) => (u.uid === me.uid ? { ...u, hp: 50 } : u)) };
  const after = resolveRound(hurt, { [role(b, 'medic').uid]: { type: 'repair', target: me.uid } }, miss);
  expect(lead(after).hp).toBe(Math.min(me.maxHp, 50 + 20));
});

test('brace halves incoming damage; a repair kit heals the lead', () => {
  const b = startBattle(newGame(1), makePirateGroup(hit, 1, true));
  const braced = resolveRound(b, { [lead(b).uid]: { type: 'brace' } }, hit);
  expect(lead(b).hp - lead(braced).hp).toBe(Math.ceil((6 - 1) / 2));
  const hurt: BattleState = { ...b, units: b.units.map((u) => (u.role === 'lead' ? { ...u, hp: 10 } : u)) };
  const kitted = resolveRound(hurt, { [lead(b).uid]: { type: 'kit' } }, miss);
  expect(lead(kitted).hp).toBe(10 + REPAIR_KIT.heal);
  expect(kitted.repairKits).toBe(0);
});

test('scouts make fleeing easier', () => {
  const alone = startBattle(newGame(1), makePirateGroup(hit, 1, true));
  const withScout = startBattle(caravanGame(), makePirateGroup(hit, 1, true));
  // the caravan moves at its slowest speed (guardian 75) vs the pirate's 74; one scout adds 10%
  const roll = () => 0.42;
  expect(resolveRound(alone, { [lead(alone).uid]: { type: 'flee' } }, roll).outcome).toBe('ongoing');
  expect(resolveRound(withScout, { [lead(withScout).uid]: { type: 'flee' } }, roll).outcome).toBe('fled');
});

test('the fight is lost when the lead falls, even with escorts standing', () => {
  const b = startBattle(caravanGame(), makePirateGroup(hit, 1, true));
  const dying: BattleState = { ...b, units: b.units.map((u) => (u.role === 'lead' ? { ...u, hp: 1 } : u)) };
  // nobody guards, the pirate goes for the weakest
  expect(resolveRound(dying, {}, hit).outcome).toBe('lost');
});

test('killing the last enemy wins before it can shoot back', () => {
  const b = startBattle(newGame(1), makePirateGroup(hit, 1, true));
  const nearlyDead: BattleState = { ...b, units: b.units.map((u) => (u.side === 'enemy' ? { ...u, hp: 1 } : u)) };
  const won = resolveRound(nearlyDead, autoOrders(nearlyDead), hit);
  expect(won.outcome).toBe('won');
  expect(lead(won).hp).toBe(lead(b).hp);
});

test('unarmed escorts cannot fire; everyone can brace and move', () => {
  const s = caravanGame();
  const b2 = startBattle(s, makePirateGroup(hit, 1, true));
  expect(ordersFor(b2, role(b2, 'medic'))).toEqual(['repair', 'brace', 'move']);
  expect(ordersFor(b2, role(b2, 'guardian'))).toEqual(['fire', 'guard', 'brace', 'move']);
  expect(ordersFor(b2, role(b2, 'scout'))).toEqual(['fire', 'spot', 'brace', 'move']);
  expect(ordersFor(b2, lead(b2))).toEqual(['fire', 'brace', 'move', 'kit', 'flee']);
  expect(ordersFor(b2, role(b2, 'collector'))).toEqual(['brace', 'move']);
});

test('moving swaps a vehicle between the rows', () => {
  const b = startBattle(caravanGame(), makePirateGroup(miss, 1, true));
  const after = resolveRound(b, { [role(b, 'medic').uid]: { type: 'move' } }, miss);
  expect(role(after, 'medic').row).toBe('front');
});

test('a decided fight ignores further rounds', () => {
  const b: BattleState = { ...startBattle(newGame(1), makePirateGroup(hit, 1, true)), outcome: 'won' };
  expect(resolveRound(b, {}, hit)).toBe(b);
});

test('loot scales with level', () => {
  expect(battleLoot(makePirateGroup(hit, 1, true), hit)).toEqual({ credits: 30, cargo: 8 });
  const two: Pirate[] = makePirateGroup(hit, 6, false);
  expect(battleLoot(two, hit)).toEqual({ credits: 2 * 30 * 6, cargo: 2 * 8 * 6 });
});

test('results write hull back to the lead and every escort', () => {
  const s = caravanGame();
  const b = startBattle(s, makePirateGroup(hit, 1, true));
  const g = role(b, 'guardian');
  const fought: BattleState = {
    ...b,
    outcome: 'won',
    repairKits: 0,
    units: b.units.map((u) => (u.uid === g.uid ? { ...u, hp: 0 } : u.role === 'lead' ? { ...u, hp: 77 } : u)),
  };
  const r = applyBattleResult(s, fought, { credits: 55, cargo: 500 });
  expect(r.vehicle.hp).toBe(77);
  expect(r.vehicle.repairKits).toBe(0);
  expect(r.caravan.find((e) => e.kind === 'guardian')?.hp).toBe(0); // wrecked
  expect(r.credits).toBe(s.credits + 55);
  expect(r.vehicle.cargo).toBe(60 + 60); // lead's hold + collector hold
});

test('losing takes the cargo, not the fuel', () => {
  const s0 = newGame(1);
  const s = { ...s0, vehicle: { ...s0.vehicle, cargo: 40, fuel: 22 } };
  const lost: BattleState = { ...startBattle(s, []), outcome: 'lost' };
  const r = applyBattleResult(s, lost, { credits: 0, cargo: 0 });
  expect(r.vehicle).toMatchObject({ cargo: 0, fuel: 22, hp: 0 });
});

test('auto orders press the attack while nobody is badly hurt', () => {
  const b = startBattle(caravanGame(), makePirateGroup(hit, 6, false));
  const auto = autoOrders(b);
  expect(auto[role(b, 'guardian').uid].type).toBe('fire');
  expect(auto[role(b, 'scout').uid].type).toBe('fire'); // only two other guns: not worth spotting
  expect(auto[role(b, 'medic').uid].type).toBe('brace');
});

test('auto orders protect and patch an ally who is badly hurt', () => {
  const b = startBattle(caravanGame(), makePirateGroup(hit, 6, false));
  const me = lead(b);
  const hurt: BattleState = { ...b, units: b.units.map((u) => (u.uid === me.uid ? { ...u, hp: 40 } : u)) };
  const auto = autoOrders(hurt);
  expect(auto[role(b, 'guardian').uid]).toEqual({ type: 'guard', target: me.uid });
  expect(auto[role(b, 'medic').uid]).toEqual({ type: 'repair', target: me.uid });
});

test('a full fight on auto stays short', () => {
  let rounds = 0;
  for (let seed = 1; seed <= 50; seed++) {
    const rng = makeRng(seed);
    let b = startBattle(caravanGame(), makePirateGroup(rng, 3, false));
    while (b.outcome === 'ongoing' && b.round < 60) b = resolveRound(b, autoOrders(b), rng);
    rounds += b.round;
  }
  expect(rounds / 50).toBeLessThan(10);
});
