/** The "wait for a city" choices, shared by baron halls and vacant mines. */
import { CITIES } from '../config/cities';
import { getState, setState } from '../game/session';
import { planetTimeLabel } from '../sim/clock';
import type { GameState } from '../sim/game-state';
import { rest, waitSeconds } from '../sim/shelter';

export interface RestRow {
  text: string;
  city: string;
  seconds: number;
}

export function restRows(s: GameState, y: number): RestRow[] {
  return CITIES.map((c) => ({ text: `WAIT FOR ${c.name}`, city: c.name, seconds: waitSeconds(s.t, y, c.id) }));
}

/** Sit it out and say what happened. */
export function restFor(row: RestRow): string {
  setState(rest(getState(), row.seconds));
  return `${planetTimeLabel(row.seconds)} PASS. ${row.city} IS ROLLING BY`;
}
