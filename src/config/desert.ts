/** Things in the desert. Scenery is only to look at; wrecks are places you can stop at. */

export const SCENERY_KINDS = ['bones', 'glass', 'pylon', 'spire', 'crater', 'tracks'] as const;
export type SceneryKind = (typeof SCENERY_KINDS)[number];

/** One scenery piece at most per cell. Cell sizes divide the world evenly. */
export const SCENERY = { CELL: 128, CHANCE: 0.4 } as const;

export const WRECK = {
  CELL_W: 512,
  CELL_H: 600,
  CHANCE: 0.3,
  /** How close you must be to search one. */
  REACH: 36,

  PART_CHANCE: 0.45,
  /** Share of found parts that are tier 3. */
  RARE_PART: 0.15,
  FUEL_CHANCE: 0.7,
  FUEL_MIN: 8,
  FUEL_SPREAD: 20,
  CARGO_MIN: 5,
  CARGO_SPREAD: 20,
  SURVIVOR_CHANCE: 0.15,
} as const;
