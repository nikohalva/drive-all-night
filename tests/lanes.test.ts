import { Convoy } from '../src/sim/convoy';
import { clearOffset, collectorLanes, easeOffset, offsetSpot } from '../src/sim/lanes';
import { collect, DepletionMap } from '../src/sim/particles';

const open = () => false;

test('collectors alternate sides, each in its own lane clear of the others', () => {
  const lanes = collectorLanes(29, 8, [8, 8, 12, 16]);
  expect(lanes[0]).toBeGreaterThan(0);
  expect(lanes[1]).toBeLessThan(0);
  expect(lanes[2]).toBeGreaterThan(lanes[0]);
  expect(lanes[3]).toBeLessThan(lanes[1]);
  expect(lanes[0]).toBeGreaterThanOrEqual(29); // vehicles never drive on top of each other
  expect(lanes[2] - lanes[0]).toBeGreaterThanOrEqual(8 + 12); // sweeps do not overlap
  expect(collectorLanes(29, 40, [16])[0]).toBeGreaterThanOrEqual(40 + 16);
});

test('a lane spot sits square to the direction of travel', () => {
  const heading = -Math.PI / 2; // driving up the screen
  const right = offsetSpot({ x: 100, y: 100, heading }, 30);
  expect(right.x).toBeCloseTo(130);
  expect(right.y).toBeCloseTo(100);
  expect(offsetSpot({ x: 100, y: 100, heading }, -30).x).toBeCloseTo(70);
});

test('on open ground a collector takes its whole lane', () => {
  expect(clearOffset({ x: 0, y: 0, heading: -Math.PI / 2 }, 40, open)).toBe(40);
  expect(clearOffset({ x: 0, y: 0, heading: -Math.PI / 2 }, -40, open)).toBe(-40);
});

test('next to a wall it tucks in, and goes back to the column if there is no room', () => {
  const f = { x: 0, y: 0, heading: -Math.PI / 2 };
  const wallAt30 = (x: number) => x >= 30;
  const tucked = clearOffset(f, 40, wallAt30);
  expect(tucked).toBeGreaterThan(0);
  expect(tucked + 8).toBeLessThan(30); // its body stays out of the wall
  expect(clearOffset(f, 40, (x) => x >= 6)).toBe(0);
});

test('it never reaches across a wall to open ground on the far side', () => {
  const f = { x: 0, y: 0, heading: -Math.PI / 2 };
  const thinWall = (x: number) => x >= 20 && x < 28;
  expect(clearOffset(f, 60, thinWall)).toBeLessThan(20);
});

test('swinging out is gradual, tucking in is immediate', () => {
  expect(easeOffset(0, 40, 0.5)).toBeGreaterThan(0);
  expect(easeOffset(0, 40, 0.5)).toBeLessThan(40);
  expect(easeOffset(40, 10, 0.016)).toBe(10);
  expect(easeOffset(40, 0, 0.016)).toBe(0);
  expect(easeOffset(30, -30, 0.016)).toBe(0); // switching sides passes through the column first
});

/** Drive straight up a city lane the way the driving scene does, and total the harvest. */
function harvest(radii: number[]): number {
  const map = new DepletionMap();
  const convoy = new Convoy();
  const lanes = collectorLanes(29, 8, radii);
  let total = 0;
  for (let y = 12000; y > 4000; y -= 1.3) {
    convoy.record(2048, y);
    total += collect(5, map, 2048, y + 11, 8, 0);
    convoy.followers(radii.map((_, i) => 34 * (i + 1))).forEach((f, i) => {
      const p = offsetSpot(f, lanes[i]);
      total += collect(5, map, p.x, p.y, radii[i], 0);
    });
  }
  return total;
}

test('every collector adds a real share of harvest', () => {
  const alone = harvest([]);
  const one = harvest([8]);
  const two = harvest([8, 8]);
  expect(one - alone).toBeGreaterThan(alone * 0.6);
  expect(two - one).toBeGreaterThan(alone * 0.6);
});
