/** Paid transport between cities: the whole caravan, no raiders, but time still passes. */
import { BALANCE, NIGHT_LEN } from '../config/balance';
import { CITIES, CITY_BY_ID, type CityId } from '../config/cities';
import type { TxResult } from './economy';
import type { GameState } from './game-state';
import { cityPos, nearestCopy } from './world';

export const SHUTTLE = {
  BASE_FARE: 150,
  /** Credits per 1000 px carried. */
  PER_THOUSAND: 10,
  PER_VEHICLE: 50,
  /** px per world second, relative to the cities. */
  SPEED: 200,
} as const;

export interface Trip {
  to: CityId;
  name: string;
  fare: number;
  seconds: number;
}

/** Cities all roll at the same speed, so the gap between two of them never changes. */
function gap(from: CityId, to: CityId): number {
  const a = CITY_BY_ID[from];
  const b = CITY_BY_ID[to];
  const along = Math.abs(a.behindFrac - b.behindFrac) * NIGHT_LEN;
  return Math.hypot(a.laneX - b.laneX, Math.min(along, BALANCE.WORLD_LEN - along));
}

export function shuttleTrips(s: GameState, from: CityId): Trip[] {
  return CITIES.filter((c) => c.id !== from).map((c) => {
    const distance = gap(from, c.id);
    const fare = SHUTTLE.BASE_FARE + (distance / 1000) * SHUTTLE.PER_THOUSAND + s.caravan.length * SHUTTLE.PER_VEHICLE;
    return { to: c.id, name: c.name, fare: Math.round(fare / 10) * 10, seconds: distance / SHUTTLE.SPEED };
  });
}

export function rideShuttle(s: GameState, from: CityId, to: CityId): TxResult {
  const trip = shuttleTrips(s, from).find((t) => t.to === to);
  if (!trip) return { ok: false, reason: 'nothing' };
  if (s.credits < trip.fare) return { ok: false, reason: 'credits' };
  const t = s.t + trip.seconds;
  const city = cityPos(to, t);
  return {
    ok: true,
    state: {
      ...s,
      t,
      credits: s.credits - trip.fare,
      // set down beside the dock, as if you had just driven out of it
      player: { x: city.x + 40, y: nearestCopy(city.y, s.player.y), heading: -Math.PI / 2 },
    },
  };
}
