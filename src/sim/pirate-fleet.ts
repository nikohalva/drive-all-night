import { BALANCE } from '../config/balance';
import { makePirateGroup, pirateLevel, spawnChancePerSecond, type Pirate } from './pirates';
import type { Rng } from './rng';
import type { Zone } from './world';

export interface PirateGroup {
  id: number;
  x: number;
  y: number;
  level: number;
  pirates: Pirate[];
}

export interface FleetContext {
  zone: Zone;
  cargo: number;
  strength: number;
  easy: boolean;
  /** True for a few seconds after a battle. */
  graceActive: boolean;
  /** The hull is at zero: nothing is left to fight with, so no new pirates come. */
  helpless: boolean;
}

/** Pirates appear this far toward the sunset from the player, spread this wide either side. */
export const SPAWN_DISTANCE = 220;
export const SPAWN_SPREAD = 120;
/** A warning shows once a group is this close. */
export const WARN_DISTANCE = 160;
/** A group that is left this far behind gives up the chase. */
export const GIVE_UP_DISTANCE = 600;
/** Gunships chase well below their top speed so a rig at full throttle can outrun early groups. */
const CHASE_SPEED_FRACTION = 0.8;
/** Keep spawns clear of the cliff walls. */
const WALL_MARGIN = 20;

export const groupCap = (easy: boolean): number => (easy ? 1 : 2);

/** Called about once a second: maybe a new pirate group shows up near the player. */
export function maybeSpawnGroup(
  rng: Rng,
  groups: readonly PirateGroup[],
  player: { x: number; y: number },
  ctx: FleetContext,
  id: number,
): PirateGroup | null {
  if (ctx.graceActive || ctx.helpless || groups.length >= groupCap(ctx.easy)) return null;
  if (rng() >= spawnChancePerSecond(ctx.zone, ctx.cargo, ctx.easy)) return null;

  const level = pirateLevel(ctx.strength, ctx.cargo, ctx.easy);
  const pirates = makePirateGroup(rng, level, ctx.easy);
  const lo = BALANCE.EDGE + WALL_MARGIN;
  const hi = BALANCE.WORLD_WIDTH - BALANCE.EDGE - WALL_MARGIN;
  const x = Math.min(hi, Math.max(lo, player.x + (rng() * 2 - 1) * SPAWN_SPREAD));
  return { id, x, y: player.y - SPAWN_DISTANCE, level, pirates };
}

export const groupSpeed = (g: PirateGroup): number =>
  CHASE_SPEED_FRACTION * Math.max(0, ...g.pirates.map((p) => p.speed));

const distance = (g: PirateGroup, target: { x: number; y: number }): number =>
  Math.hypot(target.x - g.x, target.y - g.y);

/** Fly straight at the target; never overshoots it. */
export function stepGroup(g: PirateGroup, target: { x: number; y: number }, dt: number): PirateGroup {
  const d = distance(g, target);
  if (d === 0 || dt <= 0) return g;
  const travel = Math.min(d, groupSpeed(g) * dt);
  return { ...g, x: g.x + ((target.x - g.x) / d) * travel, y: g.y + ((target.y - g.y) / d) * travel };
}

export const inContact = (g: PirateGroup, target: { x: number; y: number }): boolean =>
  distance(g, target) <= BALANCE.CONTACT_RADIUS;

export const shouldGiveUp = (g: PirateGroup, target: { x: number; y: number }): boolean =>
  distance(g, target) > GIVE_UP_DISTANCE;

export const isWarning = (g: PirateGroup, target: { x: number; y: number }): boolean =>
  distance(g, target) < WARN_DISTANCE;
