import { DepletionMap } from '../sim/particles';
import { newGame, type GameState } from '../sim/game-state';
import { randomSeed } from '../sim/rng';

/** The one live game, shared by every scene. */
let state: GameState = newGame(randomSeed());
let depletion = new DepletionMap();

export const getState = (): GameState => state;
export const setState = (s: GameState): void => {
  state = s;
};

export const getDepletion = (): DepletionMap => depletion;
export const resetDepletion = (): void => {
  depletion = new DepletionMap();
};

export type DestroyReason = 'dawn' | 'heat';

/** Set by the driving scene; anything that ends a run calls it. */
export const hooks: { onDestroyed: (reason: DestroyReason) => void } = {
  onDestroyed: () => {},
};

/** What the driving scene tells the HUD each frame. */
export interface UiInfo {
  nearDock: boolean;
  /** Name of the city whose dock the rig is beside. */
  dockName: string | null;
  scorching: boolean;
  broken: boolean;
  /** Fuel is low and cargo could top it up. */
  fuelHint: boolean;
  /** A big centred message (for example "THE DAWN CAUGHT YOU"). */
  message: string | null;
  /** Name of the baron whose open mine entrance the rig is at. */
  nearMine: string | null;
  /** At a mine entrance that is sealed for the day. */
  mineSealed: boolean;
  /** Beside a wreck that has not been searched. */
  nearWreck: boolean;
  /** A short notice at the top of the screen, shown until `toastUntil` (game time, ms). */
  toast: string | null;
  toastUntil: number;
}

export const ui: UiInfo = { nearDock: false, dockName: null, scorching: false, broken: false, fuelHint: false, message: null, nearMine: null, mineSealed: false, nearWreck: false, toast: null, toastUntil: 0 };
