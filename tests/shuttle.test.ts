import { CITY_BY_ID } from '../src/config/cities';
import { buyEscort } from '../src/sim/caravan';
import { newGame, type GameState } from '../src/sim/game-state';
import { rideShuttle, SHUTTLE, shuttleTrips } from '../src/sim/shuttle';
import { cityPos, nearestCopy, zoneAt } from '../src/sim/world';

const ok = (r: { ok: boolean; state?: GameState }): GameState => {
  if (!r.ok || !r.state) throw new Error('expected an ok transaction');
  return r.state;
};
const rich = (): GameState => ({ ...newGame(1), credits: 99999 });

test('a city offers a shuttle to each of the others', () => {
  const trips = shuttleTrips(rich(), 'spire');
  expect(trips.map((t) => t.to)).toEqual(['ark', 'citadel']);
  const citadel = trips.find((t) => t.to === 'citadel')!;
  expect(citadel.fare).toBeGreaterThan(SHUTTLE.BASE_FARE);
  expect(citadel.seconds).toBeGreaterThan(30);
  expect(citadel.seconds).toBeLessThan(120);
});

test('a longer ride and a bigger caravan cost more', () => {
  const [ark, citadel] = shuttleTrips(rich(), 'spire');
  expect(ark.fare).toBeGreaterThan(citadel.fare);
  const convoy = ok(buyEscort(rich(), 'tanker', 1, CITY_BY_ID.ark));
  const bigger = shuttleTrips(convoy, 'spire')[1];
  expect(bigger.fare).toBe(citadel.fare + SHUTTLE.PER_VEHICLE);
});

test('riding takes the fare, passes the time and puts you beside the other city', () => {
  const s = rich();
  const trip = shuttleTrips(s, 'spire')[1];
  const r = ok(rideShuttle(s, 'spire', 'citadel'));
  expect(r.credits).toBe(s.credits - trip.fare);
  expect(r.t).toBeCloseTo(trip.seconds);
  const city = cityPos('citadel', r.t);
  expect(Math.hypot(r.player.x - city.x, r.player.y - nearestCopy(city.y, r.player.y))).toBeLessThan(60);
  expect(['sunset', 'deep']).toContain(zoneAt(r.player.y, r.t));
  // nothing else about the caravan changes on the way
  expect(r.vehicle).toEqual(s.vehicle);
});

test('no fare, no ride, and nowhere to go from a city to itself', () => {
  expect(rideShuttle(newGame(1), 'spire', 'citadel')).toEqual({ ok: false, reason: 'credits' });
  expect(rideShuttle(rich(), 'spire', 'spire')).toEqual({ ok: false, reason: 'nothing' });
});
