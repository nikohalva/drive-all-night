import {
  forwardSpeed,
  speedOf,
  stepDriving,
  type DriveEnv,
  type DriveInput,
  type Kinematics,
} from '../src/sim/driving';

const stats = { topSpeed: 80, accel: 60 };
const free: DriveEnv = { blocked: () => false, terrainSpeed: () => 1 };
const still: Kinematics = { x: 1000, y: 1000, heading: -Math.PI / 2, vx: 0, vy: 0 };
const gas: DriveInput = { throttle: 1, steer: 0 };
const coast: DriveInput = { throttle: 0, steer: 0 };

function run(k: Kinematics, input: DriveInput, seconds: number, env: DriveEnv = free): Kinematics {
  const frames = Math.round(seconds * 60);
  for (let i = 0; i < frames; i++) k = stepDriving(k, input, 1 / 60, stats, env);
  return k;
}

test('full throttle reaches top speed and stays there', () => {
  const k = run(still, gas, 10);
  expect(speedOf(k)).toBeGreaterThan(79.5);
  expect(speedOf(k)).toBeLessThanOrEqual(80.01);
  expect(k.y).toBeLessThan(1000); // heading -PI/2 is up the screen
});

test('terrain caps the speed', () => {
  const dunes: DriveEnv = { blocked: () => false, terrainSpeed: () => 0.6 };
  const k = run(still, gas, 10, dunes);
  expect(speedOf(k)).toBeGreaterThan(47.5);
  expect(speedOf(k)).toBeLessThanOrEqual(48.01);
});

test('entering slow ground slows you gradually, not instantly', () => {
  const fast = run(still, gas, 5);
  const dunes: DriveEnv = { blocked: () => false, terrainSpeed: () => 0.6 };
  const next = stepDriving(fast, gas, 1 / 60, stats, dunes);
  expect(speedOf(next)).toBeGreaterThan(70);
  expect(speedOf(next)).toBeLessThan(speedOf(fast));
});

test('reverse tops out at 40% of the forward cap', () => {
  const k = run(still, { throttle: -1, steer: 0 }, 10);
  expect(forwardSpeed(k)).toBeLessThan(-31.5);
  expect(forwardSpeed(k)).toBeGreaterThan(-32.01);
});

test('braking stops you faster than coasting', () => {
  const moving = run(still, gas, 5);
  const braked = run(moving, { throttle: -1, steer: 0 }, 0.5);
  const coasted = run(moving, coast, 0.5);
  expect(forwardSpeed(braked)).toBeLessThan(forwardSpeed(coasted));
});

test('letting go of the throttle coasts to a stop', () => {
  const moving = run(still, gas, 3);
  expect(speedOf(run(moving, coast, 6))).toBeLessThan(0.5);
  expect(speedOf(run(moving, coast, 1))).toBeGreaterThan(speedOf(run(moving, coast, 3)));
});

test('you cannot steer while standing still, but you can at speed', () => {
  expect(run(still, { throttle: 0, steer: 1 }, 1).heading).toBe(still.heading);
  const fast = run(still, gas, 3);
  const right = run(fast, { throttle: 1, steer: 1 }, 1);
  const left = run(fast, { throttle: 1, steer: -1 }, 1);
  expect(right.heading - fast.heading).toBeGreaterThan(2.4);
  expect(right.heading - fast.heading).toBeLessThan(2.7);
  expect(left.heading).toBeLessThan(fast.heading);
});

test('a sharp turn keeps some momentum, so the rig drifts', () => {
  const fast = run(still, gas, 3);
  const swung = stepDriving({ ...fast, heading: 0 }, gas, 1 / 60, stats, free);
  expect(swung.vy).toBeLessThan(-70);
  expect(Math.abs(swung.vx)).toBeLessThan(10);
});

test('driving into a wall cancels the move and halves the speed', () => {
  const fast = run(still, gas, 3);
  const walled: DriveEnv = { blocked: () => true, terrainSpeed: () => 1 };
  const hit = stepDriving(fast, coast, 1 / 60, stats, walled);
  expect(hit.x).toBe(fast.x);
  expect(hit.y).toBe(fast.y);
  expect(speedOf(hit)).toBeGreaterThan(0.45 * 80);
  expect(speedOf(hit)).toBeLessThan(0.55 * 80);
});

test('a zero or negative frame leaves everything as it was', () => {
  const fast = run(still, gas, 2);
  expect(stepDriving(fast, gas, 0, stats, free)).toBe(fast);
  expect(stepDriving(fast, gas, -1, stats, free)).toBe(fast);
});

test('out-of-range input is clamped', () => {
  const k = run(still, { throttle: 50, steer: 0 }, 10);
  expect(speedOf(k)).toBeLessThanOrEqual(80.01);
});
