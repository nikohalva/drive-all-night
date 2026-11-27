import { PART_SCRAP } from '../src/config/outfit';
import { startBattle } from '../src/sim/battle';
import { buyEscort, caravanStats, repairEscorts, sellEscort } from '../src/sim/caravan';
import { fitPart, unfitPart } from '../src/sim/economy';
import { escortStats } from '../src/sim/escort-stats';
import { newGame, type GameState } from '../src/sim/game-state';
import { fitEscort, partValue, sellPart, unfitEscort } from '../src/sim/outfit';
import { deserialize, serialize } from '../src/sim/save';
import { escortFitRows } from '../src/sim/shop';

const ok = (r: { ok: boolean; state?: GameState }): GameState => {
  if (!r.ok || !r.state) throw new Error('expected an ok transaction');
  return r.state;
};
/** One escort of this kind (id 1), with these spares aboard. */
const game = (kind: 'collector' | 'gunship' | 'tanker', ...owned: string[]): GameState => {
  const s = ok(buyEscort({ ...newGame(1), credits: 99999 }, kind, 1));
  return { ...s, credits: 0, vehicle: { ...s.vehicle, owned } };
};
const fit = (s: GameState, slot: 'engine' | 'armor' | 'weapon' | 'tank' | 'collector' | 'cargo', id: string) =>
  ok(fitEscort(s, 'citadel', 1, slot, id, 'aboard'));

test('parts add to what an escort is built with', () => {
  let s = game('collector', 'engine-2', 'collector-2', 'cargo-3');
  s = fit(s, 'engine', 'engine-2');
  s = fit(s, 'collector', 'collector-2');
  s = fit(s, 'cargo', 'cargo-3');
  const st = escortStats(s.caravan[0]);
  expect(st.speed).toBe(85 + 13);
  expect(st.collectRadius).toBe(8 + 6);
  expect(st.cargoCap).toBe(60 + 150);
  expect(s.vehicle.owned).toEqual([]);
  expect(caravanStats(s).collectors).toEqual([{ id: 1, radius: 14 }]);
  expect(caravanStats(s).cargoCap).toBe(60 + 210);
});

test('armour toughens an escort, and a weapon gives it a second gun in battle', () => {
  let s = game('gunship', 'armor-3', 'weapon-3');
  s = fit(fit(s, 'armor', 'armor-3'), 'weapon', 'weapon-3');
  const st = escortStats(s.caravan[0]);
  expect(st.armor).toBe(1 + 6);
  expect(st.hp).toBe(45 + 50);
  const unit = startBattle(s, []).units[1];
  expect(unit.maxHp).toBe(95);
  expect(unit.guns.map((g) => g.damage)).toEqual([9, 24]);
  // the extra hull has to be repaired, like new armour on your rig
  const repaired = ok(repairEscorts({ ...s, credits: 999 }));
  expect(repaired.caravan[0].hp).toBe(95);
});

test('an escort only takes the parts it has slots for', () => {
  const s = game('tanker', 'weapon-2', 'tank-2');
  expect(fitEscort(s, 'citadel', 1, 'weapon', 'weapon-2', 'aboard')).toEqual({ ok: false, reason: 'slot' });
  expect(fitEscort(s, 'citadel', 1, 'tank', 'weapon-2', 'aboard')).toEqual({ ok: false, reason: 'slot' });
  expect(escortStats(fit(s, 'tank', 'tank-2').caravan[0]).tankCap).toBe(60 + 40);
});

test('swapping and removing parts gives the old one back and never leaves too much aboard', () => {
  let s = fit(game('tanker', 'tank-3', 'tank-2'), 'tank', 'tank-3');
  s = fit(s, 'tank', 'tank-2');
  expect(s.vehicle.owned).toEqual(['tank-3']);
  s = { ...s, vehicle: { ...s.vehicle, fuel: caravanStats(s).tankCap } };
  const out = ok(unfitEscort(s, 'citadel', 1, 'tank'));
  expect(out.vehicle.owned).toEqual(['tank-3', 'tank-2']);
  expect(out.caravan[0].fitted?.tank).toBeUndefined();
  expect(out.vehicle.fuel).toBe(caravanStats(out).tankCap);
  expect(unfitEscort(out, 'citadel', 1, 'tank')).toEqual({ ok: false, reason: 'nothing' });
});

test('parts can be fitted from the garage', () => {
  const s = { ...game('tanker'), garages: { citadel: { owned: true, rentUntil: 0, parts: ['engine-2'], vehicles: [] } } };
  const done = ok(fitEscort(s, 'citadel', 1, 'engine', 'engine-2', 'garage'));
  expect(done.garages.citadel?.parts).toEqual([]);
  expect(escortStats(done.caravan[0]).speed).toBe(80 + 13);
});

test('an escort lists its slots and the spares that could go in them', () => {
  const rows = escortFitRows(game('gunship', 'weapon-2', 'tank-2'), 'citadel', 1);
  expect(rows.map((r) => `${r.type}:${r.slot}`)).toEqual(['slot:engine', 'slot:armor', 'slot:weapon', 'option:weapon']);
  expect(rows[2]).toMatchObject({ label: 'WEAPON: EMPTY' });
  expect(rows[3]).toMatchObject({ label: 'FIT TWIN AUTOCANNON', delta: 'DMG +14', target: 1 });
});

test('spare parts can be sold at half price, and starter gear for scrap', () => {
  expect(partValue('engine-2')).toBe(300);
  expect(partValue('engine-1')).toBe(PART_SCRAP);
  const s = { ...game('tanker', 'engine-2'), debt: 100 };
  const sold = ok(sellPart(s, 'citadel', 'engine-2', 'aboard'));
  expect(sold).toMatchObject({ credits: 200, debt: 0 });
  expect(sold.vehicle.owned).toEqual([]);
  expect(sellPart(sold, 'citadel', 'engine-2', 'aboard')).toEqual({ ok: false, reason: 'not-owned' });
  const stored = { ...s, debt: 0, garages: { citadel: { owned: true, rentUntil: 0, parts: ['armor-3'], vehicles: [] } } };
  expect(ok(sellPart(stored, 'citadel', 'armor-3', 'garage')).credits).toBe(1500);
});

test('selling an escort sells what is fitted to it too', () => {
  const s = fit(game('tanker', 'engine-2'), 'engine', 'engine-2');
  expect(ok(sellEscort(s, 1)).credits).toBe(250 + 300);
});

test('removing armour or a tank from your rig trims hull and fuel to fit', () => {
  let s: GameState = { ...newGame(1), vehicle: { ...newGame(1).vehicle, owned: ['armor-3'] } };
  s = ok(fitPart(s, 'armor-3', 'armor', 0));
  s = ok(unfitPart({ ...s, vehicle: { ...s.vehicle, hp: 110 } }, 'armor', 0));
  expect(s.vehicle.hp).toBe(60);
});

test('fitted escorts are saved', () => {
  const s = fit(game('tanker', 'engine-2'), 'engine', 'engine-2');
  expect(deserialize(serialize(s))).toEqual(s);
  const bad = JSON.parse(serialize(s));
  bad.caravan[0].fitted = { engine: 5 };
  expect(deserialize(JSON.stringify(bad))).toBeNull();
});
