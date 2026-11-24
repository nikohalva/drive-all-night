import { advance, planetTimeLabel } from '../src/sim/clock';

test('advance clamps huge deltas (tab was hidden)', () => {
  expect(advance(0, 60_000, false)).toBeCloseTo(0.1);
  expect(advance(5, 16, false)).toBeCloseTo(5.016);
  expect(advance(5, 16, true)).toBe(5);
});

test('planetTimeLabel', () => {
  expect(planetTimeLabel((3 * 86400 + 4 * 3600) / 252)).toBe('3D 04H');
  expect(planetTimeLabel(Infinity)).toBe('--');
});
