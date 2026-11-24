export type CityId = 'ark' | 'citadel' | 'spire';

export interface CityDef {
  id: CityId;
  name: string;
  /** The lane (x) the city drives along; terrain keeps it clear. */
  laneX: number;
  /** How far behind the sunset line the city keeps, as a fraction of the night. */
  behindFrac: number;
  /** Credits paid per unit of Particle X. */
  sellPrice: number;
  /** Credits per unit of fuel when refuelling. */
  fuelPrice: number;
  /** Credits per hull point repaired. */
  repairPrice: number;
  /** Multiplier on catalog prices for parts and hulls. */
  priceFactor: number;
  /** Part ids this city sells (hulls and repair kits are sold everywhere). */
  stock: readonly string[];
  /** Sprite tint so cities read apart on the map and the road. */
  tint: number;
  /** Map / UI colour. */
  color: string;
}

const ALL_PARTS = [
  'engine-2', 'engine-3', 'tank-2', 'tank-3', 'collector-2', 'collector-3',
  'cargo-2', 'cargo-3', 'armor-2', 'armor-3', 'weapon-2', 'weapon-3',
] as const;

export const CITIES: readonly CityDef[] = [
  {
    id: 'ark',
    name: 'NEON ARK',
    laneX: 1100,
    behindFrac: 0.06,
    sellPrice: 4,
    fuelPrice: 6,
    repairPrice: 3,
    priceFactor: 0.95,
    stock: ['engine-2', 'engine-3', 'collector-2', 'collector-3', 'cargo-2', 'cargo-3', 'tank-2'],
    tint: 0xa8f0ff,
    color: '#7ffcff',
  },
  {
    id: 'citadel',
    name: 'DUSK CITADEL',
    laneX: 2048,
    behindFrac: 0.12,
    sellPrice: 5,
    fuelPrice: 7,
    repairPrice: 2,
    priceFactor: 1,
    stock: ALL_PARTS,
    tint: 0xffffff,
    color: '#ffd23f',
  },
  {
    id: 'spire',
    name: 'EMBER SPIRE',
    laneX: 3000,
    behindFrac: 0.24,
    sellPrice: 6,
    fuelPrice: 8,
    repairPrice: 1,
    priceFactor: 1.05,
    stock: ['armor-2', 'armor-3', 'weapon-2', 'weapon-3', 'tank-2', 'tank-3'],
    tint: 0xffb894,
    color: '#ff8a3d',
  },
];

export const CITY_BY_ID: Record<CityId, CityDef> = Object.fromEntries(CITIES.map((c) => [c.id, c])) as Record<
  CityId,
  CityDef
>;

export const START_CITY: CityId = 'citadel';

/** Lane (x) each moving city drives along. Terrain keeps these lanes clear. */
export const CITY_LANES: readonly number[] = CITIES.map((c) => c.laneX);

/** Half-width of the always-clear corridor around a city lane, in px. */
export const LANE_HALF = 140;
