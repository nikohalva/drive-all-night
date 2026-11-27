import { CITY_BY_ID } from '../src/config/cities';
import { BANK_STEP, GARAGE_PRICE, GARAGE_RENT, GARAGE_VEHICLES, RENT_SECONDS, SALVAGE, SPARE_SLOTS } from '../src/config/holdings';
import { deposit, funds, payInCity, withdraw } from '../src/sim/bank';
import { applyBattleResult, startBattle, type BattleState } from '../src/sim/battle';
import { buyEscort } from '../src/sim/caravan';
import { buyPart, repairFull, unfitPart } from '../src/sim/economy';
import { mineSites, tributeCredits } from '../src/sim/barons';
import { buyGarage, hasGarage, parkEscort, rentGarage, storePart, takeEscort, takePart } from '../src/sim/garage';
import { newGame, type GameState } from '../src/sim/game-state';
import { makePirateGroup } from '../src/sim/pirates';
import { applySalvage } from '../src/sim/salvage';
import { deserialize, serialize } from '../src/sim/save';

const ok = (r: { ok: boolean; state?: GameState }): GameState => {
  if (!r.ok || !r.state) throw new Error('expected an ok transaction');
  return r.state;
};
const rich = (): GameState => ({ ...newGame(1), credits: 99999 });
const withSpares = (s: GameState, ...owned: string[]): GameState => ({ ...s, vehicle: { ...s.vehicle, owned } });
const ark = CITY_BY_ID.ark;

test('credits move in and out of the bank, never more than there is', () => {
  const s = { ...newGame(1), credits: 800 };
  const banked = ok(deposit(s, BANK_STEP));
  expect(banked).toMatchObject({ credits: 300, bank: 500 });
  expect(ok(deposit(banked, 9999))).toMatchObject({ credits: 0, bank: 800 });
  expect(ok(withdraw(banked, 9999))).toMatchObject({ credits: 800, bank: 0 });
  expect(deposit(newGame(1), 100)).toEqual({ ok: false, reason: 'nothing' });
  expect(withdraw(s, 100)).toEqual({ ok: false, reason: 'nothing' });
});

test('in a city you pay with what you carry first, then from the bank', () => {
  const s = { ...newGame(1), credits: 200, bank: 1000 };
  expect(funds(s)).toBe(1200);
  const bought = ok(payInCity(s, (x) => buyPart(x, 'engine-2'))); // 600
  expect(bought).toMatchObject({ credits: 0, bank: 600 });
  expect(bought.vehicle.owned).toEqual(['engine-2']);
  expect(ok(payInCity({ ...s, credits: 700 }, (x) => buyPart(x, 'engine-2')))).toMatchObject({ credits: 100, bank: 1000 });
  expect(payInCity({ ...s, bank: 100 }, (x) => buyPart(x, 'engine-2'))).toEqual({ ok: false, reason: 'credits' });
  // a partial service uses everything you have
  const wreck = { ...s, credits: 10, bank: 10, vehicle: { ...s.vehicle, hp: 1 } };
  expect(ok(payInCity(wreck, (x) => repairFull(x)))).toMatchObject({ credits: 0, bank: 0 });
});

test('mines are outside the bank: only the credits you carry count', () => {
  const s = { ...newGame(1), credits: 0, bank: 5000 };
  expect(tributeCredits(s, mineSites(1)[0].id)).toEqual({ ok: false, reason: 'credits' });
});

test('losing a fight costs the cargo and the credits you carry, not what is banked', () => {
  const s = { ...newGame(1), credits: 700, bank: 900 };
  const lost: BattleState = { ...startBattle(s, []), outcome: 'lost' };
  expect(applyBattleResult(s, lost, { credits: 0, cargo: 0 })).toMatchObject({ credits: 0, bank: 900 });
});

test('you start with a garage in Dusk Citadel only; others are bought or rented', () => {
  const s = rich();
  expect(hasGarage(s, 'citadel')).toBe(true);
  expect(hasGarage(s, 'ark')).toBe(false);
  expect(storePart(withSpares(s, 'engine-2'), 'ark', 'engine-2')).toEqual({ ok: false, reason: 'nothing' });

  const bought = ok(buyGarage(s, 'ark'));
  expect(bought.credits).toBe(99999 - GARAGE_PRICE);
  expect(hasGarage({ ...bought, t: 1e9 }, 'ark')).toBe(true);
  expect(buyGarage(bought, 'ark')).toEqual({ ok: false, reason: 'nothing' });

  const rented = ok(rentGarage(s, 'ark'));
  expect(rented.credits).toBe(99999 - GARAGE_RENT);
  expect(hasGarage({ ...rented, t: RENT_SECONDS - 1 }, 'ark')).toBe(true);
  expect(hasGarage({ ...rented, t: RENT_SECONDS + 1 }, 'ark')).toBe(false);
  // paying again before it runs out adds on
  const twice = ok(rentGarage(rented, 'ark'));
  expect(hasGarage({ ...twice, t: 2 * RENT_SECONDS - 1 }, 'ark')).toBe(true);
  expect(buyGarage(newGame(1), 'ark')).toEqual({ ok: false, reason: 'credits' });
});

test('spare parts stay in the garage you leave them in, even after the rent lapses', () => {
  let s = ok(rentGarage(withSpares(rich(), 'engine-2'), 'ark'));
  s = ok(storePart(s, 'ark', 'engine-2'));
  expect(s.vehicle.owned).toEqual([]);
  expect(takePart(s, 'citadel', 'engine-2')).toEqual({ ok: false, reason: 'nothing' });
  const lapsed = { ...s, t: RENT_SECONDS + 1 };
  expect(takePart(lapsed, 'ark', 'engine-2')).toEqual({ ok: false, reason: 'nothing' });
  const back = ok(takePart(ok(rentGarage(lapsed, 'ark')), 'ark', 'engine-2'));
  expect(back.vehicle.owned).toEqual(['engine-2']);
});

test('the rig only carries so many spares', () => {
  const full = withSpares(rich(), ...Array(SPARE_SLOTS.scout).fill('tank-2'));
  // at home a purchase goes straight to the garage
  const bought = ok(buyPart(full, 'engine-2'));
  expect(bought.vehicle.owned).toHaveLength(SPARE_SLOTS.scout);
  expect(bought.garages.citadel?.parts).toEqual(['engine-2']);
  expect(buyPart(full, 'engine-2', ark)).toEqual({ ok: false, reason: 'slot' });
  expect(takePart(bought, 'citadel', 'engine-2')).toEqual({ ok: false, reason: 'slot' });
  expect(unfitPart(full, 'weapon', 0, ark)).toEqual({ ok: false, reason: 'slot' });
  expect(ok(unfitPart(full, 'weapon', 0)).garages.citadel?.parts).toEqual(['weapon-1']);
});

test('escorts can be parked and taken out again; their crew rides on in reserve', () => {
  let s = ok(buyEscort(rich(), 'tanker', 3));
  s = { ...s, vehicle: { ...s.vehicle, fuel: 200 } };
  s = ok(parkEscort(s, 'citadel', 1));
  expect(s.caravan).toEqual([]);
  expect(s.crew[0].post).toBeNull();
  expect(s.vehicle.fuel).toBe(40);
  expect(s.garages.citadel?.vehicles.map((v) => v.id)).toEqual([1]);
  s = ok(takeEscort(s, 'citadel', 1));
  expect(s.caravan.map((e) => e.id)).toEqual([1]);
  expect(s.garages.citadel?.vehicles).toEqual([]);
});

test('a full caravan or a full garage refuses', () => {
  let s = rich();
  s = ok(buyEscort(s, 'scout', 1));
  s = ok(parkEscort(s, 'citadel', 1));
  s = ok(buyEscort(s, 'scout', 1));
  s = ok(buyEscort(s, 'scout', 1));
  expect(takeEscort(s, 'citadel', 1)).toEqual({ ok: false, reason: 'slot' });
  const crowded = {
    ...s,
    garages: { citadel: { owned: true, rentUntil: 0, parts: [], vehicles: Array(GARAGE_VEHICLES).fill(s.caravan[0]) } },
  };
  expect(parkEscort(crowded, 'citadel', s.caravan[1].id)).toEqual({ ok: false, reason: 'slot' });
});

test('a won fight can leave parts and a battered vehicle behind', () => {
  const enemies = makePirateGroup(() => 0, 10, false);
  const r = applySalvage(newGame(1), enemies, () => 0);
  expect(r.state.vehicle.owned.length).toBeGreaterThan(0);
  expect(r.state.caravan).toHaveLength(1);
  const got = r.state.caravan[0];
  expect(got.hp).toBeGreaterThan(0);
  expect(r.state.nextEscortId).toBe(got.id + 1);
  expect(r.state.crew).toEqual([]); // captured, so nobody aboard yet
  expect(r.report.some((l) => l.startsWith('SALVAGED'))).toBe(true);
  expect(r.report.some((l) => l.startsWith('CAPTURED'))).toBe(true);

  const nothing = applySalvage(newGame(1), enemies, () => 0.99);
  expect(nothing).toEqual({ state: newGame(1), report: [] });
});

test('salvage with no room is left behind', () => {
  let s = withSpares(rich(), ...Array(SPARE_SLOTS.scout).fill('tank-2'));
  s = ok(buyEscort(s, 'scout', 1));
  s = ok(buyEscort(s, 'scout', 1));
  const r = applySalvage(s, makePirateGroup(() => 0, SALVAGE.GOOD_LEVEL, false), () => 0);
  expect(r.state.vehicle.owned).toHaveLength(SPARE_SLOTS.scout);
  expect(r.state.caravan).toHaveLength(2);
  expect(r.report.some((l) => l.includes('NO ROOM'))).toBe(true);
});

test('bank and garages are saved, and an older save gets them', () => {
  const s = ok(deposit(ok(rentGarage(rich(), 'ark')), 500));
  expect(deserialize(serialize(s))).toEqual(s);
  const old = JSON.parse(serialize(newGame(1)));
  old.version = 5;
  delete old.bank;
  delete old.garages;
  const loaded = deserialize(JSON.stringify(old))!;
  expect(loaded).toEqual(newGame(1));
});
