/**
 * The people aboard the caravan. The player is the Road Captain and is always on the lead rig;
 * everyone here was hired (or came with an escort).
 */
import { cityPrice, CITIES, type CityDef } from '../config/cities';
import {
  CREW,
  CREW_ROLES,
  FIRST_NAMES,
  LAST_NAMES,
  LEAD_SEATS,
  RESERVE_SEATS,
  ROOKIE_ROLE,
  TRAIT_IDS,
  escortSeats,
  type CrewRole,
  type Skill,
  type TraitId,
} from '../config/crew';
import { escortDef, type EscortKind } from '../config/escorts';
import type { TxResult } from './economy';
import type { GameState } from './game-state';
import { hash2, makeRng, type Rng } from './rng';
import { vehicleStats } from './vehicle';

/** Where someone rides: the lead rig, an escort (by id) or the reserve (null). */
export type Post = 'lead' | number | null;

export interface CrewMember {
  id: number;
  name: string;
  role: CrewRole;
  skill: Skill;
  trait: TraitId;
  /** 0-100. Below CREW.FIT_HEALTH they cannot work. */
  health: number;
  /** Seed for the portrait. */
  face: number;
  post: Post;
}

export interface Recruit {
  key: string;
  name: string;
  role: CrewRole;
  skill: Skill;
  trait: TraitId;
  face: number;
  price: number;
}

export const isFit = (m: CrewMember): boolean => m.health >= CREW.FIT_HEALTH;
export const crewAt = (s: GameState, post: Post): CrewMember[] => s.crew.filter((m) => m.post === post);
export const isCrewed = (s: GameState, escortId: number): boolean => crewAt(s, escortId).some(isFit);

export function seatsAt(s: GameState, post: Post): number {
  if (post === null) return RESERVE_SEATS;
  if (post === 'lead') return LEAD_SEATS[s.vehicle.hullId];
  const e = s.caravan.find((x) => x.id === post);
  return e ? escortSeats(e.tier) : 0;
}

const hasRoom = (s: GameState, post: Post): boolean => crewAt(s, post).length < seatsAt(s, post);

/** Skill of the best fit person of a role aboard; 0 when there is none. */
export function crewBonus(s: GameState, post: Post, role: CrewRole): number {
  return crewAt(s, post).reduce((best, m) => (m.role === role && isFit(m) ? Math.max(best, m.skill) : best), 0);
}

/** The best of a role anywhere in the caravan (not counting the reserve). */
export function caravanBonus(s: GameState, role: CrewRole): number {
  return s.crew.reduce((best, m) => (m.post !== null && m.role === role && isFit(m) ? Math.max(best, m.skill) : best), 0);
}

export const driverSpeed = (s: GameState, post: Post, base: number): number =>
  base * (1 + CREW.DRIVER_SPEED * crewBonus(s, post, 'driver'));

export const leadTopSpeed = (s: GameState): number => driverSpeed(s, 'lead', vehicleStats(s.vehicle).topSpeed);

/** A gun as fired by this vehicle's crew. */
export function crewGun<T extends { damage: number; accuracy: number }>(s: GameState, post: Post, gun: T): T {
  const skill = crewBonus(s, post, 'gunner');
  return {
    ...gun,
    damage: Math.round(gun.damage * (1 + CREW.GUNNER_DAMAGE * skill)),
    accuracy: Math.min(0.95, gun.accuracy + CREW.GUNNER_ACCURACY * skill),
  };
}

/** Time passing on the road: wounds close and mechanics patch their own vehicle. */
export function crewTime(s: GameState, dt: number): GameState {
  if (dt <= 0) return s;
  const medic = caravanBonus(s, 'medic');
  const rate = CREW.HEAL_PER_SECOND + CREW.MEDIC_HEAL_PER_SECOND * medic;
  const crew = s.crew.map((m) =>
    m.health >= 100 ? m : { ...m, health: Math.min(100, m.health + rate * (m.trait === 'hardy' ? 2 : 1) * dt) },
  );

  const patched = (post: Post, hp: number, maxHp: number): number => {
    const limit = maxHp * CREW.MECHANIC_LIMIT;
    const skill = crewBonus(s, post, 'mechanic');
    if (skill === 0 || hp <= 0 || hp >= limit) return hp;
    return Math.min(limit, hp + CREW.MECHANIC_REPAIR * skill * dt);
  };
  const vehicle = { ...s.vehicle, hp: patched('lead', s.vehicle.hp, vehicleStats(s.vehicle).maxHp) };
  const caravan = s.caravan.map((e) => ({ ...e, hp: patched(e.id, e.hp, escortDef(e.kind, e.tier).hp) }));
  return { ...s, crew, vehicle, caravan };
}

/**
 * Who got hurt, judged by the hull each vehicle lost between `before` and `after`.
 * Returns the new state and one line per casualty.
 */
export function applyInjuries(before: GameState, after: GameState, rng: Rng): { state: GameState; report: string[] } {
  /** Share of the hull lost, and whether the vehicle is now dead. */
  const damage = (post: Post): { share: number; wrecked: boolean } => {
    if (post === null) return { share: 0, wrecked: false };
    if (post === 'lead') {
      const lost = before.vehicle.hp - after.vehicle.hp;
      return { share: lost / vehicleStats(before.vehicle).maxHp, wrecked: lost > 0 && after.vehicle.hp <= 0 };
    }
    const was = before.caravan.find((e) => e.id === post);
    const now = after.caravan.find((e) => e.id === post);
    if (!was || !now) return { share: 0, wrecked: false };
    const lost = was.hp - now.hp;
    return { share: lost / escortDef(was.kind, was.tier).hp, wrecked: lost > 0 && now.hp <= 0 };
  };

  const medic = caravanBonus(before, 'medic');
  const report: string[] = [];
  const crew: CrewMember[] = [];
  for (const m of after.crew) {
    const { share, wrecked } = damage(m.post);
    if (share <= 0) {
      crew.push(m);
      continue;
    }
    let chance = wrecked
      ? CREW.WRECK_INJURY_CHANCE
      : Math.min(CREW.MAX_INJURY_CHANCE, share * CREW.INJURY_PER_DAMAGE);
    if (m.trait === 'steady') chance *= 0.8;
    if (rng() >= chance) {
      crew.push(m);
      continue;
    }
    const wound = (CREW.WOUND_MIN + rng() * CREW.WOUND_SPREAD * (1 + share)) * (m.trait === 'tough' ? 0.7 : 1);
    const health = m.health - wound;
    if (health > 0) {
      crew.push({ ...m, health });
      report.push(`${m.name} IS WOUNDED`);
    } else if ((m.trait === 'lucky' && rng() < CREW.LUCKY_SAVE) || (medic > 0 && rng() < CREW.MEDIC_SAVE * medic)) {
      crew.push({ ...m, health: 5 });
      report.push(`${m.name} BARELY SURVIVES`);
    } else {
      report.push(`${m.name} HAS DIED`);
    }
  }
  return { state: { ...after, crew }, report };
}

const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)];

function person(rng: Rng): { name: string; trait: TraitId; face: number } {
  return {
    name: `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`,
    trait: pick(rng, TRAIT_IDS),
    face: Math.floor(rng() * 1_000_000),
  };
}

/** The green hand who comes with a newly bought escort. */
export function rookie(seed: number, id: number, kind: EscortKind, escortId: number): CrewMember {
  const rng = makeRng(Math.floor(hash2(seed, id, 7919) * 4294967296));
  return { id, ...person(rng), role: ROOKIE_ROLE[kind], skill: 0, health: 100, post: escortId };
}

/** Someone pulled out of a wreck. Null when there is no seat for them. */
export function addSurvivor(s: GameState, seed: number): { state: GameState; member: CrewMember } | null {
  const post = (['lead', ...s.caravan.map((e) => e.id), null] as Post[]).find((p) => hasRoom(s, p));
  if (post === undefined) return null;
  const rng = makeRng(seed);
  const skill: Skill = rng() < 0.8 ? 1 : 2;
  const role = pick(rng, CREW_ROLES);
  // they come out of it hurt
  const member: CrewMember = { id: s.nextCrewId, ...person(rng), role, skill, health: 60, post };
  return { state: { ...s, crew: [...s.crew, member], nextCrewId: s.nextCrewId + 1 }, member };
}

/** Who is looking for work in this city right now. */
export function recruitPool(s: GameState, city: CityDef): Recruit[] {
  const epoch = Math.floor(s.t / CREW.RECRUIT_SECONDS);
  const cityIndex = CITIES.findIndex((c) => c.id === city.id);
  const out: Recruit[] = [];
  for (let i = 0; i < CREW.RECRUITS_PER_CITY; i++) {
    const key = `${city.id}:${epoch}:${i}`;
    if (s.hired.includes(key)) continue;
    const rng = makeRng(Math.floor(hash2(s.seed, epoch, cityIndex * 16 + i) * 4294967296));
    const roll = rng();
    const skill: Skill = roll < 0.6 ? 1 : roll < 0.9 ? 2 : 3;
    const role = pick(rng, CREW_ROLES);
    const who = person(rng);
    const price = cityPrice(Math.round(CREW.HIRE_PRICE[skill] * (who.trait === 'thrifty' ? 0.7 : 1)), city);
    out.push({ key, role, skill, price, ...who });
  }
  return out;
}

export function hireCrew(s: GameState, city: CityDef, key: string): TxResult {
  const recruit = recruitPool(s, city).find((r) => r.key === key);
  if (!recruit) return { ok: false, reason: 'nothing' };
  const post = ([ 'lead', ...s.caravan.map((e) => e.id), null] as Post[]).find((p) => hasRoom(s, p));
  if (post === undefined) return { ok: false, reason: 'slot' };
  if (s.credits < recruit.price) return { ok: false, reason: 'credits' };
  const { name, role, skill, trait, face } = recruit;
  return {
    ok: true,
    state: {
      ...s,
      credits: s.credits - recruit.price,
      crew: [...s.crew, { id: s.nextCrewId, name, role, skill, trait, face, health: 100, post }],
      nextCrewId: s.nextCrewId + 1,
      // old keys can never come up again, so only the latest need remembering
      hired: [...s.hired, key].slice(-24),
    },
  };
}

/** Move someone to the next vehicle with a free seat; after the last comes the reserve. */
export function reassignCrew(s: GameState, id: number): TxResult {
  const m = s.crew.find((x) => x.id === id);
  if (!m) return { ok: false, reason: 'nothing' };
  const posts: Post[] = ['lead', ...s.caravan.map((e) => e.id), null];
  const at = posts.indexOf(m.post);
  for (let step = 1; step < posts.length; step++) {
    const next = posts[(at + step) % posts.length];
    if (!hasRoom(s, next)) continue;
    return { ok: true, state: { ...s, crew: s.crew.map((x) => (x.id === id ? { ...x, post: next } : x)) } };
  }
  return { ok: false, reason: 'slot' };
}

export function dismissCrew(s: GameState, id: number): TxResult {
  if (!s.crew.some((m) => m.id === id)) return { ok: false, reason: 'nothing' };
  return { ok: true, state: { ...s, crew: s.crew.filter((m) => m.id !== id) } };
}

export const treatmentCost = (s: GameState): number =>
  Math.ceil(s.crew.reduce((n, m) => n + (100 - m.health), 0) * CREW.TREAT_PRICE_PER_HEALTH);

/** City doctors: everyone back to full health, if you can pay for all of it. */
export function treatCrew(s: GameState): TxResult {
  const cost = treatmentCost(s);
  if (cost <= 0) return { ok: false, reason: 'nothing' };
  if (s.credits < cost) return { ok: false, reason: 'credits' };
  return { ok: true, state: { ...s, credits: s.credits - cost, crew: s.crew.map((m) => ({ ...m, health: 100 })) } };
}
