import { newGame } from '../src/sim/game-state';
import { CURRENT_SAVE_VERSION, deserialize, loadGame, SAVE_KEY, saveGame, serialize, type KV } from '../src/sim/save';

const mem = (): KV => {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
  };
};

test('round trip', () => {
  const kv = mem();
  const s = newGame(5);
  expect(saveGame(s, kv)).toBe(true);
  expect(loadGame(kv)).toEqual(s);
  expect(deserialize(serialize(s))).toEqual(s);
});

test('save uses the documented key', () => {
  const kv = mem();
  saveGame(newGame(1), kv);
  expect(SAVE_KEY).toBe('drive-all-night/save-v1');
  expect(kv.getItem(SAVE_KEY)).not.toBeNull();
});

test('bad saves load as null', () => {
  for (const raw of [null, '', '{', '{"version":2}', '{"version":1}', 'null', '[]', '42']) {
    expect(deserialize(raw)).toBeNull();
  }
});

test('structurally wrong saves load as null instead of crashing later', () => {
  const good = JSON.parse(serialize(newGame(1)));
  const broken = [
    { ...good, vehicle: {} },
    { ...good, player: {} },
    { ...good, flags: {} },
    { ...good, vehicle: { ...good.vehicle, hullId: 'tank-of-doom' } },
    { ...good, vehicle: { ...good.vehicle, fitted: { engine: ['engine-1'] } } },
    { ...good, t: 'soon' },
  ];
  for (const b of broken) expect(deserialize(JSON.stringify(b))).toBeNull();
});

test('blocked storage does not throw', () => {
  const broken: KV = {
    getItem() {
      throw new Error('denied');
    },
    setItem() {
      throw new Error('denied');
    },
  };
  expect(loadGame(broken)).toBeNull();
  expect(saveGame(newGame(1), broken)).toBe(false);
  expect(loadGame(null)).toBeNull();
  expect(saveGame(newGame(1), null)).toBe(false);
});

test('a missing or corrupt stored save loads as null', () => {
  const kv = mem();
  expect(loadGame(kv)).toBeNull();
  kv.setItem(SAVE_KEY, '{oops');
  expect(loadGame(kv)).toBeNull();
});

test('a version-1 save is upgraded, not thrown away', () => {
  const v2 = newGame(9);
  const v1 = JSON.parse(serialize(v2));
  v1.version = 1;
  delete v1.known;
  const loaded = deserialize(JSON.stringify(v1));
  expect(loaded).not.toBeNull();
  expect(loaded?.version).toBe(CURRENT_SAVE_VERSION);
  expect(loaded?.known).toEqual([]);
  expect(loaded?.vehicle).toEqual(v2.vehicle);
});

test('saves from a newer, unknown version load as null', () => {
  const future = { ...JSON.parse(serialize(newGame(1))), version: 999 };
  expect(deserialize(JSON.stringify(future))).toBeNull();
});
