import { PinnedLru } from '../src/art/lru';

function make(max: number) {
  const evicted: string[] = [];
  return { cache: new PinnedLru(max, (k) => evicted.push(k)), evicted };
}

test('the oldest unpinned entry is evicted first', () => {
  const { cache, evicted } = make(3);
  for (const k of ['a', 'b', 'c', 'd']) cache.add(k);
  expect(evicted).toEqual(['a']);
});

test('touching an entry makes it the newest', () => {
  const { cache, evicted } = make(3);
  for (const k of ['a', 'b', 'c']) cache.add(k);
  cache.touch('a');
  cache.add('d');
  expect(evicted).toEqual(['b']);
});

test('a pinned entry is never evicted, however old', () => {
  const { cache, evicted } = make(3);
  cache.add('a');
  cache.pin('a');
  for (const k of ['b', 'c', 'd', 'e', 'f']) cache.add(k);
  expect(evicted).not.toContain('a');
  expect(cache.has('a')).toBe(true);
});

test('unpinning makes an entry evictable again', () => {
  const { cache, evicted } = make(2);
  cache.add('a');
  cache.pin('a');
  cache.add('b');
  cache.add('c');
  expect(evicted).toEqual(['b']);
  cache.unpin('a');
  cache.add('d');
  expect(evicted).toEqual(['b', 'a']);
});

test('if everything is pinned the cache grows rather than dropping a live entry', () => {
  const { cache, evicted } = make(2);
  for (const k of ['a', 'b', 'c']) cache.add(k, true); // entries that are in use enter pinned
  expect(evicted).toEqual([]);
  expect(cache.size).toBe(3);
});

test('a live chunk window never loses a texture while the player wanders', () => {
  // mimic GroundLayer: a 7x7 window of live (pinned) chunks that slides around, 64-entry cache
  const { cache, evicted } = make(64);
  const live = new Set<string>();
  let cx = 0;
  let cy = 0;
  for (let step = 0; step < 4000; step++) {
    cx += step % 7 < 3 ? 1 : -1;
    cy += step % 11 < 5 ? 1 : -1;
    const want = new Set<string>();
    for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) want.add(`${cx + dx},${cy + dy}`);
    for (const k of want) {
      if (cache.has(k)) cache.pin(k);
      else cache.add(k, true);
      live.add(k);
    }
    for (const k of [...live]) {
      if (!want.has(k)) {
        cache.unpin(k);
        live.delete(k);
      }
    }
    for (const k of live) expect(cache.has(k)).toBe(true);
  }
  expect(evicted.length).toBeGreaterThan(0);
});
