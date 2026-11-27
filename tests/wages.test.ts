import { CITY_BY_ID } from '../src/config/cities';
import { PAY_PERIOD, RESERVE_SEATS, WAGE } from '../src/config/crew';
import { crewBonus, crewTime, hireCrew, payWages, recruitPool, seatsAt, settlePayday, wagesDue, type CrewMember } from '../src/sim/crew';
import { newGame, type GameState } from '../src/sim/game-state';
import { deserialize, serialize } from '../src/sim/save';

const ok = (r: { ok: boolean; state?: GameState }): GameState => {
  if (!r.ok || !r.state) throw new Error('expected an ok transaction');
  return r.state;
};
const hand = (patch: Partial<CrewMember> = {}): CrewMember => ({
  id: 1,
  name: 'MARA VOSS',
  role: 'driver',
  skill: 2,
  trait: 'grump',
  health: 100,
  face: 1,
  post: 'lead',
  owed: 0,
  missed: 0,
  ...patch,
});
const with_ = (...crew: CrewMember[]): GameState => ({ ...newGame(1), credits: 1000, crew });

test('wages build up while you drive, half for the reserve', () => {
  const s = with_(hand(), hand({ id: 2, post: null }));
  const later = crewTime(s, PAY_PERIOD);
  expect(later.crew[0].owed).toBeCloseTo(WAGE[2]);
  expect(later.crew[1].owed).toBeCloseTo(WAGE[2] / 2);
  expect(wagesDue(later)).toBe(Math.floor(WAGE[2]) + Math.floor(WAGE[2] / 2));
});

test('paying clears what is owed', () => {
  const s = with_(hand({ owed: 60.5, missed: 1 }));
  const paid = ok(payWages(s));
  expect(paid.credits).toBe(940);
  expect(paid.crew[0]).toMatchObject({ missed: 0 });
  expect(wagesDue(paid)).toBe(0);
  expect(payWages(paid)).toEqual({ ok: false, reason: 'nothing' });
});

test('short of money, you pay the ones you can, longest unpaid first', () => {
  const s = { ...with_(hand({ owed: 60 }), hand({ id: 2, owed: 50, missed: 1 })), credits: 55 };
  const paid = ok(payWages(s));
  expect(paid.credits).toBe(5);
  expect(paid.crew.map((m) => Math.floor(m.owed))).toEqual([60, 0]);
  expect(payWages({ ...s, credits: 10 })).toEqual({ ok: false, reason: 'credits' });
});

test('leaving without paying costs the bonus, and a second time they quit', () => {
  const s = with_(hand({ owed: 60 }));
  expect(crewBonus(s, 'lead', 'driver')).toBe(2);
  const once = settlePayday(s);
  expect(once.state.crew[0].missed).toBe(1);
  expect(crewBonus(once.state, 'lead', 'driver')).toBe(0);
  expect(once.report).toEqual(['UNPAID CREW GIVE NO BONUS']);
  const twice = settlePayday(once.state);
  expect(twice.state.crew).toEqual([]);
  expect(twice.report).toEqual(['MARA VOSS QUITS']);
});

test('a few minutes of wages is not yet a missed payday', () => {
  const s = with_(hand({ owed: WAGE[2] / 2 - 1 }));
  expect(settlePayday(s)).toEqual({ state: s, report: [] });
});

test('the reserve grows with the rig', () => {
  const s = newGame(1);
  expect(seatsAt(s, null)).toBe(RESERVE_SEATS.scout);
  expect(seatsAt({ ...s, vehicle: { ...s.vehicle, hullId: 'juggernaut' } }, null)).toBe(RESERVE_SEATS.juggernaut);
});

test('new people are owed nothing, and old saves start even', () => {
  const s = { ...newGame(1), credits: 5000 };
  const hired = ok(hireCrew(s, CITY_BY_ID.ark, recruitPool(s, CITY_BY_ID.ark)[0].key));
  expect(hired.crew[0]).toMatchObject({ owed: 0, missed: 0 });
  const old = JSON.parse(serialize(hired));
  old.version = 7;
  delete old.crew[0].owed;
  delete old.crew[0].missed;
  expect(deserialize(JSON.stringify(old))).toEqual(hired);
});
