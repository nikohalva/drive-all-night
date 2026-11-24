import { REPAIR_KIT } from '../src/config/catalog';
import {
  applyBattleResult,
  battleLoot,
  startBattle,
  takeTurn,
  type BattleState,
} from '../src/sim/battle';
import { newGame } from '../src/sim/game-state';
import { makePirateGroup } from '../src/sim/pirates';
import { makeRng } from '../src/sim/rng';
import { starterVehicle, vehicleStats } from '../src/sim/vehicle';

const alwaysHit = () => 0;
const alwaysMiss = () => 0.99;

function fresh(level = 1, easy = true): BattleState {
  const v = starterVehicle();
  return startBattle(vehicleStats(v), v, makePirateGroup(() => 0, level, easy));
}

test('the starter vehicle beats an easy-start pirate', () => {
  let wins = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const rng = makeRng(seed);
    const v = starterVehicle();
    let b = startBattle(vehicleStats(v), v, makePirateGroup(rng, 1, true));
    while (b.outcome === 'ongoing') b = takeTurn(b, { type: 'fire', weapon: 0, target: 0 }, rng);
    if (b.outcome === 'won') wins++;
  }
  expect(wins).toBeGreaterThanOrEqual(190);
});

test('battle opens with the player at full strength and the fight undecided', () => {
  const b = fresh();
  expect(b.outcome).toBe('ongoing');
  expect(b.player).toMatchObject({ hp: 60, maxHp: 60, armor: 1, speed: 80, repairKits: 1 });
  expect(b.player.weapons).toHaveLength(1);
  expect(b.enemies).toHaveLength(1);
});

test('firing damages the target by weapon damage minus armor, at least 1', () => {
  const b = fresh(3, false);
  const after = takeTurn(b, { type: 'fire', weapon: 0, target: 0 }, alwaysHit);
  expect(after.enemies[0].hp).toBe(44 - (8 - 1));
  const miss = takeTurn(b, { type: 'fire', weapon: 0, target: 0 }, alwaysMiss);
  expect(miss.enemies[0].hp).toBe(44);
  const tanky = { ...b, enemies: [{ ...b.enemies[0], armor: 99 }] };
  expect(takeTurn(tanky, { type: 'fire', weapon: 0, target: 0 }, alwaysHit).enemies[0].hp).toBe(43);
});

test('turns do not mutate the previous state', () => {
  const b = fresh();
  const frozen = JSON.stringify(b);
  takeTurn(b, { type: 'fire', weapon: 0, target: 0 }, alwaysHit);
  expect(JSON.stringify(b)).toBe(frozen);
});

test('brace halves damage, repair needs a kit', () => {
  const b0 = fresh();
  const braced = takeTurn(b0, { type: 'brace' }, alwaysHit);
  expect(b0.player.hp - braced.player.hp).toBe(Math.ceil((6 - 1) / 2));
  const noKit = takeTurn(
    { ...b0, player: { ...b0.player, repairKits: 0, hp: 10 } },
    { type: 'repair' },
    () => 0.99,
  );
  expect(noKit.player.hp).toBe(10);
});

test('repair uses a kit and heals, capped at max hull', () => {
  const b0 = fresh();
  const hurt = { ...b0, player: { ...b0.player, hp: 10 } };
  const healed = takeTurn(hurt, { type: 'repair' }, alwaysMiss);
  expect(healed.player.hp).toBe(10 + REPAIR_KIT.heal);
  expect(healed.player.repairKits).toBe(0);
  const nearlyFull = { ...b0, player: { ...b0.player, hp: 55 } };
  expect(takeTurn(nearlyFull, { type: 'repair' }, alwaysMiss).player.hp).toBe(60);
});

test('fleeing succeeds on a good roll and ends the fight without a parting shot', () => {
  const b = fresh();
  const fled = takeTurn(b, { type: 'flee' }, alwaysHit);
  expect(fled.outcome).toBe('fled');
  expect(fled.player.hp).toBe(60);
});

test('a failed flee gives the pirates their turn', () => {
  const b = fresh();
  const stuck = takeTurn(b, { type: 'flee' }, (() => {
    const rolls = [0.99, 0];
    return () => rolls.shift() ?? 0;
  })());
  expect(stuck.outcome).toBe('ongoing');
  expect(stuck.player.hp).toBe(60 - 5);
});

test('flee chance is clamped between 10% and 90%', () => {
  const b = fresh();
  const slow = { ...b, player: { ...b.player, speed: 1 } };
  expect(takeTurn(slow, { type: 'flee' }, () => 0.11).outcome).toBe('ongoing');
  const fast = { ...b, player: { ...b.player, speed: 500 } };
  expect(takeTurn(fast, { type: 'flee' }, () => 0.89).outcome).toBe('fled');
  expect(takeTurn(fast, { type: 'flee' }, () => 0.91).outcome).toBe('ongoing');
});

test('killing the last pirate wins before it can shoot back', () => {
  const b = fresh();
  const nearlyDead = { ...b, enemies: [{ ...b.enemies[0], hp: 1 }] };
  const won = takeTurn(nearlyDead, { type: 'fire', weapon: 0, target: 0 }, alwaysHit);
  expect(won.outcome).toBe('won');
  expect(won.player.hp).toBe(60);
});

test('the player loses when hull reaches zero', () => {
  const b = fresh();
  const weak = { ...b, player: { ...b.player, hp: 1 } };
  const lost = takeTurn(weak, { type: 'brace' }, alwaysHit);
  expect(lost.outcome).toBe('lost');
  expect(lost.player.hp).toBe(0);
});

test('a decided fight ignores further turns; bad weapon picks do not cost a turn', () => {
  const b = fresh();
  const over = { ...b, outcome: 'won' as const };
  expect(takeTurn(over, { type: 'brace' }, alwaysHit)).toBe(over);
  expect(takeTurn(b, { type: 'fire', weapon: 9, target: 0 }, alwaysHit)).toBe(b);
});

test('firing at a dead or missing target picks the first living pirate', () => {
  const v = starterVehicle();
  const two = makePirateGroup(() => 0, 6, false);
  const b = startBattle(vehicleStats(v), v, [{ ...two[0], hp: 0 }, two[1]]);
  const after = takeTurn(b, { type: 'fire', weapon: 0, target: 0 }, alwaysHit);
  expect(after.enemies[1].hp).toBeLessThan(two[1].hp);
  const out = takeTurn(b, { type: 'fire', weapon: 0, target: 7 }, alwaysHit);
  expect(out.enemies[1].hp).toBeLessThan(two[1].hp);
});

test('loot scales with pirate level', () => {
  const one = makePirateGroup(() => 0, 1, true);
  expect(battleLoot(one, () => 0)).toEqual({ credits: 30, cargo: 8 });
  const two = makePirateGroup(() => 0, 6, false);
  expect(battleLoot(two, () => 0)).toEqual({ credits: 2 * 30 * 6, cargo: 2 * 8 * 6 });
});

test('winning adds credits and cargo, capped by the hold', () => {
  const s0 = newGame(1);
  const won: BattleState = { ...fresh(), outcome: 'won', player: { ...fresh().player, hp: 41, repairKits: 0 } };
  const r = applyBattleResult(s0, won, { credits: 55, cargo: 500 });
  expect(r.credits).toBe(55);
  expect(r.vehicle.cargo).toBe(60);
  expect(r.vehicle.hp).toBe(41);
  expect(r.vehicle.repairKits).toBe(0);
});

test('fleeing keeps hull and kits but takes no loot', () => {
  const s0 = newGame(1);
  const fled: BattleState = { ...fresh(), outcome: 'fled', player: { ...fresh().player, hp: 33 } };
  const r = applyBattleResult(s0, fled, { credits: 99, cargo: 99 });
  expect(r.vehicle.hp).toBe(33);
  expect(r.credits).toBe(0);
  expect(r.vehicle.cargo).toBe(0);
});

test('losing takes cargo, not fuel', () => {
  const s0 = newGame(1);
  const s = { ...s0, vehicle: { ...s0.vehicle, cargo: 40, fuel: 22 } };
  const lost: BattleState = { ...startBattle(vehicleStats(s.vehicle), s.vehicle, []), outcome: 'lost' };
  const r = applyBattleResult(s, lost, { credits: 0, cargo: 0 });
  expect(r.vehicle).toMatchObject({ cargo: 0, fuel: 22, hp: 0 });
});
