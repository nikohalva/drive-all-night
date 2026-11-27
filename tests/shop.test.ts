import { buyHull, buyPart } from '../src/sim/economy';
import { newGame, type GameState } from '../src/sim/game-state';
import { compatibleOwned, cycleFit, garageRows, shopRows, shopSection } from '../src/sim/shop';

function ok(r: { ok: boolean; state?: GameState }): GameState {
  if (!r.ok || !r.state) throw new Error('expected an ok transaction');
  return r.state;
}

test('a new game shops for two bigger hulls, twelve upgrade parts and repair kits', () => {
  const rows = shopRows(newGame(1));
  expect(rows.map((r) => r.kind)).toEqual([
    'hull',
    'hull',
    ...Array(12).fill('part'),
    'kit',
  ]);
  expect(rows.slice(0, 2).map((r) => r.id)).toEqual(['hauler', 'juggernaut']);
  expect(rows.every((r) => !r.affordable)).toBe(true);
});

test('every item belongs to a section, and each section is one unbroken block', () => {
  const sections = shopRows(newGame(1)).map(shopSection);
  expect(sections.filter((name, i) => name !== sections[i - 1])).toEqual([
    'RIGS', 'ENGINES', 'TANKS', 'COLLECTORS', 'CARGO HOLDS', 'ARMOR', 'WEAPONS', 'SUPPLIES',
  ]);
});

test('affordability follows credits', () => {
  const rows = shopRows({ ...newGame(1), credits: 600 });
  const affordable = rows.filter((r) => r.affordable).map((r) => r.id);
  expect(affordable).toContain('engine-2');
  expect(affordable).toContain('tank-2');
  expect(affordable).not.toContain('engine-3');
  expect(affordable).not.toContain('hauler');
});

test('hulls you have outgrown disappear from the shop', () => {
  const s = ok(buyHull({ ...newGame(1), credits: 5000 }, 'hauler'));
  expect(shopRows(s).filter((r) => r.kind === 'hull').map((r) => r.id)).toEqual(['juggernaut']);
});

test('rows say what a part changes compared with what is fitted', () => {
  const byId = Object.fromEntries(shopRows({ ...newGame(1), credits: 99999 }).map((r) => [r.id, r]));
  expect(byId['engine-2'].delta).toBe('SPEED +25');
  expect(byId['engine-3'].delta).toBe('SPEED +50');
  expect(byId['tank-2'].delta).toBe('TANK +40');
  expect(byId['collector-3'].delta).toBe('SWEEP +10');
  expect(byId['cargo-2'].delta).toBe('HOLD +80');
  expect(byId['armor-2'].delta).toBe('ARMOR +2 HP +20');
  expect(byId['weapon-3'].delta).toBe('DMG +16');
  expect(byId.hauler.delta).toBe('HP +80');
  expect(byId['engine-2'].summary).toBe('SPD 105 ACC 80');
  expect(byId['weapon-2'].summary).toBe('DMG 14 ACC 75%');
});

test('a downgrade shows as a negative change', () => {
  let s = ok(buyPart({ ...newGame(1), credits: 99999 }, 'engine-3'));
  s = ok(cycleFit(s, 'engine', 0));
  expect(shopRows(s).find((r) => r.id === 'engine-2')?.delta).toBe('SPEED -25');
});

test('the repair kit row shows how many you carry', () => {
  const kit = shopRows(newGame(1)).find((r) => r.kind === 'kit');
  expect(kit).toMatchObject({ id: 'kit', price: 60, summary: 'HEAL 40', delta: 'OWNED 1' });
});

test('garage rows list every slot the hull has', () => {
  const rows = garageRows(newGame(1));
  expect(rows).toHaveLength(6);
  expect(rows[0]).toEqual({ slot: 'engine', index: 0, partId: 'engine-1', label: 'ENGINE 1: SAND RUNNER' });

  const hauler = ok(buyHull({ ...newGame(1), credits: 5000 }, 'hauler'));
  const weapons = garageRows(hauler).filter((r) => r.slot === 'weapon');
  expect(weapons).toHaveLength(2);
  expect(weapons[1]).toEqual({ slot: 'weapon', index: 1, partId: null, label: 'WEAPON 2: EMPTY' });
});

test('only owned parts of the right type can be fitted', () => {
  const s = ok(buyPart({ ...newGame(1), credits: 5000 }, 'weapon-2'));
  expect(compatibleOwned(s, 'weapon')).toEqual(['weapon-2']);
  expect(compatibleOwned(s, 'engine')).toEqual([]);
});

test('cycling a slot swaps in the next owned part and keeps the old one', () => {
  let s = { ...newGame(1), credits: 99999 };
  s = ok(buyPart(s, 'engine-2'));
  s = ok(buyPart(s, 'engine-3'));
  s = ok(cycleFit(s, 'engine', 0));
  expect(s.vehicle.fitted.engine).toEqual(['engine-2']);
  expect([...s.vehicle.owned].sort()).toEqual(['engine-1', 'engine-3']);
  s = ok(cycleFit(s, 'engine', 0));
  expect(s.vehicle.fitted.engine).toEqual(['engine-3']);
  expect(cycleFit(newGame(1), 'engine', 0)).toEqual({ ok: false, reason: 'nothing' });
});
