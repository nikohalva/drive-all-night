import { BALANCE } from '../src/config/balance';
import { newGame } from '../src/sim/game-state';
import { makeRng } from '../src/sim/rng';
import { applyRescue, RESCUE_TABLE, rollRescue } from '../src/sim/rescue';
import type { Zone } from '../src/sim/world';

test('first rescue is free and guaranteed', () => {
  for (const z of ['sunset', 'deep', 'predawn', 'scorch'] as const) {
    expect(rollRescue(makeRng(1), z, 9999, false)).toEqual({ type: 'rescued', waitSeconds: 15, fee: 0 });
  }
});

test('even the first call cannot save you once the dawn has you', () => {
  expect(rollRescue(makeRng(1), 'dawn', 0, false)).toEqual({ type: 'destroyed', waitSeconds: 0 });
  expect(rollRescue(makeRng(1), 'dawn', 0, true)).toEqual({ type: 'destroyed', waitSeconds: 0 });
});

test('sunset calls sometimes bring pirates, deep calls never do', () => {
  const kinds = (z: Zone) =>
    new Set(Array.from({ length: 300 }, (_, i) => rollRescue(makeRng(i), z, 1e6, true).type));
  expect(kinds('sunset').has('pirates')).toBe(true);
  expect(kinds('sunset').has('rescued')).toBe(true);
  expect(kinds('deep').has('pirates')).toBe(false);
  expect(kinds('deep').has('rescued')).toBe(true);
});

test('rescue waits and fees come from the zone table', () => {
  for (let i = 0; i < 200; i++) {
    const o = rollRescue(makeRng(i), 'deep', 1e6, true);
    if (o.type !== 'rescued') throw new Error('deep calls with plenty of night left are always answered');
    expect(o.waitSeconds).toBeGreaterThanOrEqual(RESCUE_TABLE.deep.waitMin);
    expect(o.waitSeconds).toBeLessThanOrEqual(RESCUE_TABLE.deep.waitMax);
    expect(o.fee).toBe(RESCUE_TABLE.deep.fee);
  }
});

test('the table is the documented one', () => {
  expect(RESCUE_TABLE).toEqual({
    sunset: { pirateChance: 0.3, waitMin: 20, waitMax: 60, fee: 150 },
    deep: { pirateChance: 0, waitMin: 120, waitMax: 600, fee: 300 },
    predawn: { pirateChance: 0, waitMin: 300, waitMax: 900, fee: 500 },
    scorch: { pirateChance: 0, waitMin: 10, waitMax: 30, fee: 400 },
  });
  expect(BALANCE.SCORCH_SURVIVE_SECONDS).toBe(20);
});

test('the dawn wins if help is slower', () => {
  expect(rollRescue(makeRng(3), 'predawn', 100, true).type).toBe('destroyed');
});

test('on the scorched side only a fast crew arrives in time', () => {
  const outcomes = Array.from({ length: 300 }, (_, i) => rollRescue(makeRng(i), 'scorch', Infinity, true));
  expect(outcomes.some((o) => o.type === 'rescued')).toBe(true);
  expect(outcomes.some((o) => o.type === 'destroyed')).toBe(true);
  for (const o of outcomes) {
    if (o.type === 'rescued') expect(o.waitSeconds).toBeLessThanOrEqual(BALANCE.SCORCH_SURVIVE_SECONDS);
  }
});

test('rescue is deterministic for a given seed', () => {
  expect(rollRescue(makeRng(11), 'sunset', 1e6, true)).toEqual(rollRescue(makeRng(11), 'sunset', 1e6, true));
});

test('unpaid fee becomes debt', () => {
  const s0 = newGame(1);
  const s = { ...s0, credits: 100, vehicle: { ...s0.vehicle, hp: 0, fuel: 0 } };
  const r = applyRescue(s, { type: 'rescued', waitSeconds: 30, fee: 300 });
  expect(r).toMatchObject({ credits: 0, debt: 200, t: 30 });
  expect(r.vehicle.hp).toBe(15);
  expect(r.vehicle.fuel).toBe(15);
  expect(r.flags.firstRescueUsed).toBe(true);
});

test('a fee you can pay comes out of credits and rescue never lowers hull or fuel', () => {
  const s0 = newGame(1);
  const r = applyRescue({ ...s0, credits: 1000, vehicle: { ...s0.vehicle, hp: 50, fuel: 30 } }, {
    type: 'rescued',
    waitSeconds: 10,
    fee: 300,
  });
  expect(r).toMatchObject({ credits: 700, debt: 0 });
  expect(r.vehicle.hp).toBe(50);
  expect(r.vehicle.fuel).toBe(30);
});

test('pirates answering your call strip the cargo and cost time', () => {
  const s0 = newGame(1);
  const r = applyRescue({ ...s0, t: 5, vehicle: { ...s0.vehicle, cargo: 40, hp: 0 } }, {
    type: 'pirates',
    waitSeconds: 25,
  });
  expect(r.vehicle.cargo).toBe(0);
  expect(r.vehicle.hp).toBe(0);
  expect(r.t).toBe(30);
  expect(r.flags.firstRescueUsed).toBe(false);
});

test('a destroyed outcome only advances the clock; the caller reloads the save', () => {
  const s0 = newGame(1);
  const r = applyRescue(s0, { type: 'destroyed', waitSeconds: 40 });
  expect(r).toEqual({ ...s0, t: 40 });
});
