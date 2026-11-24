import { BALANCE } from '../src/config/balance';
import { CITY_LANES, LANE_HALF } from '../src/config/cities';
import {
  RIFT_SPACING,
  TERRAIN_SPEED,
  isPassable,
  nearestPassable,
  riftAt,
  terrainAt,
  type Terrain,
} from '../src/sim/terrain';

const L = BALANCE.WORLD_LEN;

test('the band edges are cliffs', () => {
  expect(terrainAt(1, 10, 500)).toBe('cliff');
  expect(terrainAt(1, BALANCE.WORLD_WIDTH - 10, 500)).toBe('cliff');
});

test('every city lane is passable along the whole planet', () => {
  for (const lane of CITY_LANES) {
    for (let y = 0; y < L; y += 37) {
      for (const dx of [-LANE_HALF + 1, 0, LANE_HALF - 1]) {
        expect(isPassable(terrainAt(1, lane + dx, y))).toBe(true);
      }
    }
  }
});

test('terrain is seamless across the wrap', () => {
  for (let x = 100; x < 4000; x += 37) {
    for (const y of [-8, -400, -2399]) expect(terrainAt(3, x, y)).toBe(terrainAt(3, x, L + y));
  }
});

test('terrain is deterministic and the new features all appear', () => {
  expect(terrainAt(2, 1234, 5678)).toBe(terrainAt(2, 1234, 5678));
  const counts: Record<string, number> = {};
  let samples = 0;
  for (let y = 0; y < L; y += 53) {
    for (let x = 100; x < 4000; x += 97) {
      const t = terrainAt(2, x, y);
      counts[t] = (counts[t] ?? 0) + 1;
      samples++;
    }
  }
  for (const kind of ['sand', 'dunes', 'rock', 'mountain', 'canyon', 'mesa'] as Terrain[]) {
    expect(counts[kind] ?? 0).toBeGreaterThan(0);
  }
  const blocked = ((counts.mountain ?? 0) + (counts.canyon ?? 0) + (counts.mesa ?? 0)) / samples;
  expect(blocked).toBeGreaterThan(0.04); // the desert has real obstacles
  expect(blocked).toBeLessThan(0.25); // but most of it is still open
});

test('impassable kinds stop you, the rest only slow you', () => {
  expect(TERRAIN_SPEED).toEqual({ sand: 1, dunes: 0.6, rock: 0.8, cliff: 0, mountain: 0, canyon: 0, mesa: 0 });
  for (const kind of ['cliff', 'mountain', 'canyon', 'mesa'] as Terrain[]) expect(isPassable(kind)).toBe(false);
  for (const kind of ['sand', 'dunes', 'rock'] as Terrain[]) expect(isPassable(kind)).toBe(true);
});

test('canyons run across the band on a fixed spacing that divides the world', () => {
  expect(L % RIFT_SPACING).toBe(0);
  const existing = Array.from({ length: L / RIFT_SPACING }, (_, k) => riftAt(4, k)).filter((r) => r.exists);
  expect(existing.length).toBeGreaterThan(10);
  // a rift blocks most of the width it crosses
  const r = existing[0];
  let blockedColumns = 0;
  let columns = 0;
  for (let x = 200; x < BALANCE.WORLD_WIDTH - 200; x += 50) {
    columns++;
    let hit = false;
    for (let y = r.top - 10; y < r.bottom + 10; y += 4) if (terrainAt(4, x, y) === 'canyon') hit = true;
    if (hit) blockedColumns++;
  }
  expect(blockedColumns / columns).toBeGreaterThan(0.5);
});

test('every canyon has a pass in every stretch, so you can always get through', () => {
  for (let k = 0; k < L / RIFT_SPACING; k++) {
    const r = riftAt(5, k);
    if (!r.exists) continue;
    expect(r.passes.length).toBeGreaterThanOrEqual(Math.floor(BALANCE.WORLD_WIDTH / 700) - 1);
    for (const px of r.passes) {
      for (let y = r.top - 20; y < r.bottom + 20; y += 2) expect(terrainAt(5, px, y)).not.toBe('canyon');
    }
  }
});

test('nearestPassable finds open ground next to a blocked spot, and leaves open ground alone', () => {
  let blocked: { x: number; y: number } | null = null;
  for (let y = 0; y < L && !blocked; y += 97) {
    for (let x = 300; x < 3800; x += 53) {
      if (!isPassable(terrainAt(9, x, y))) {
        blocked = { x, y };
        break;
      }
    }
  }
  if (!blocked) throw new Error('no blocked ground found');
  const p = nearestPassable(9, blocked.x, blocked.y);
  expect(isPassable(terrainAt(9, p.x, p.y))).toBe(true);
  expect(nearestPassable(9, CITY_LANES[1], 500)).toEqual({ x: CITY_LANES[1], y: 500 });
});
