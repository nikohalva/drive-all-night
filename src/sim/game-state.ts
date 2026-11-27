import type { Escort } from './caravan';
import type { CityId } from '../config/cities';
import { HOME_GARAGE } from '../config/holdings';
import type { CrewMember } from './crew';
import type { Garage } from './garage';
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
  version: 9;
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
  /** Escort vehicles following the lead rig. */
  caravan: Escort[];
  nextEscortId: number;
  /** Hired crew. The player, the Road Captain, is not in this list. */
  crew: CrewMember[];
  nextCrewId: number;
  /** Recruit keys already signed on, so they are not offered again. */
  hired: string[];
  /** Credits in the cities' bank, safe from raiders. */
  bank: number;
  /** Garages bought or rented, by city. */
  garages: Partial<Record<CityId, Garage>>;
  /** Wreck ids: spotted and still to search, and already searched. */
  wrecks: { found: string[]; searched: string[] };
  /** Standing with each night baron you have dealt with (mine id -> relation). */
  barons: Record<string, { standing: number; allied: boolean }>;
}

/** A fresh game: dusk, beside the city on its dock side, facing the sunset. */
export function newGame(seed: number): GameState {
  const city = cityPosition(0);
  return {
    version: 9,
    seed,
    t: 0,
    player: { x: city.x + 40, y: city.y, heading: -Math.PI / 2 },
    vehicle: starterVehicle(),
    credits: 0,
    debt: 0,
    flags: { easyStartOver: false, firstRescueUsed: false, won: false, victoryShown: false },
    known: [],
    caravan: [],
    nextEscortId: 1,
    crew: [],
    nextCrewId: 1,
    hired: [],
    bank: 0,
    wrecks: { found: [], searched: [] },
    garages: { [HOME_GARAGE]: { owned: true, rentUntil: 0, parts: [], vehicles: [] } },
    barons: {},
  };
}
