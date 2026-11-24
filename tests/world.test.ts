import { BALANCE, NIGHT_LEN } from '../src/config/balance';
import {
  behindSunset,
  cityPosition,
  heatDps,
  nearestCopy,
  scorchDepth,
  secondsUntilDawn,
  sunsetsPassed,
  zoneAt,
} from '../src/sim/world';

const N = NIGHT_LEN;
const L = BALANCE.WORLD_LEN;

test('zones at t=0', () => {
  expect(zoneAt(100, 0)).toBe('sunset');
  expect(zoneAt(0.5 * N, 0)).toBe('deep');
  expect(zoneAt(0.9 * N, 0)).toBe('predawn');
  expect(zoneAt(-100, 0)).toBe('scorch');
  expect(scorchDepth(-100, 0)).toBe(100);
  expect(zoneAt(N + 100, 0)).toBe('dawn');
});

test('sun moves toward -y', () => {
  expect(behindSunset(0, 10)).toBeCloseTo(360);
  expect(zoneAt(-100, 10)).toBe('sunset');
});

test('wrap seam is seamless', () => {
  expect(zoneAt(L - 50, 0)).toBe(zoneAt(-50, 0));
  expect(behindSunset(L + 123, 7)).toBeCloseTo(behindSunset(123, 7));
  expect(nearestCopy(10, L - 5)).toBe(L + 10);
  expect(nearestCopy(L - 10, 3)).toBe(-10);
});

test('heat rises with depth into the day', () => {
  expect(heatDps(100, 0)).toBe(0);
  expect(heatDps(-400, 0)).toBeGreaterThan(heatDps(-50, 0));
});

test('secondsUntilDawn', () => {
  expect(secondsUntilDawn(0, 0)).toBeCloseTo(N / 36);
  expect(secondsUntilDawn(N + 1, 0)).toBe(0);
  expect(secondsUntilDawn(-100, 0)).toBe(Infinity);
});

test('sunsetsPassed steps once per pass', () => {
  expect(sunsetsPassed(-1000, 0)).toBe(0);
  expect(sunsetsPassed(-1000, 1000 / 36 + 0.01)).toBe(1);
  expect(sunsetsPassed(-1000, (1000 + L) / 36 + 0.01)).toBe(2);
});

test('city stays a fixed distance behind the sunset', () => {
  for (const t of [0, 500, 4000]) expect(behindSunset(cityPosition(t).y, t)).toBeCloseTo(0.12 * N);
});
