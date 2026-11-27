import { Convoy, convoyDistances, CONVOY_GAP } from '../src/sim/convoy';

test('followers trail the lead along its own path at even spacing', () => {
  const c = new Convoy();
  for (let y = 0; y >= -300; y -= 2) c.record(100, y);
  const [a, b] = c.followers([30, 60]);
  expect(a.x).toBeCloseTo(100);
  expect(a.y).toBeCloseTo(-270);
  expect(b.y).toBeCloseTo(-240);
  expect(a.heading).toBeCloseTo(-Math.PI / 2);
});

test('followers go round corners the way the lead did', () => {
  const c = new Convoy();
  for (let x = 0; x <= 100; x += 2) c.record(x, 0);
  for (let y = 0; y <= 100; y += 2) c.record(100, y);
  const [a] = c.followers([150]);
  expect(a.x).toBeCloseTo(50);
  expect(a.y).toBeCloseTo(0);
  expect(a.heading).toBeCloseTo(0);
});

test('with too little path the followers wait at its start', () => {
  const c = new Convoy();
  c.record(10, 10);
  c.record(10, 0);
  const f = c.followers([30, 60, 90]);
  expect(f).toHaveLength(3);
  for (const p of f) expect(p.y).toBeCloseTo(10);
});

test('the path is trimmed so memory stays bounded', () => {
  const c = new Convoy();
  for (let y = 0; y > -100000; y -= 3) c.record(0, y);
  c.followers([34, 68, 102, 136, 170, 204]);
  expect(c.length).toBeLessThan(400);
});

test('reset starts a fresh path at the given point', () => {
  const c = new Convoy();
  for (let y = 0; y >= -300; y -= 2) c.record(0, y);
  c.reset(500, 500);
  const [a] = c.followers([30]);
  expect(a.x).toBe(500);
  expect(a.y).toBe(500);
});

test('nothing in the column overlaps, however long the vehicles are', () => {
  // a hauler's tail reaches 47 px behind it; then an escort, an old juggernaut and another escort
  const lengths = [30, 90, 30];
  const at = convoyDistances(47, lengths);
  expect(at[0] - lengths[0] / 2).toBe(47 + CONVOY_GAP);
  for (let i = 1; i < lengths.length; i++) {
    expect(at[i] - lengths[i] / 2).toBe(at[i - 1] + lengths[i - 1] / 2 + CONVOY_GAP);
  }
  expect(convoyDistances(47, [])).toEqual([]);
});
