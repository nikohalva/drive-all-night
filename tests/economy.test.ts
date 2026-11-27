import { BALANCE } from '../src/config/balance';
import { REPAIR_KIT } from '../src/config/catalog';
import {
  buyHull,
  buyPart,
  buyRepairKit,
  fitPart,
  refuelFull,
  repairFull,
  sellCargo,
  unfitPart,
} from '../src/sim/economy';
import { newGame, type GameState } from '../src/sim/game-state';
import { cityPosition } from '../src/sim/world';

function ok(r: { ok: boolean; state?: GameState }): GameState {
  if (!r.ok || !r.state) throw new Error('expected an ok transaction');
  return r.state;
}

test('new game starts at dusk beside the city, facing the sunset, with no progress', () => {
  const s = newGame(7);
  expect(s).toMatchObject({ version: 8, seed: 7, t: 0, credits: 0, debt: 0 });
  expect(s.player.x).toBe(cityPosition(0).x + 40);
  expect(s.player.y).toBe(cityPosition(0).y);
  expect(s.player.heading).toBeCloseTo(-Math.PI / 2);
  expect(s.flags).toEqual({ easyStartOver: false, firstRescueUsed: false, won: false, victoryShown: false });
  expect(s.vehicle.hullId).toBe('scout');
});

test('sale pays debt first and ends the easy start', () => {
  let s = newGame(1);
  s = { ...s, debt: 100, vehicle: { ...s.vehicle, cargo: 50 } };
  const r = sellCargo(s);
  if (!r.ok) throw new Error('sale failed');
  expect(r.state.debt).toBe(0);
  expect(r.state.credits).toBe(150);
  expect(r.state.vehicle.cargo).toBe(0);
  expect(r.state.flags.easyStartOver).toBe(true);
});

test('debt larger than the sale', () => {
  let s = newGame(1);
  s = { ...s, debt: 1000, vehicle: { ...s.vehicle, cargo: 10 } };
  const r = sellCargo(s);
  if (!r.ok) throw new Error('sale failed');
  expect(r.state.debt).toBe(950);
  expect(r.state.credits).toBe(0);
});

test('selling nothing is refused and does not end the easy start', () => {
  expect(sellCargo(newGame(1))).toEqual({ ok: false, reason: 'nothing' });
});

test('transactions never mutate the state they are given', () => {
  const s = { ...newGame(1), credits: 5000 };
  const frozen = JSON.stringify(s);
  buyPart(s, 'engine-2');
  buyHull(s, 'hauler');
  repairFull(s);
  refuelFull(s);
  buyRepairKit(s);
  expect(JSON.stringify(s)).toBe(frozen);
});

test('cannot buy without credits', () => {
  expect(buyPart(newGame(1), 'engine-2')).toEqual({ ok: false, reason: 'credits' });
  expect(buyHull(newGame(1), 'hauler')).toEqual({ ok: false, reason: 'credits' });
  expect(buyRepairKit(newGame(1))).toEqual({ ok: false, reason: 'credits' });
});

test('buying a part spends credits and puts it in the garage', () => {
  const s = ok(buyPart({ ...newGame(1), credits: 1000 }, 'engine-2'));
  expect(s.credits).toBe(400);
  expect(s.vehicle.owned).toEqual(['engine-2']);
});

test('fit swaps parts and buying the juggernaut wins', () => {
  const s0 = { ...newGame(1), credits: 20000 };
  let s = ok(buyPart(s0, 'engine-2'));
  s = ok(fitPart(s, 'engine-2', 'engine', 0));
  expect(s.vehicle.fitted.engine).toEqual(['engine-2']);
  expect(s.vehicle.owned).toContain('engine-1');
  s = ok(buyHull(s, 'juggernaut'));
  expect(s.flags.won).toBe(true);
  expect(s.vehicle.fitted.weapon).toEqual(['weapon-1', null, null]);
  expect(s.vehicle.fitted.engine).toEqual(['engine-1']);
  expect(s.garages.citadel?.vehicles[0].rig?.fitted.engine).toEqual(['engine-2']); // left on the old rig
});

test('only the juggernaut wins, and you cannot buy a hull you have outgrown', () => {
  let s = ok(buyHull({ ...newGame(1), credits: 30000 }, 'hauler'));
  expect(s.flags.won).toBe(false);
  expect(buyHull(s, 'scout')).toEqual({ ok: false, reason: 'nothing' });
  expect(buyHull(s, 'hauler')).toEqual({ ok: false, reason: 'nothing' });
  s = ok(buyHull(s, 'juggernaut'));
  expect(s.flags.won).toBe(true);
});

test('fitting checks ownership, slot type and slot count', () => {
  const s = { ...newGame(1), credits: 5000 };
  expect(fitPart(s, 'engine-2', 'engine', 0)).toEqual({ ok: false, reason: 'not-owned' });
  const owned = ok(buyPart(s, 'weapon-2'));
  expect(fitPart(owned, 'weapon-2', 'engine', 0)).toEqual({ ok: false, reason: 'slot' });
  expect(fitPart(owned, 'weapon-2', 'weapon', 1)).toEqual({ ok: false, reason: 'slot' });
});

test('unfitting returns the part to the garage', () => {
  const s = ok(unfitPart(newGame(1), 'weapon', 0));
  expect(s.vehicle.fitted.weapon).toEqual([null]);
  expect(s.vehicle.owned).toEqual(['weapon-1']);
  expect(unfitPart(s, 'weapon', 0)).toEqual({ ok: false, reason: 'nothing' });
});

test('repair kits cost credits', () => {
  const s = ok(buyRepairKit({ ...newGame(1), credits: 100 }));
  expect(s.credits).toBe(100 - REPAIR_KIT.price);
  expect(s.vehicle.repairKits).toBe(2);
});

test('repair costs the full price when affordable', () => {
  const s0 = { ...newGame(1), credits: 500 };
  const s = ok(repairFull({ ...s0, vehicle: { ...s0.vehicle, hp: 20 } }));
  expect(s.vehicle.hp).toBe(60);
  expect(s.credits).toBe(500 - 40 * BALANCE.REPAIR_COST_PER_HP);
});

test('partial repair when short on credits', () => {
  const s0 = newGame(1);
  const s = { ...s0, credits: 10, vehicle: { ...s0.vehicle, hp: 20 } };
  const r = repairFull(s);
  if (!r.ok) throw new Error('repair failed');
  expect(r.state.vehicle.hp).toBe(25);
  expect(r.state.credits).toBe(0);
});

test('repair with nothing broken or no credits at all is refused', () => {
  expect(repairFull(newGame(1))).toEqual({ ok: false, reason: 'nothing' });
  const s0 = newGame(1);
  expect(repairFull({ ...s0, vehicle: { ...s0.vehicle, hp: 20 } })).toEqual({ ok: false, reason: 'credits' });
});

test('refuel buys fuel at the city price, partially if short', () => {
  const s0 = newGame(1);
  const empty = { ...s0.vehicle, fuel: 0 };
  const full = ok(refuelFull({ ...s0, credits: 1000, vehicle: empty }));
  expect(full.vehicle.fuel).toBe(40);
  expect(full.credits).toBe(1000 - 40 * BALANCE.X_BUY_PRICE);
  const part = ok(refuelFull({ ...s0, credits: 21, vehicle: empty }));
  expect(part.vehicle.fuel).toBe(3);
  expect(part.credits).toBe(0);
});

test('credits never go negative', () => {
  const s0 = { ...newGame(1), credits: 3 };
  for (const r of [buyPart(s0, 'engine-2'), buyHull(s0, 'hauler'), buyRepairKit(s0)]) {
    expect(r.ok).toBe(false);
  }
  const hurt = { ...s0, credits: 10, vehicle: { ...s0.vehicle, hp: 1, fuel: 0 } };
  expect(ok(repairFull(hurt)).credits).toBeGreaterThanOrEqual(0);
  expect(ok(refuelFull(hurt)).credits).toBeGreaterThanOrEqual(0);
});

test('you cannot strip the last engine or the last tank out of the rig', () => {
  const s = newGame(1);
  expect(unfitPart(s, 'engine', 0)).toEqual({ ok: false, reason: 'required' });
  expect(unfitPart(s, 'tank', 0)).toEqual({ ok: false, reason: 'required' });
  // everything else may come out
  expect(unfitPart(s, 'weapon', 0).ok).toBe(true);
  expect(unfitPart(s, 'collector', 0).ok).toBe(true);
});

test('with a spare engine fitted next to the first, either may be removed', () => {
  let s = ok(buyHull({ ...newGame(1), credits: 99999 }, 'hauler'));
  s = { ...s, vehicle: { ...s.vehicle, fitted: { ...s.vehicle.fitted, collector: ['collector-1', 'collector-1'] } } };
  expect(unfitPart(s, 'collector', 1).ok).toBe(true);
});
