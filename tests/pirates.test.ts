import { Grace, makePirateGroup, pirateLevel, spawnChancePerSecond } from '../src/sim/pirates';
import { makeRng } from '../src/sim/rng';

test('pirates hunt the sunset band, rarely elsewhere, gently at first', () => {
  expect(spawnChancePerSecond('sunset', 0, false)).toBeGreaterThan(spawnChancePerSecond('deep', 0, false));
  expect(spawnChancePerSecond('predawn', 500, false)).toBe(0);
  expect(spawnChancePerSecond('scorch', 500, false)).toBe(0);
  expect(spawnChancePerSecond('dawn', 500, false)).toBe(0);
  expect(spawnChancePerSecond('sunset', 100, false)).toBeGreaterThan(spawnChancePerSecond('sunset', 0, false));
  expect(spawnChancePerSecond('sunset', 0, true)).toBeCloseTo(0.005);
  expect(spawnChancePerSecond('deep', 0, false)).toBeCloseTo(0.004);
});

test('pirate level follows vehicle strength above the starter and cargo once the easy start is over', () => {
  expect(pirateLevel(8, 0, true)).toBe(1);
  expect(pirateLevel(40, 500, true)).toBe(1);
  expect(pirateLevel(1, 0, false)).toBe(1);
  expect(pirateLevel(8, 0, false)).toBe(1); // the first sale does not make an unupgraded rig's life harder
  expect(pirateLevel(8, 60, false)).toBe(2); // a full starter hold is a modest risk
  expect(pirateLevel(8, 300, false)).toBe(4);
  expect(pirateLevel(20, 0, false)).toBe(7);
  expect(pirateLevel(20, 0, false)).toBeGreaterThan(pirateLevel(8, 0, false));
});

test('pirate stats scale with level', () => {
  const [p1] = makePirateGroup(() => 0, 1, true);
  expect(p1).toMatchObject({ level: 1, hp: 28, maxHp: 28, damage: 6, accuracy: 0.65, armor: 0, speed: 74 });
  const [p3] = makePirateGroup(() => 0, 3, false);
  expect(p3).toMatchObject({ level: 3, hp: 44, damage: 10, armor: 1, speed: 82 });
});

test('group size grows with level and is a single pirate during the easy start', () => {
  expect(makePirateGroup(makeRng(1), 12, true)).toHaveLength(1);
  expect(makePirateGroup(makeRng(1), 5, false)).toHaveLength(1);
  expect(makePirateGroup(makeRng(1), 6, false)).toHaveLength(2);
  expect(makePirateGroup(makeRng(1), 10, false)).toHaveLength(3);
});

test('grace window after a battle', () => {
  const g = new Grace(4);
  expect(g.active).toBe(false);
  g.start();
  expect(g.active).toBe(true);
  g.tick(3.9);
  expect(g.active).toBe(true);
  g.tick(0.2);
  expect(g.active).toBe(false);
});

test('grace defaults to the balance value and can restart', () => {
  const g = new Grace();
  g.start();
  g.tick(3.9);
  expect(g.active).toBe(true);
  g.start();
  g.tick(3.9);
  expect(g.active).toBe(true);
  g.tick(0.2);
  expect(g.active).toBe(false);
});
