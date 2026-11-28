import { BALANCE } from '../src/config/balance';
import { CITY_BY_ID } from '../src/config/cities';
import { mineSites } from '../src/sim/barons';
import type { CrewMember } from '../src/sim/crew';
import { newGame, type GameState } from '../src/sim/game-state';
import { shouldGiveUp, type PirateGroup } from '../src/sim/pirate-fleet';
import { canRest, discoverVacant, rest, vacantSites, waitSeconds } from '../src/sim/shelter';
import { Turbo } from '../src/sim/turbo';
import { isPassable, terrainAt } from '../src/sim/terrain';
import { cityPos, nearestCopy, zoneAt } from '../src/sim/world';

const hand = (role: CrewMember['role'], skill: 0 | 1 | 2 | 3, health = 100): CrewMember => ({
  id: skill + health, name: 'A B', role, skill, trait: 'grump', health, face: 1, post: 'lead', owed: 5, missed: 0,
});

test('vacant mines stand on open ground, apart from the barons', () => {
  const vacant = vacantSites(1);
  expect(vacant.length).toBeGreaterThanOrEqual(6);
  for (const v of vacant) {
    expect(isPassable(terrainAt(1, v.x, v.y))).toBe(true);
    expect(isPassable(terrainAt(1, v.exitX, v.exitY))).toBe(true);
    for (const m of mineSites(1)) {
      expect(Math.hypot(m.x - v.x, nearestCopy(m.y, v.y) - v.y)).toBeGreaterThan(300);
    }
  }
});

test('you find a vacant mine by seeing it', () => {
  const s = newGame(1);
  const v = vacantSites(1)[0];
  expect(discoverVacant(s, v.x, v.y, 50)).toEqual([v.id]);
  expect(discoverVacant({ ...s, known: [v.id] }, v.x, v.y, 50)).toEqual([]);
});

test('only mines that do not mind you let you stay', () => {
  expect(canRest('HOSTILE')).toBe(false);
  expect(canRest('WARY')).toBe(false);
  for (const ok of ['NEUTRAL', 'FRIENDLY', 'ALLIED'] as const) expect(canRest(ok)).toBe(true);
});

test('waiting ends with the chosen city alongside, and you come out into the night', () => {
  for (const y of [-500, -40000, 70000]) {
    for (const id of ['ark', 'citadel', 'spire'] as const) {
      const seconds = waitSeconds(100, y, id);
      expect(seconds).toBeGreaterThanOrEqual(0);
      expect(seconds).toBeLessThanOrEqual(BALANCE.WORLD_LEN / BALANCE.SUN_SPEED);
      const city = cityPos(id, 100 + seconds);
      expect(Math.abs(nearestCopy(city.y, y) - y)).toBeLessThan(1);
      expect(['sunset', 'deep', 'predawn']).toContain(zoneAt(y, 100 + seconds));
    }
  }
  expect(CITY_BY_ID.ark).toBeDefined();
});

const hurt = (...crew: CrewMember[]): GameState => {
  const s = newGame(1);
  return { ...s, crew, vehicle: { ...s.vehicle, hp: 0 }, caravan: [{ id: 5, kind: 'tanker', tier: 1, hp: 10 }] };
};

test('resting passes time; mechanics fix vehicles, even wrecked ones, and medics heal', () => {
  const s = rest(hurt(hand('mechanic', 2), hand('driver', 1, 20), hand('medic', 1)), 2000);
  expect(s.t).toBe(2000);
  expect(s.vehicle.hp).toBe(60);
  expect(s.caravan[0].hp).toBe(40);
  expect(s.crew[1].health).toBe(100);
  // no wages for time spent sheltering
  expect(s.crew[0].owed).toBe(5);
});

test('with no mechanic nothing gets repaired, and wounds only close on their own', () => {
  const s = rest(hurt(hand('driver', 2, 20)), 100);
  expect(s.vehicle.hp).toBe(0);
  expect(s.caravan[0].hp).toBe(10);
  expect(s.crew[0].health).toBeCloseTo(23);
});

test('raiders tire of a long chase unless they are right on you', () => {
  const g = (x: number, chased: number): PirateGroup => ({ id: 1, x, y: 0, level: 1, pirates: [], chased });
  const me = { x: 0, y: 0 };
  expect(shouldGiveUp(g(200, 5), me)).toBe(false);
  expect(shouldGiveUp(g(200, 13), me)).toBe(true);
  expect(shouldGiveUp(g(40, 13), me)).toBe(false);
  expect(shouldGiveUp(g(700, 0), me)).toBe(true);
});

test('turbo burns for a few seconds, then needs to recharge', () => {
  const t = new Turbo();
  expect(t.fire(1)).toBe(false); // not enough fuel
  expect(t.fire(10)).toBe(true);
  expect(t.boost).toBe(BALANCE.TURBO_BOOST);
  t.tick(BALANCE.TURBO_SECONDS + 0.1);
  expect(t.boost).toBe(1);
  expect(t.fire(10)).toBe(false);
  expect(t.waiting).toBeGreaterThan(0);
  t.tick(BALANCE.TURBO_RECHARGE);
  expect(t.fire(10)).toBe(true);
});
