import { CITY_BY_ID } from '../src/config/cities';
import { escortDef } from '../src/config/escorts';
import { buyHull, refuelFull } from '../src/sim/economy';
import { buyEscort, caravanStats, repairEscorts, sellEscort, BASE_SIGHT } from '../src/sim/caravan';
import { newGame, type GameState } from '../src/sim/game-state';
import { addCargo, burnFuel, transferToTank } from '../src/sim/vehicle';

function ok(r: { ok: boolean; state?: GameState }): GameState {
  if (!r.ok || !r.state) throw new Error('expected an ok transaction');
  return r.state;
}
const rich = (): GameState => ({ ...newGame(1), credits: 99999 });

test('a new game has an empty caravan', () => {
  const s = newGame(1);
  expect(s.caravan).toEqual([]);
  expect(s.nextEscortId).toBe(1);
  expect(caravanStats(s)).toMatchObject({ cargoCap: 60, tankCap: 40, topSpeed: 80, escorts: 0, wrecked: 0, sight: BASE_SIGHT });
});

test('buying an escort adds it at full health and charges the city price', () => {
  const s = ok(buyEscort(rich(), 'collector', 1));
  expect(s.caravan).toEqual([{ id: 1, kind: 'collector', tier: 1, hp: 30 }]);
  expect(s.nextEscortId).toBe(2);
  expect(s.credits).toBe(99999 - 500);
  const spire = ok(buyEscort(rich(), 'guardian', 2, CITY_BY_ID.spire));
  expect(spire.credits).toBe(99999 - Math.round(2000 * CITY_BY_ID.spire.priceFactor));
});

test('cities only sell the escorts they stock, and you need the credits', () => {
  expect(buyEscort(rich(), 'guardian', 1, CITY_BY_ID.ark)).toEqual({ ok: false, reason: 'nothing' });
  expect(buyEscort(rich(), 'collector', 1, CITY_BY_ID.spire)).toEqual({ ok: false, reason: 'nothing' });
  expect(buyEscort(newGame(1), 'scout', 1)).toEqual({ ok: false, reason: 'credits' });
});

test('the lead hull limits the caravan size', () => {
  let s = rich();
  s = ok(buyEscort(s, 'scout', 1));
  s = ok(buyEscort(s, 'scout', 1));
  expect(buyEscort(s, 'scout', 1)).toEqual({ ok: false, reason: 'slot' });
  s = ok(buyHull(s, 'hauler'));
  s = ok(buyEscort(s, 'scout', 1));
  expect(s.caravan).toHaveLength(3);
});

test('caravan stats add capacity, move at the slowest speed and count working specialists', () => {
  let s = ok(buyHull(rich(), 'hauler'));
  s = ok(buyEscort(s, 'collector', 2)); // hold +120, sweep 12, speed 95
  s = ok(buyEscort(s, 'tanker', 1)); // tank +60, speed 80
  s = ok(buyEscort(s, 'scout', 1)); // sight +400
  s = ok(buyEscort(s, 'guardian', 1)); // speed 75
  const st = caravanStats(s);
  expect(st.cargoCap).toBe(60 + 120);
  expect(st.tankCap).toBe(40 + 60);
  expect(st.topSpeed).toBe(75);
  expect(st.collectors).toEqual([{ id: 2, radius: 12 }]); // id 1 went to the parked scout
  expect(st.sight).toBe(BASE_SIGHT + 400);
  expect(st.fleeBonus).toBeCloseTo(0.1);
  expect(st.escorts).toBe(4);
  expect(st.fuelBurnExtra).toBeCloseTo(4 * 0.08);
});

test('wrecked escorts still carry and slow you, but stop working', () => {
  let s = rich();
  s = ok(buyEscort(s, 'collector', 1));
  s = ok(buyEscort(s, 'scout', 1));
  s = { ...s, caravan: s.caravan.map((e) => ({ ...e, hp: 0 })) };
  const st = caravanStats(s);
  expect(st.wrecked).toBe(2);
  expect(st.collectors).toEqual([]);
  expect(st.sight).toBe(BASE_SIGHT);
  expect(st.fleeBonus).toBe(0);
  expect(st.cargoCap).toBe(60 + 60);
});

test('selling an escort refunds half its catalog price', () => {
  let s = ok(buyEscort(rich(), 'gunship', 2));
  const before = s.credits;
  s = ok(sellEscort(s, 1));
  expect(s.caravan).toEqual([]);
  expect(s.credits).toBe(before + 1100);
  expect(sellEscort(s, 1)).toEqual({ ok: false, reason: 'nothing' });
});

test('escort repairs cost the city repair price per hull point, partially if short', () => {
  let s = ok(buyEscort(rich(), 'guardian', 1)); // 70 hp
  s = { ...s, credits: 1000, caravan: s.caravan.map((e) => ({ ...e, hp: 10 })) };
  const full = ok(repairEscorts(s, CITY_BY_ID.citadel));
  expect(full.caravan[0].hp).toBe(70);
  expect(full.credits).toBe(1000 - 60 * 2);
  const part = ok(repairEscorts({ ...s, credits: 21 }, CITY_BY_ID.citadel));
  expect(part.caravan[0].hp).toBe(20);
  expect(part.credits).toBe(1);
  expect(repairEscorts(newGame(1))).toEqual({ ok: false, reason: 'nothing' });
});

test('cargo, fuel and burn use the caravan totals when given', () => {
  const v = newGame(1).vehicle;
  expect(addCargo(v, 100, 150).added).toBe(100);
  expect(transferToTank({ ...v, fuel: 10, cargo: 50 }, 100).fuel).toBe(60);
  expect(burnFuel(v, 1, 10, 0.16).fuel).toBeCloseTo(40 - 10 * (0.25 + 0.16));
});

test('refuelling fills the whole caravan tank', () => {
  let s = ok(buyEscort(rich(), 'tanker', 1));
  s = { ...s, credits: 5000, vehicle: { ...s.vehicle, fuel: 0 } };
  expect(ok(refuelFull(s)).vehicle.fuel).toBe(100);
  expect(escortDef('tanker', 1).tankCap).toBe(60);
});

test('buying a bigger hull keeps fuel held in tankers', () => {
  let s = ok(buyEscort(rich(), 'tanker', 3)); // +200 tank
  s = { ...s, vehicle: { ...s.vehicle, fuel: 230 } };
  s = ok(buyHull(s, 'hauler'));
  expect(s.vehicle.fuel).toBe(230);
});

test('selling a tanker or collector trims fuel and cargo to what is left', () => {
  let s = ok(buyEscort(rich(), 'tanker', 3));
  s = ok(buyEscort(s, 'collector', 1));
  s = { ...s, vehicle: { ...s.vehicle, fuel: 240, cargo: 120 } };
  const noTanker = ok(sellEscort(s, 1));
  expect(noTanker.vehicle.fuel).toBe(40);
  const noCollector = ok(sellEscort(s, 2));
  expect(noCollector.vehicle.cargo).toBe(60);
});
