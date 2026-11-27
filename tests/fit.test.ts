import { SPARE_SLOTS } from '../src/config/holdings';
import { newGame, type GameState } from '../src/sim/game-state';
import { fitChoice, fitRows } from '../src/sim/shop';

const ok = (r: { ok: boolean; state?: GameState }): GameState => {
  if (!r.ok || !r.state) throw new Error('expected an ok transaction');
  return r.state;
};
const withParts = (aboard: string[], stored: string[] = []): GameState => {
  const s = newGame(1);
  return {
    ...s,
    vehicle: { ...s.vehicle, owned: aboard },
    garages: { citadel: { owned: true, rentUntil: 0, parts: stored, vehicles: [] } },
  };
};

test('each slot lists what is in it, then every part that could go there', () => {
  const rows = fitRows(withParts(['engine-2', 'engine-2'], ['engine-3', 'tank-2']), 'citadel');
  expect(rows.slice(0, 3)).toEqual([
    expect.objectContaining({ type: 'slot', slot: 'engine', partId: 'engine-1', label: 'ENGINE 1: SAND RUNNER', summary: 'SPD 80 ACC 60' }),
    expect.objectContaining({ type: 'option', slot: 'engine', partId: 'engine-2', from: 'aboard', label: 'FIT DUNE HAMMER', delta: 'SPEED +25' }),
    expect.objectContaining({ type: 'option', slot: 'engine', partId: 'engine-3', from: 'garage', label: 'FIT DUSK CHASER', delta: 'SPEED +50' }),
  ]);
  expect(rows.filter((r) => r.type === 'slot')).toHaveLength(6);
});

test('parts in a garage you cannot use are not offered', () => {
  const s = withParts([], ['engine-2']);
  expect(fitRows(s, 'ark').filter((r) => r.type === 'option')).toEqual([]);
});

test('fitting from aboard swaps the old part into your spares', () => {
  const s = ok(fitChoice(withParts(['engine-2']), 'citadel', 'engine', 0, 'engine-2', 'aboard'));
  expect(s.vehicle.fitted.engine).toEqual(['engine-2']);
  expect(s.vehicle.owned).toEqual(['engine-1']);
});

test('fitting from the garage works even with a full spare hold', () => {
  const full = Array(SPARE_SLOTS.scout).fill('tank-2');
  const s = ok(fitChoice(withParts(full, ['engine-2']), 'citadel', 'engine', 0, 'engine-2', 'garage'));
  expect(s.vehicle.fitted.engine).toEqual(['engine-2']);
  expect(s.vehicle.owned).toEqual(full);
  expect(s.garages.citadel?.parts).toEqual(['engine-1']);

  const roomy = ok(fitChoice(withParts([], ['engine-2']), 'citadel', 'engine', 0, 'engine-2', 'garage'));
  expect(roomy.vehicle.owned).toEqual(['engine-1']);
  expect(roomy.garages.citadel?.parts).toEqual([]);
});

test('a part that is not there cannot be fitted', () => {
  expect(fitChoice(withParts([]), 'citadel', 'engine', 0, 'engine-2', 'garage')).toEqual({ ok: false, reason: 'not-owned' });
});
