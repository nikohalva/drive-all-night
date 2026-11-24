import { BALANCE } from '../config/balance';

/** Longest frame we will simulate; a hidden tab hands back a huge delta. */
export const MAX_FRAME_SECONDS = 0.1;

/** Advance world time t (seconds) by a frame delta; frozen when paused. */
export function advance(t: number, deltaMs: number, paused: boolean): number {
  if (paused) return t;
  return t + Math.min(Math.max(deltaMs, 0) / 1000, MAX_FRAME_SECONDS);
}

/** Real seconds shown as planet time, e.g. "3D 04H". */
export function planetTimeLabel(realSeconds: number): string {
  if (!Number.isFinite(realSeconds)) return '--';
  const planetSeconds = Math.round(realSeconds * BALANCE.PLANET_SECONDS_PER_SECOND);
  const days = Math.floor(planetSeconds / 86400);
  const hours = Math.floor((planetSeconds % 86400) / 3600);
  return `${days}D ${String(hours).padStart(2, '0')}H`;
}
