import { BALANCE } from '../src/config/balance';
import { CITY_LANES, LANE_HALF } from '../src/config/cities';
import { SPARE_SLOTS } from '../src/config/holdings';
import { SCENERY_KINDS, WRECK } from '../src/config/desert';
import {
  allWrecks,
  discoverWrecks,
  sceneryIn,
  searchWreck,
  wreckInReach,
} from '../src/sim/desert';
import { newGame, type GameState } from '../src/sim/game-state';
import { deserialize, serialize } from '../src/sim/save';
import { isPassable, terrainAt } from '../src/sim/terrain';

test('scenery is plentiful, deterministic and wraps with the world', () => {
  const view = sceneryIn(1, 1000, 5000, 640, 360);
  expect(view.length).toBeGreaterThan(2);
  expect(sceneryIn(1, 1000, 5000, 640, 360)).toEqual(view);
  const lap = sceneryIn(1, 1000, 5000 + BALANCE.WORLD_LEN, 640, 360);
  expect(lap.map((p) => [p.x, p.y - BALANCE.WORLD_LEN, p.kind])).toEqual(view.map((p) => [p.x, p.y, p.kind]));
  const kinds = new Set(sceneryIn(1, 0, 0, 4096, 6000).map((p) => p.kind));
  expect(kinds.size).toBe(SCENERY_KINDS.length);
});

test('wrecks stand on open ground, off the city lanes', () => {
  const wrecks = allWrecks(1);
  expect(wrecks.length).toBeGreaterThan(100);
  for (const w of wrecks) {
    expect(isPassable(terrainAt(1, w.x, w.y))).toBe(true);
    for (const lane of CITY_LANES) expect(Math.abs(w.x - lane)).toBeGreaterThanOrEqual(LANE_HALF);
  }
});

const first = allWrecks(1)[0];
const beside = (): GameState => {
  const s = newGame(1);
  return { ...s, player: { ...s.player, x: first.x, y: first.y }, vehicle: { ...s.vehicle, fuel: 5 } };
};

test('you can search a wreck only when beside it, also a lap later', () => {
  expect(wreckInReach(beside(), first.x, first.y)?.id).toBe(first.id);
  expect(wreckInReach(beside(), first.x, first.y + BALANCE.WORLD_LEN)?.id).toBe(first.id);
  expect(wreckInReach(beside(), first.x + WRECK.REACH + 5, first.y)).toBeNull();
});

test('searching gives something once, and the same thing every time you try that wreck', () => {
  const a = searchWreck(beside(), first.id);
  expect(a.report.length).toBeGreaterThan(0);
  expect(a.state.wrecks.searched).toEqual([first.id]);
  expect(searchWreck(beside(), first.id)).toEqual(a);
  expect(wreckInReach(a.state, first.x, first.y)).toBeNull();
  expect(searchWreck(a.state, first.id)).toEqual({ state: a.state, report: [] });
});

test('across many wrecks you find fuel, parts and the odd survivor', () => {
  const lines = allWrecks(1)
    .slice(0, 120)
    .flatMap((w) => searchWreck(beside(), w.id).report);
  for (const start of ['FUEL', 'CARGO', 'FOUND', 'A SURVIVOR']) {
    expect(lines.some((l) => l.startsWith(start))).toBe(true);
  }
});

test('nothing is taken that you have no room for', () => {
  const s = beside();
  const full: GameState = {
    ...s,
    vehicle: { ...s.vehicle, fuel: 40, cargo: 60, owned: Array(SPARE_SLOTS.scout).fill('tank-2') },
  };
  for (const w of allWrecks(1).slice(0, 60)) {
    const r = searchWreck(full, w.id);
    expect(r.state.vehicle.fuel).toBe(40);
    expect(r.state.vehicle.cargo).toBe(60);
    expect(r.state.vehicle.owned).toHaveLength(SPARE_SLOTS.scout);
  }
});

test('wrecks in sight are remembered for the map until searched', () => {
  const found = discoverWrecks(beside(), first.x, first.y, 100);
  expect(found.wrecks.found).toContain(first.id);
  expect(discoverWrecks(found, first.x, first.y, 100)).toBe(found);
  expect(searchWreck(found, first.id).state.wrecks.found).not.toContain(first.id);
});

test('wrecks are saved, and an older save gets an empty record', () => {
  const s = searchWreck(beside(), first.id).state;
  expect(deserialize(serialize(s))).toEqual(s);
  const old = JSON.parse(serialize(newGame(1)));
  old.version = 6;
  delete old.wrecks;
  expect(deserialize(JSON.stringify(old))).toEqual(newGame(1));
});
