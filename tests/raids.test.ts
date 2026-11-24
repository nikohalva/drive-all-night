import { buyEscort } from '../src/sim/caravan';
import { newGame } from '../src/sim/game-state';
import type { PirateGroup } from '../src/sim/pirate-fleet';
import { autoOrders, resolveRound, startBattle } from '../src/sim/battle';
import { makePirateGroup, pirateLevel } from '../src/sim/pirates';
import { makeRng } from '../src/sim/rng';
import { starterVehicle, vehicleStats } from '../src/sim/vehicle';
import {
  baronChancePerSecond,
  isCaravanWeak,
  makeBaronParty,
  makeRobberGroup,
  robberChancePerSecond,
  stepGroundGroup,
} from '../src/sim/raids';

test('robbers trail the cities and prey on the weak', () => {
  expect(robberChancePerSecond('deep', 1000, false, false)).toBeGreaterThan(robberChancePerSecond('deep', 9000, false, false));
  expect(robberChancePerSecond('deep', 1000, true, false)).toBeCloseTo(3 * robberChancePerSecond('deep', 1000, false, false));
  expect(robberChancePerSecond('scorch', 1000, true, false)).toBe(0);
  expect(robberChancePerSecond('dawn', 1000, true, false)).toBe(0);
  expect(robberChancePerSecond('deep', 1000, false, true)).toBeCloseTo(0.25 * robberChancePerSecond('deep', 1000, false, false));
});

test('a caravan is weak with a wrecked escort or a badly hurt lead', () => {
  const s = newGame(1);
  expect(isCaravanWeak(s)).toBe(false);
  expect(isCaravanWeak({ ...s, vehicle: { ...s.vehicle, hp: 20 } })).toBe(true);
  const withEscort = buyEscort({ ...s, credits: 9999 }, 'scout', 1);
  if (!withEscort.ok) throw new Error('buy failed');
  const wrecked = { ...withEscort.state, caravan: withEscort.state.caravan.map((e) => ({ ...e, hp: 0 })) };
  expect(isCaravanWeak(wrecked)).toBe(true);
});

test('only hostile barons send war parties, near their mine, at night', () => {
  expect(baronChancePerSecond('deep', 'HOSTILE', 2000)).toBeGreaterThan(0);
  expect(baronChancePerSecond('deep', 'HOSTILE', 5000)).toBe(0);
  expect(baronChancePerSecond('scorch', 'HOSTILE', 2000)).toBe(0);
  for (const status of ['WARY', 'NEUTRAL', 'FRIENDLY', 'ALLIED'] as const) {
    expect(baronChancePerSecond('deep', status, 2000)).toBe(0);
  }
});

test('robber gangs: buggies and harpoon trucks up front, mortars behind', () => {
  expect(makeRobberGroup(() => 0, 1, true).map((p) => p.role)).toEqual(['buggy']);
  const gang = makeRobberGroup(() => 0, 10, false);
  expect(gang.map((p) => [p.role, p.row, p.longRange])).toEqual([
    ['buggy', 'front', false],
    ['harpoon', 'front', false],
    ['mortar', 'back', true],
  ]);
});

test('baron war parties are heavy, with shades behind and a champion at warlike mines', () => {
  const party = makeBaronParty(() => 0, 9, 'warlike');
  expect(party.map((p) => p.role)).toEqual(['crawler', 'shade', 'champion']);
  const crawler = party[0];
  const pirate = makePirateGroup(() => 0, 9, false)[0];
  expect(crawler.armor).toBeGreaterThan(pirate.armor);
  expect(crawler.hp).toBeGreaterThan(pirate.hp);
  expect(makeBaronParty(() => 0, 9, 'wary').map((p) => p.role)).toEqual(['crawler', 'shade']);
});

test('ground raiders are stopped by terrain but slide along it', () => {
  const g: PirateGroup = { id: 1, x: 0, y: 100, level: 1, pirates: makeRobberGroup(() => 0, 1, true), faction: 'robbers' };
  const free = stepGroundGroup(g, { x: 0, y: 0 }, 1, () => false);
  expect(free.y).toBeLessThan(100);
  const wall = stepGroundGroup(g, { x: 50, y: 0 }, 1, (_x, y) => y < 99); // can't go up, can go sideways
  expect(wall.y).toBe(100);
  expect(wall.x).toBeGreaterThan(0);
  const boxed = stepGroundGroup(g, { x: 50, y: 0 }, 1, () => true);
  expect([boxed.x, boxed.y]).toEqual([0, 100]);
});

test('no war parties hunt you during the easy start', () => {
  expect(baronChancePerSecond('deep', 'HOSTILE', 2000, true)).toBe(0);
  expect(baronChancePerSecond('deep', 'HOSTILE', 2000, false)).toBeGreaterThan(0);
});

test('an unupgraded rig can beat the first war party it meets after the easy start', () => {
  const level = pirateLevel(vehicleStats(starterVehicle()).strength, 0, false);
  let wins = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const rng = makeRng(seed);
    let b = startBattle(newGame(1), makeBaronParty(rng, level, 'warlike'));
    while (b.outcome === 'ongoing') b = resolveRound(b, autoOrders(b), rng);
    if (b.outcome === 'won') wins++;
  }
  expect(wins).toBeGreaterThanOrEqual(140);
});

test('small war parties are a lone crawler; shades join from level 4', () => {
  expect(makeBaronParty(() => 0, 2, 'warlike').map((p) => p.role)).toEqual(['crawler']);
  expect(makeBaronParty(() => 0, 4, 'wary').map((p) => p.role)).toEqual(['crawler', 'shade']);
});
