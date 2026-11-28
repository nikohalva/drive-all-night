import { BALANCE } from '../config/balance';
import type { Rng } from './rng';
import { starterVehicle, vehicleStats } from './vehicle';
import type { Zone } from './world';

/** Enemy battle roles: front-liners close in, back-row shooters fire from range. */
export type EnemyRole = 'gunship' | 'bomber' | 'buggy' | 'harpoon' | 'mortar' | 'crawler' | 'shade' | 'champion';

/** An enemy combatant (the name is historical: robbers and baron clans use it too). */
export interface Pirate {
  name: string;
  level: number;
  role: EnemyRole;
  row: 'front' | 'back';
  longRange: boolean;
  hp: number;
  maxHp: number;
  damage: number;
  accuracy: number;
  armor: number;
  speed: number;
}

const NAMES = ['Razor Kite', 'Ash Vulture', 'Neon Shrike', 'Gutter Hawk', 'Dust Raptor', 'Cinder Gull'];

/** Chance per second that a pirate group shows up. Gentle during the easy start. */
export function spawnChancePerSecond(zone: Zone, cargo: number, easy: boolean): number {
  let chance = 0;
  if (zone === 'sunset') chance = 0.02 + 0.0002 * cargo;
  else if (zone === 'deep') chance = 0.004;
  return easy ? chance * 0.25 : chance;
}

/** The strength of a fresh, unupgraded rig; pirates scale with strength above this. */
const STARTER_STRENGTH = vehicleStats(starterVehicle()).strength;

/** Pirates grow with how far the player has upgraded past the starter, and with the cargo carried. */
export function pirateLevel(strength: number, cargo: number, easy: boolean): number {
  if (easy) return 1;
  return Math.max(1, Math.round(0.5 * (strength - STARTER_STRENGTH) + 1 + cargo / 100));
}

export function makePirateGroup(rng: Rng, level: number, easy: boolean): Pirate[] {
  const size = easy ? 1 : 1 + (level >= 6 ? 1 : 0) + (level >= 10 ? 1 : 0);
  const group: Pirate[] = [];
  for (let i = 0; i < size; i++) {
    // the first ship closes in; the others hang back and bomb from range
    const bomber = i > 0;
    const hp = 20 + 8 * level - (bomber ? 6 : 0);
    group.push({
      name: NAMES[Math.floor(rng() * NAMES.length) % NAMES.length],
      level,
      role: bomber ? 'bomber' : 'gunship',
      row: bomber ? 'back' : 'front',
      longRange: bomber,
      hp,
      maxHp: hp,
      damage: 4 + 2 * level + (bomber ? 2 : 0),
      accuracy: bomber ? 0.6 : 0.65,
      armor: Math.floor(level / 3),
      speed: 70 + 4 * level,
    });
  }
  return group;
}

/** Breathing room after a battle so the player is not trapped in a fight loop. */
export class Grace {
  private remaining = 0;

  constructor(private readonly seconds: number = BALANCE.GRACE_SECONDS) {}

  start(seconds = this.seconds): void {
    this.remaining = seconds;
  }

  tick(dt: number): void {
    this.remaining = Math.max(0, this.remaining - dt);
  }

  get active(): boolean {
    return this.remaining > 0;
  }
}
