import { BALANCE, NIGHT_LEN } from '../src/config/balance';
import { mapWindow, placeLabel, toMap } from '../src/sim/map';

const area = { x: 20, y: 20, w: 240, h: 320 };

test('the local window centres on the player, a little ahead', () => {
  const win = mapWindow('local', { x: 2000, y: 50000 }, 0, area);
  expect(win.bottomY - win.topY).toBe(12000);
  expect(win.topY).toBeLessThan(50000 - 6000); // more track shown ahead (toward the sunset)
  const p = toMap(2000, 50000, win);
  expect(p.x).toBeCloseTo(20 + (2000 / BALANCE.WORLD_WIDTH) * 240);
  expect(p.y).toBeGreaterThan(20 + 160);
});

test('the night window runs from the sunset line to the dawn line', () => {
  const win = mapWindow('night', { x: 2000, y: 30000 }, 0, area);
  expect(win.bottomY - win.topY).toBeCloseTo(NIGHT_LEN);
  // at t=0 the sunset line is at y=0 (nearest copy to the player)
  expect(toMap(0, 0, win).y).toBeCloseTo(20);
  expect(toMap(0, NIGHT_LEN, win).y).toBeCloseTo(340);
});

test('places are mapped through the nearest copy, so the wrap never hides them', () => {
  const win = mapWindow('local', { x: 2000, y: 100 }, 0, area);
  const wrapped = toMap(2000, BALANCE.WORLD_LEN + 50, win);
  const plain = toMap(2000, 50, win);
  expect(wrapped.y).toBeCloseTo(plain.y);
});

test('place labels say how far ahead or behind something is', () => {
  expect(placeLabel(10000, 6400)).toBe('3.6K AHEAD');
  expect(placeLabel(10000, 22000)).toBe('12.0K BEHIND');
  expect(placeLabel(10000, 10100)).toBe('HERE');
});
