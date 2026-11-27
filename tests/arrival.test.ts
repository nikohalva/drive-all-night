import { arrivalSteps } from '../src/sim/arrival';
import type { CrewMember } from '../src/sim/crew';
import { newGame } from '../src/sim/game-state';

const owed: CrewMember = {
  id: 1, name: 'MARA VOSS', role: 'driver', skill: 1, trait: 'grump', health: 100, face: 1, post: 'lead', owed: 25, missed: 0,
};

test('docking with nothing to sell and nobody owed goes straight into the city', () => {
  expect(arrivalSteps(newGame(1))).toEqual([]);
});

test('you are asked about your cargo first, so the money can pay the wages', () => {
  const s = newGame(1);
  const loaded = { ...s, vehicle: { ...s.vehicle, cargo: 30 }, crew: [owed] };
  expect(arrivalSteps(loaded)).toEqual(['sell', 'wages']);
  expect(arrivalSteps({ ...s, crew: [owed] })).toEqual(['wages']);
});

test('a trace of cargo or a fraction of a wage is not worth asking about', () => {
  const s = newGame(1);
  expect(arrivalSteps({ ...s, vehicle: { ...s.vehicle, cargo: 0.1 }, crew: [{ ...owed, owed: 0.6 }] })).toEqual([]);
});
