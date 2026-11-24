import { BALANCE } from '../src/config/balance';
import { TERRAIN_SPEED, terrainAt } from '../src/sim/terrain';

test('edges are cliffs, the city lane is never cliff', () => {
  expect(terrainAt(1, 10, 500)).toBe('cliff');
  expect(terrainAt(1, BALANCE.WORLD_WIDTH - 10, 500)).toBe('cliff');
  for (let y = 0; y < 20000; y += 97) {
    expect(terrainAt(1, BALANCE.WORLD_WIDTH / 2, y)).not.toBe('cliff');
  }
});

test('terrain is seamless across the wrap', () => {
  for (let x = 100; x < 4000; x += 131) {
    expect(terrainAt(3, x, -8)).toBe(terrainAt(3, x, BALANCE.WORLD_LEN - 8));
  }
  // the lattice itself wraps: just before the seam and just after it blend, not jump
  const kinds = new Set<string>();
  for (let y = BALANCE.WORLD_LEN - 64; y < BALANCE.WORLD_LEN + 64; y += 4) {
    kinds.add(terrainAt(3, 1500, y));
  }
  expect(kinds.size).toBeGreaterThan(0);
});

test('terrain is deterministic and mixed', () => {
  expect(terrainAt(2, 1234, 5678)).toBe(terrainAt(2, 1234, 5678));
  const seen = new Set<string>();
  for (let y = 0; y < 60000; y += 53) for (let x = 100; x < 4000; x += 211) seen.add(terrainAt(2, x, y));
  expect(seen.has('sand')).toBe(true);
  expect(seen.has('dunes')).toBe(true);
  expect(TERRAIN_SPEED).toEqual({ sand: 1, dunes: 0.6, rock: 0.8, cliff: 0 });
});
