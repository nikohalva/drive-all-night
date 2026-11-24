import type { Temper, Standing } from './barons';
import { escortDef } from '../config/escorts';
import type { GameState } from './game-state';
import type { PirateGroup } from './pirate-fleet';
import type { Pirate } from './pirates';
import type { Rng } from './rng';
import { vehicleStats } from './vehicle';
import type { Zone } from './world';

export type Faction = 'pirates' | 'robbers' | 'baron';

/** Robbers trail the cities: this close to a city they are at their most common. */
export const ROBBER_CITY_RANGE = 3000;
/** Ground raiders crawl slower than they could, so a moving caravan can leave them behind. */
const GROUND_CHASE_FRACTION = 0.75;

const ROBBER_NAMES = ['RUST JACKAL', 'SAND LEECH', 'GRAVEL WOLF', 'DUST VIPER', 'SCRAP HOUND', 'BONE CRANE'];

/** Chance per second of a robber gang: near cities, worse for a hurt caravan, never by day. */
export function robberChancePerSecond(zone: Zone, distToCity: number, weak: boolean, easy: boolean): number {
  if (zone === 'scorch' || zone === 'dawn') return 0;
  let chance = distToCity < ROBBER_CITY_RANGE ? 0.006 : zone === 'sunset' ? 0 : 0.001;
  if (weak) chance *= 3;
  if (easy) chance *= 0.25;
  return chance;
}

/** Only hostile barons send war parties: near their mine, while it is night. */
export function baronChancePerSecond(zone: Zone, status: Standing, distToMine: number, easy = false): number {
  if (easy) return 0;
  const night = zone === 'sunset' || zone === 'deep' || zone === 'predawn';
  return status === 'HOSTILE' && night && distToMine < 4000 ? 0.02 : 0;
}

/** Robbers prey on the weak: a wrecked escort, or a lead under half its hull. */
export function isCaravanWeak(s: GameState): boolean {
  if (s.vehicle.hp < vehicleStats(s.vehicle).maxHp * 0.5) return true;
  return s.caravan.some((e) => e.hp <= 0 || e.hp < escortDef(e.kind, e.tier).hp * 0.25);
}

const groupSize = (level: number, easy: boolean): number =>
  easy ? 1 : 1 + (level >= 6 ? 1 : 0) + (level >= 10 ? 1 : 0);

export function makeRobberGroup(rng: Rng, level: number, easy: boolean): Pirate[] {
  const out: Pirate[] = [];
  for (let i = 0; i < groupSize(level, easy); i++) {
    const name = ROBBER_NAMES[Math.floor(rng() * ROBBER_NAMES.length) % ROBBER_NAMES.length];
    const L = level;
    if (i === 0) {
      out.push({ name, level, role: 'buggy', row: 'front', longRange: false, hp: 18 + 7 * L, maxHp: 18 + 7 * L, damage: 4 + 2 * L, accuracy: 0.7, armor: Math.floor(L / 4), speed: 80 + 4 * L });
    } else if (i === 1) {
      out.push({ name, level, role: 'harpoon', row: 'front', longRange: false, hp: 24 + 8 * L, maxHp: 24 + 8 * L, damage: 3 + 2 * L, accuracy: 0.65, armor: Math.floor(L / 3), speed: 70 + 4 * L });
    } else {
      out.push({ name, level, role: 'mortar', row: 'back', longRange: true, hp: 14 + 6 * L, maxHp: 14 + 6 * L, damage: 6 + 2 * L, accuracy: 0.55, armor: 0, speed: 60 + 3 * L });
    }
  }
  return out;
}

export function makeBaronParty(_rng: Rng, level: number, temper: Temper): Pirate[] {
  const L = level;
  const party: Pirate[] = [
    { name: 'WAR CRAWLER', level, role: 'crawler', row: 'front', longRange: false, hp: 40 + 10 * L, maxHp: 40 + 10 * L, damage: 5 + 2 * L, accuracy: 0.65, armor: 2 + Math.floor(L / 3), speed: 60 + 3 * L },
  ];
  // small parties are a lone crawler; a shade rides along from level 4
  if (level >= 4) {
    party.push({ name: 'SHADE', level, role: 'shade', row: 'back', longRange: true, hp: 20 + 6 * L, maxHp: 20 + 6 * L, damage: 7 + 2 * L, accuracy: 0.7, armor: 1, speed: 70 + 3 * L });
  }
  if (temper === 'warlike' && level >= 8) {
    party.push({ name: 'BARON CHAMPION', level, role: 'champion', row: 'front', longRange: false, hp: 80 + 14 * L, maxHp: 80 + 14 * L, damage: 8 + 3 * L, accuracy: 0.7, armor: 4 + Math.floor(L / 3), speed: 65 + 3 * L });
  }
  return party;
}

/** An allied clan rider who fights beside the caravan. */
export function makeClanRider(level: number): Pirate {
  const L = Math.max(2, level);
  return { name: 'CLAN RIDER', level: L, role: 'crawler', row: 'front', longRange: false, hp: 40 + 10 * L, maxHp: 40 + 10 * L, damage: 5 + 2 * L, accuracy: 0.7, armor: 2 + Math.floor(L / 3), speed: 80 };
}

/** Drive toward the target on the ground; slide along obstacles, stop if boxed in. */
export function stepGroundGroup(
  g: PirateGroup,
  target: { x: number; y: number },
  dt: number,
  blocked: (x: number, y: number) => boolean,
): PirateGroup {
  const d = Math.hypot(target.x - g.x, target.y - g.y);
  if (d === 0 || dt <= 0) return g;
  const speed = GROUND_CHASE_FRACTION * Math.max(0, ...g.pirates.map((p) => p.speed));
  const travel = Math.min(d, speed * dt);
  const dx = ((target.x - g.x) / d) * travel;
  const dy = ((target.y - g.y) / d) * travel;
  if (!blocked(g.x + dx, g.y + dy)) return { ...g, x: g.x + dx, y: g.y + dy };
  if (dx !== 0 && !blocked(g.x + Math.sign(dx) * travel, g.y)) return { ...g, x: g.x + Math.sign(dx) * travel };
  if (dy !== 0 && !blocked(g.x, g.y + Math.sign(dy) * travel)) return { ...g, y: g.y + Math.sign(dy) * travel };
  return g;
}
