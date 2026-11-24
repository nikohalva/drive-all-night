import { BALANCE, NIGHT_LEN } from '../src/config/balance';
import { baseDensity, collect, DepletionMap } from '../src/sim/particles';

test('density is highest at the sunset and zero by day', () => {
  expect(baseDensity(0)).toBeCloseTo(0.45);
  expect(baseDensity(0.5 * NIGHT_LEN)).toBeLessThan(baseDensity(1000));
  expect(baseDensity(NIGHT_LEN + 1)).toBe(0);
});

test('collected cells stay empty until the next day passes', () => {
  const map = new DepletionMap();
  const got = collect(9, map, 2048, 400, 16, 0);
  expect(got).toBeGreaterThan(0);
  expect(collect(9, map, 2048, 400, 16, 1)).toBe(0);
  const fullDay = BALANCE.WORLD_LEN / BALANCE.SUN_SPEED;
  expect(collect(9, map, 2048, 400, 16, fullDay)).toBeCloseTo(got);
});

test('more X near the sunset than deep in the night', () => {
  const near = collect(4, new DepletionMap(), 2048, 200, 64, 0);
  const deep = collect(4, new DepletionMap(), 2048, 0.6 * NIGHT_LEN, 64, 0);
  expect(near).toBeGreaterThan(deep);
});

test('collecting across the wrap seam works', () => {
  // y = 5 and y = WORLD_LEN + 5 are the same ground; the sweep reaches cells below y = 0
  const a = collect(5, new DepletionMap(), 2048, 5, 16, 0);
  const b = collect(5, new DepletionMap(), 2048, BALANCE.WORLD_LEN + 5, 16, 0);
  expect(a).toBeGreaterThan(0);
  expect(a).toBeCloseTo(b);
  // at t=0 the ground just before the seam is the scorched day side: nothing to collect
  expect(collect(5, new DepletionMap(), 2048, BALANCE.WORLD_LEN - 40, 16, 0)).toBe(0);
});

test('prune drops entries from earlier days only', () => {
  const map = new DepletionMap();
  collect(9, map, 2048, 400, 16, 0);
  map.prune(1);
  expect(collect(9, map, 2048, 400, 16, 1)).toBe(0);
  map.prune(BALANCE.WORLD_LEN / BALANCE.SUN_SPEED);
  expect(collect(9, map, 2048, 400, 16, BALANCE.WORLD_LEN / BALANCE.SUN_SPEED)).toBeGreaterThan(0);
});
