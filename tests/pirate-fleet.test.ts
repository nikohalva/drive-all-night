import { BALANCE } from '../src/config/balance';
import {
  GIVE_UP_DISTANCE,
  SPAWN_DISTANCE,
  WARN_DISTANCE,
  groupCap,
  groupSpeed,
  inContact,
  maybeSpawnGroup,
  shouldGiveUp,
  stepGroup,
  type FleetContext,
  type PirateGroup,
} from '../src/sim/pirate-fleet';
import { makePirateGroup } from '../src/sim/pirates';

const player = { x: 2000, y: 50000 };
const ctx: FleetContext = { zone: 'sunset', cargo: 0, strength: 8, easy: true, graceActive: false, helpless: false };
const always = () => 0;
const never = () => 0.999;

function group(overrides: Partial<PirateGroup> = {}): PirateGroup {
  return { id: 1, x: 2000, y: 49000, level: 1, pirates: makePirateGroup(always, 1, true), ...overrides };
}

test('the easy start allows one group on the map, later two', () => {
  expect(groupCap(true)).toBe(1);
  expect(groupCap(false)).toBe(2);
});

test('a group spawns when the roll is lucky, in the sunset band', () => {
  const g = maybeSpawnGroup(always, [], player, ctx, 7);
  expect(g).not.toBeNull();
  expect(g?.id).toBe(7);
  expect(g?.level).toBe(1);
  expect(g?.pirates).toHaveLength(1);
});

test('no group spawns on an unlucky roll', () => {
  expect(maybeSpawnGroup(never, [], player, ctx, 1)).toBeNull();
});

test('pirates only come where the spawn table says', () => {
  for (const zone of ['predawn', 'scorch', 'dawn'] as const) {
    expect(maybeSpawnGroup(always, [], player, { ...ctx, zone }, 1)).toBeNull();
  }
  expect(maybeSpawnGroup(always, [], player, { ...ctx, zone: 'deep' }, 1)).not.toBeNull();
});

test('grace after a battle blocks spawns', () => {
  expect(maybeSpawnGroup(always, [], player, { ...ctx, graceActive: true }, 1)).toBeNull();
});

test('the group cap blocks spawns', () => {
  expect(maybeSpawnGroup(always, [group()], player, ctx, 2)).toBeNull();
  const late = { ...ctx, easy: false };
  expect(maybeSpawnGroup(always, [group()], player, late, 2)).not.toBeNull();
  expect(maybeSpawnGroup(always, [group(), group({ id: 2 })], player, late, 3)).toBeNull();
});

test('a group appears about 220px toward the sunset and within 120px either side', () => {
  const low = maybeSpawnGroup(always, [], player, ctx, 1);
  expect(low?.y).toBe(player.y - SPAWN_DISTANCE);
  expect(low?.x).toBe(player.x - 120);
  const high = maybeSpawnGroup(() => 0.999, [], player, { ...ctx, zone: 'sunset', cargo: 1e9 }, 1);
  expect(high?.x).toBeGreaterThan(player.x + 100);
  expect(high?.x).toBeLessThanOrEqual(player.x + 120);
});

test('spawns are kept off the cliff walls', () => {
  const left = maybeSpawnGroup(always, [], { x: 70, y: 50000 }, ctx, 1);
  expect(left?.x).toBeGreaterThanOrEqual(BALANCE.EDGE + 20);
  const right = maybeSpawnGroup(() => 0.999, [], { x: BALANCE.WORLD_WIDTH - 70, y: 50000 }, { ...ctx, cargo: 1e9 }, 1);
  expect(right?.x).toBeLessThanOrEqual(BALANCE.WORLD_WIDTH - BALANCE.EDGE - 20);
});

test('once the easy start is over pirates scale with the rig and its cargo', () => {
  const hard = { ...ctx, easy: false, strength: 28, cargo: 200 };
  const g = maybeSpawnGroup(always, [], player, hard, 1);
  expect(g?.level).toBe(13);
  expect(g?.pirates).toHaveLength(3);
});

test('a helpless rig (hull at zero) draws no new pirates', () => {
  expect(maybeSpawnGroup(always, [], player, { ...ctx, helpless: true }, 1)).toBeNull();
  expect(maybeSpawnGroup(always, [], player, { ...ctx, helpless: false }, 1)).not.toBeNull();
});

test('a group closes in at 80% of its fastest pirate', () => {
  const g = group();
  expect(groupSpeed(g)).toBeCloseTo(0.8 * 74);
  const next = stepGroup(g, player, 1);
  const before = Math.hypot(player.x - g.x, player.y - g.y);
  const after = Math.hypot(player.x - next.x, player.y - next.y);
  expect(before - after).toBeCloseTo(0.8 * 74);
});

test('the starter rig at full speed can outrun every early pirate group', () => {
  for (let level = 1; level <= 7; level++) {
    const g = group({ level, pirates: makePirateGroup(always, level, false) });
    expect(groupSpeed(g)).toBeLessThan(80);
  }
});

test('a group never overshoots its target', () => {
  const g = group({ x: player.x, y: player.y - 5 });
  const next = stepGroup(g, player, 10);
  expect(next.x).toBeCloseTo(player.x);
  expect(next.y).toBeCloseTo(player.y);
});

test('contact, warning and giving up are distance checks', () => {
  expect(inContact(group({ y: player.y - BALANCE.CONTACT_RADIUS }), player)).toBe(true);
  expect(inContact(group({ y: player.y - BALANCE.CONTACT_RADIUS - 1 }), player)).toBe(false);
  expect(shouldGiveUp(group({ y: player.y - GIVE_UP_DISTANCE - 1 }), player)).toBe(true);
  expect(shouldGiveUp(group({ y: player.y - GIVE_UP_DISTANCE + 1 }), player)).toBe(false);
  expect(WARN_DISTANCE).toBe(160);
});
