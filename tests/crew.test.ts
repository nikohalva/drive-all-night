import { CITY_BY_ID } from '../src/config/cities';
import { CREW, LEAD_SEATS, escortSeats, type CrewRole, type Skill, type TraitId } from '../src/config/crew';
import { startBattle } from '../src/sim/battle';
import { buyEscort, caravanStats, sellEscort } from '../src/sim/caravan';
import {
  applyInjuries,
  crewAt,
  crewBonus,
  crewTime,
  dismissCrew,
  hireCrew,
  isCrewed,
  leadTopSpeed,
  assignCrew,
  reassignCrew,
  seatCandidate,
  recruitPool,
  seatsAt,
  treatCrew,
  treatmentCost,
  type CrewMember,
  type Post,
} from '../src/sim/crew';
import { newGame, type GameState } from '../src/sim/game-state';
import { deserialize, serialize } from '../src/sim/save';

const ok = (r: { ok: boolean; state?: GameState }): GameState => {
  if (!r.ok || !r.state) throw new Error('expected an ok transaction');
  return r.state;
};
const rich = (): GameState => ({ ...newGame(1), credits: 99999 });
let nextId = 100;
const person = (role: CrewRole, skill: Skill, post: Post, trait: TraitId = 'grump', health = 100): CrewMember => ({
  id: nextId++,
  name: `P ${nextId}`,
  role,
  skill,
  trait,
  health,
  face: nextId,
  post,
});
const withCrew = (s: GameState, ...crew: CrewMember[]): GameState => ({ ...s, crew: [...s.crew, ...crew] });

test('a new game has only the captain: no hired crew, two seats on the starting rig', () => {
  const s = newGame(1);
  expect(s.crew).toEqual([]);
  expect(seatsAt(s, 'lead')).toBe(LEAD_SEATS.scout);
  expect(caravanStats(s).topSpeed).toBe(80);
});

test('a bought escort brings one green hand who runs it without improving it', () => {
  const s = ok(buyEscort(rich(), 'scout', 1));
  expect(crewAt(s, 1)).toHaveLength(1);
  expect(s.crew[0]).toMatchObject({ role: 'comms', skill: 0, health: 100, post: 1 });
  expect(isCrewed(s, 1)).toBe(true);
  expect(seatsAt(s, 1)).toBe(escortSeats(1));
  expect(caravanStats(s).sight).toBe(700 + 400);
});

test('an escort with nobody fit aboard is towed: no sweeping, scouting or fighting', () => {
  let s = ok(buyEscort(rich(), 'collector', 1));
  s = ok(buyEscort(s, 'scout', 1));
  s = { ...s, crew: s.crew.map((m) => ({ ...m, health: CREW.FIT_HEALTH - 1 })) };
  const stats = caravanStats(s);
  expect(isCrewed(s, 1)).toBe(false);
  expect(stats.collectors).toEqual([]);
  expect(stats.sight).toBe(700);
  expect(stats.idle).toBe(2);
  expect(stats.cargoCap).toBe(60 + 60); // the hold is still towed along
  expect(startBattle(s, []).units.map((u) => u.uid)).toEqual(['lead']);
});

test('drivers speed the rig up and save fuel; only the best one of a role counts', () => {
  const s = withCrew(newGame(1), person('driver', 2, 'lead'), person('driver', 3, 'lead'));
  expect(crewBonus(s, 'lead', 'driver')).toBe(3);
  expect(leadTopSpeed(s)).toBeCloseTo(80 * (1 + 3 * CREW.DRIVER_SPEED));
  expect(caravanStats(s).fuelFactor).toBeCloseTo(1 - 3 * CREW.DRIVER_FUEL);
  expect(caravanStats(s).topSpeed).toBeCloseTo(80 * (1 + 3 * CREW.DRIVER_SPEED));
});

test('a hurt specialist gives nothing', () => {
  const s = withCrew(newGame(1), person('gunner', 3, 'lead', 'grump', 20));
  expect(crewBonus(s, 'lead', 'gunner')).toBe(0);
});

test('gunners and comms improve the battle', () => {
  const plain = startBattle(newGame(1), []);
  const manned = startBattle(withCrew(newGame(1), person('gunner', 3, 'lead'), person('comms', 2, 'lead')), []);
  expect(manned.units[0].guns[0].damage).toBeGreaterThan(plain.units[0].guns[0].damage);
  expect(manned.units[0].guns[0].accuracy).toBeGreaterThan(plain.units[0].guns[0].accuracy);
  expect(manned.fleeBonus).toBeCloseTo(2 * CREW.COMMS_FLEE);
});

test('a mechanic patches the hull on the move, but only so far and never a dead one', () => {
  const base = withCrew(newGame(1), person('mechanic', 3, 'lead'));
  const hurt = { ...base, vehicle: { ...base.vehicle, hp: 10 } };
  expect(crewTime(hurt, 10).vehicle.hp).toBeCloseTo(10 + 10 * 3 * CREW.MECHANIC_REPAIR);
  expect(crewTime(hurt, 100000).vehicle.hp).toBeCloseTo(60 * CREW.MECHANIC_LIMIT);
  const dead = { ...base, vehicle: { ...base.vehicle, hp: 0 } };
  expect(crewTime(dead, 100).vehicle.hp).toBe(0);
});

test('wounds heal over time, faster with a medic and for the hardy', () => {
  const s = withCrew(newGame(1), person('driver', 1, 'lead', 'grump', 20));
  expect(crewTime(s, 100).crew[0].health).toBeCloseTo(20 + 100 * CREW.HEAL_PER_SECOND);
  const tended = withCrew(s, person('medic', 2, 'lead'));
  expect(crewTime(tended, 100).crew[0].health).toBeCloseTo(
    20 + 100 * (CREW.HEAL_PER_SECOND + 2 * CREW.MEDIC_HEAL_PER_SECOND),
  );
  const hardy = withCrew(newGame(1), person('driver', 1, 'lead', 'hardy', 20));
  expect(crewTime(hardy, 100).crew[0].health).toBeCloseTo(20 + 200 * CREW.HEAL_PER_SECOND);
  expect(crewTime(s, 100000).crew[0].health).toBe(100);
});

test('no damage means no injuries', () => {
  const s = withCrew(newGame(1), person('driver', 1, 'lead'));
  const r = applyInjuries(s, s, () => 0);
  expect(r.state.crew).toEqual(s.crew);
  expect(r.report).toEqual([]);
});

test('heavy damage wounds the crew aboard that vehicle only', () => {
  let s = ok(buyEscort(rich(), 'guardian', 1));
  s = withCrew(s, person('driver', 1, 'lead'));
  const after = { ...s, vehicle: { ...s.vehicle, hp: 10 } };
  const r = applyInjuries(s, after, () => 0.5);
  const driver = r.state.crew.find((m) => m.post === 'lead')!;
  expect(driver.health).toBeLessThan(100);
  expect(r.state.crew.find((m) => m.post === 1)!.health).toBe(100);
  expect(r.report).toEqual([`${driver.name} IS WOUNDED`]);
});

test('a badly wounded person dies, unless luck or a medic saves them', () => {
  const s = withCrew(newGame(1), person('driver', 1, 'lead', 'grump', 10));
  const after = { ...s, vehicle: { ...s.vehicle, hp: 0 } };
  const dead = applyInjuries(s, after, () => 0.5);
  expect(dead.state.crew).toEqual([]);
  expect(dead.report[0]).toContain('DIED');

  const lucky = withCrew(newGame(1), person('driver', 1, 'lead', 'lucky', 10));
  const saved = applyInjuries(lucky, { ...lucky, vehicle: { ...lucky.vehicle, hp: 0 } }, () => 0.3);
  expect(saved.state.crew).toHaveLength(1);
  expect(saved.state.crew[0].health).toBeGreaterThan(0);
});

test('cities offer recruits that stay the same for a while and vanish once hired', () => {
  const s = rich();
  const pool = recruitPool(s, CITY_BY_ID.ark);
  expect(pool).toHaveLength(CREW.RECRUITS_PER_CITY);
  expect(recruitPool({ ...s, t: 100 }, CITY_BY_ID.ark)).toEqual(pool);
  expect(recruitPool({ ...s, t: CREW.RECRUIT_SECONDS + 1 }, CITY_BY_ID.ark)).not.toEqual(pool);

  const hired = ok(hireCrew(s, CITY_BY_ID.ark, pool[0].key));
  expect(hired.credits).toBe(s.credits - pool[0].price);
  expect(hired.crew[0]).toMatchObject({ name: pool[0].name, post: 'lead' });
  expect(recruitPool(hired, CITY_BY_ID.ark).map((r) => r.key)).not.toContain(pool[0].key);
  expect(hireCrew(hired, CITY_BY_ID.ark, pool[0].key)).toEqual({ ok: false, reason: 'nothing' });
  expect(hireCrew(newGame(1), CITY_BY_ID.ark, pool[1].key)).toEqual({ ok: false, reason: 'credits' });
});

test('you cannot hire with every seat and the reserve full', () => {
  let s = rich();
  s = withCrew(s, ...[0, 1].map(() => person('driver', 1, 'lead')), ...[0, 1, 2].map(() => person('driver', 1, null)));
  const pool = recruitPool(s, CITY_BY_ID.ark);
  expect(hireCrew(s, CITY_BY_ID.ark, pool[0].key)).toEqual({ ok: false, reason: 'slot' });
});

/** A game with one captured, uncrewed escort (id 1). */
const withEmptyShip = (): GameState => ({
  ...rich(),
  caravan: [{ id: 1, kind: 'gunship', tier: 1, hp: 20 }],
  nextEscortId: 2,
});

test('a new hire goes to a vehicle nobody is running before anywhere else', () => {
  const s = withEmptyShip();
  const hired = ok(hireCrew(s, CITY_BY_ID.ark, recruitPool(s, CITY_BY_ID.ark)[0].key));
  expect(hired.crew[0].post).toBe(1);
  expect(isCrewed(hired, 1)).toBe(true);
});

test('an empty seat offers someone from the reserve, then from your rig', () => {
  expect(seatCandidate(withEmptyShip(), 1)).toBeNull(); // only the captain: nobody to send
  const onRig = withCrew(withEmptyShip(), person('driver', 1, 'lead'));
  expect(seatCandidate(onRig, 1)).toEqual(onRig.crew[0]);
  const both = withCrew(onRig, person('gunner', 1, null));
  expect(seatCandidate(both, 1)).toEqual(both.crew[1]);
  const moved = ok(assignCrew(both, both.crew[1].id, 1));
  expect(moved.crew[1].post).toBe(1);
});

test('filling a seat never strips another escort of its only fit hand', () => {
  let s = ok(buyEscort(rich(), 'scout', 1)); // escort 1, one green hand
  s = { ...s, caravan: [...s.caravan, { id: 9, kind: 'tanker', tier: 1, hp: 40 }] };
  expect(seatCandidate(s, 9)).toBeNull();
  const spare = withCrew(s, person('driver', 1, 1));
  expect(seatCandidate(spare, 9)).not.toBeNull();
});

test('someone can be taken off a vehicle into the reserve, if there is room there', () => {
  const s = withCrew(newGame(1), person('driver', 1, 'lead'));
  expect(ok(assignCrew(s, s.crew[0].id, null)).crew[0].post).toBeNull();
  const full = withCrew(s, ...[0, 1, 2].map(() => person('driver', 1, null)));
  expect(assignCrew(full, full.crew[0].id, null)).toEqual({ ok: false, reason: 'slot' });
});

test('you cannot assign someone to a full vehicle', () => {
  const s = withCrew(newGame(1), person('driver', 1, 'lead'), person('medic', 1, 'lead'), person('gunner', 1, null));
  expect(assignCrew(s, s.crew[2].id, 'lead')).toEqual({ ok: false, reason: 'slot' });
});

test('reassigning moves a person through the vehicles with room, then the reserve', () => {
  let s = ok(buyEscort(rich(), 'gunship', 1));
  s = withCrew(s, person('driver', 1, 'lead'));
  const id = s.crew[s.crew.length - 1].id;
  const post = (g: GameState) => g.crew.find((m) => m.id === id)!.post;
  s = ok(reassignCrew(s, id));
  expect(post(s)).toBe(1);
  s = ok(reassignCrew(s, id));
  expect(post(s)).toBeNull();
  s = ok(reassignCrew(s, id));
  expect(post(s)).toBe('lead');
});

test('selling an escort sends its crew to the reserve, and crew can be dismissed', () => {
  let s = ok(buyEscort(rich(), 'tanker', 1));
  s = ok(sellEscort(s, 1));
  expect(s.crew[0].post).toBeNull();
  s = ok(dismissCrew(s, s.crew[0].id));
  expect(s.crew).toEqual([]);
});

test('a city can treat the wounded for a price', () => {
  const s = withCrew(rich(), person('driver', 1, 'lead', 'grump', 30));
  expect(treatmentCost(s)).toBe(70 * CREW.TREAT_PRICE_PER_HEALTH);
  const healed = ok(treatCrew(s));
  expect(healed.crew[0].health).toBe(100);
  expect(healed.credits).toBe(99999 - 70);
  expect(treatCrew(healed)).toEqual({ ok: false, reason: 'nothing' });
});

test('crew survive a save, and an older save gets a hand for every escort', () => {
  const s = ok(buyEscort(rich(), 'scout', 1));
  expect(deserialize(serialize(s))).toEqual(s);

  const old = JSON.parse(serialize(s));
  old.version = 4;
  delete old.crew;
  delete old.nextCrewId;
  delete old.hired;
  const loaded = deserialize(JSON.stringify(old))!;
  expect(loaded.version).toBe(7);
  expect(loaded.crew).toHaveLength(1);
  expect(isCrewed(loaded, 1)).toBe(true);
});
