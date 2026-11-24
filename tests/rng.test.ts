import { hash2, makeRng } from '../src/sim/rng';

test('makeRng is deterministic per seed', () => {
  const a = makeRng(42);
  const b = makeRng(42);
  expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  expect(makeRng(43)()).not.toBe(makeRng(42)());
});

test('rng and hash2 stay in [0,1)', () => {
  const r = makeRng(1);
  for (let i = 0; i < 1000; i++) {
    const v = r();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  }
  for (let i = 0; i < 1000; i++) {
    const h = hash2(7, i, -i * 3);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(1);
  }
});

test('hash2 is deterministic and seed-sensitive', () => {
  expect(hash2(5, 10, 20)).toBe(hash2(5, 10, 20));
  expect(hash2(5, 10, 20)).not.toBe(hash2(6, 10, 20));
});
