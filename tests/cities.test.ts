import { NIGHT_LEN } from '../src/config/balance';
import { CITIES, CITY_BY_ID } from '../src/config/cities';
import { buyPart, refuelFull, repairFull, sellCargo } from '../src/sim/economy';
import { newGame } from '../src/sim/game-state';
import { shopRows } from '../src/sim/shop';
import { behindSunset, cityPos, cityPositions, nearestCity } from '../src/sim/world';

test('three cities, each on its own lane at its own distance behind the sunset', () => {
  expect(CITIES.map((c) => c.id)).toEqual(['ark', 'citadel', 'spire']);
  for (const t of [0, 900, 7000]) {
    for (const p of cityPositions(t)) {
      const def = CITY_BY_ID[p.id];
      expect(p.x).toBe(def.laneX);
      expect(behindSunset(p.y, t)).toBeCloseTo(def.behindFrac * NIGHT_LEN);
    }
  }
  expect(cityPos('spire', 0).x).toBe(3000);
});

test('nearestCity finds the closest city, across the wrap too', () => {
  const ark = cityPos('ark', 0);
  expect(nearestCity(ark.x + 10, ark.y + 5, 0).id).toBe('ark');
  const spire = cityPos('spire', 0);
  expect(nearestCity(spire.x, spire.y + 172800, 0).id).toBe('spire');
});

test('selling, refuelling and repairs use the city prices', () => {
  const s0 = newGame(1);
  const cargo = { ...s0, vehicle: { ...s0.vehicle, cargo: 10 } };
  const at = (city: keyof typeof CITY_BY_ID) => CITY_BY_ID[city];
  const sold = (city: keyof typeof CITY_BY_ID) => {
    const r = sellCargo(cargo, at(city));
    return r.ok ? r.state.credits : -1;
  };
  expect(sold('ark')).toBe(40);
  expect(sold('citadel')).toBe(50);
  expect(sold('spire')).toBe(60);

  const empty = { ...s0, credits: 1000, vehicle: { ...s0.vehicle, fuel: 0, hp: 10 } };
  const fuelled = refuelFull(empty, at('ark'));
  expect(fuelled.ok && fuelled.state.credits).toBe(1000 - 40 * 6);
  const repaired = repairFull(empty, at('spire'));
  expect(repaired.ok && repaired.state.credits).toBe(1000 - 50 * 1);
});

test('each city stocks its own parts at its own prices', () => {
  const rich = { ...newGame(1), credits: 99999 };
  const ids = (city: keyof typeof CITY_BY_ID) =>
    shopRows(rich, CITY_BY_ID[city]).filter((r) => r.kind === 'part').map((r) => r.id);
  expect(ids('ark')).toContain('collector-3');
  expect(ids('ark')).not.toContain('armor-3');
  expect(ids('spire')).toContain('armor-3');
  expect(ids('spire')).not.toContain('collector-3');
  expect(ids('citadel')).toHaveLength(12);

  const spireArmor = shopRows(rich, CITY_BY_ID.spire).find((r) => r.id === 'armor-2');
  expect(spireArmor?.price).toBe(Math.round(900 * 1.05));
  const bought = buyPart(rich, 'armor-2', CITY_BY_ID.spire);
  expect(bought.ok && bought.state.credits).toBe(99999 - Math.round(900 * 1.05));
});

test('a city refuses to sell what it does not stock', () => {
  const rich = { ...newGame(1), credits: 99999 };
  expect(buyPart(rich, 'armor-3', CITY_BY_ID.ark)).toEqual({ ok: false, reason: 'nothing' });
});
