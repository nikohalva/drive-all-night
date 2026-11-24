import { starterVehicle, type VehicleState } from './vehicle';
import { cityPosition } from './world';

export interface GameFlags {
  /** False until the player's first sale at the city. */
  easyStartOver: boolean;
  firstRescueUsed: boolean;
  /** Set when the largest hull is bought. */
  won: boolean;
  victoryShown: boolean;
}

export interface GameState {
  version: 2;
  seed: number;
  /** World seconds (play time with the world clock running). */
  t: number;
  player: { x: number; y: number; heading: number };
  vehicle: VehicleState;
  credits: number;
  debt: number;
  flags: GameFlags;
  /** Ids of night baron mines the player has found (cities are always known). */
  known: string[];
}

/** A fresh game: dusk, beside the city on its dock side, facing the sunset. */
export function newGame(seed: number): GameState {
  const city = cityPosition(0);
  return {
    version: 2,
    seed,
    t: 0,
    player: { x: city.x + 40, y: city.y, heading: -Math.PI / 2 },
    vehicle: starterVehicle(),
    credits: 0,
    debt: 0,
    flags: { easyStartOver: false, firstRescueUsed: false, won: false, victoryShown: false },
    known: [],
  };
}
