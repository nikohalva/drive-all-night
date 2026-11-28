/** Every tunable number in the game lives here. */
export const BALANCE = {
  /** World wraps along y (this length) and is bounded across x. */
  WORLD_LEN: 172800,
  WORLD_WIDTH: 4096,
  /** Impassable cliff band at each x edge. */
  EDGE: 64,
  /** Sun speed in px per world second (the sun travels toward -y). */
  SUN_SPEED: 36,
  SUN_START_Y: 0,
  /** Fractions of the night length. */
  SUNSET_ZONE_FRAC: 0.15,
  PREDAWN_FRAC: 0.8,
  /** Planet seconds shown per world second (a night is ~7 planet days). */
  PLANET_SECONDS_PER_SECOND: 252,
  /** The city stays this fraction of the night length behind the sunset line. */
  CITY_BEHIND_FRAC: 0.12,
  /** Particle X grid cell size in px. */
  CELL: 8,
  DENSITY_MAX: 0.45,
  DECAY_FRAC: 0.35,
  X_PER_CELL: 0.1,
  X_SELL_PRICE: 5,
  X_BUY_PRICE: 7,
  REPAIR_COST_PER_HP: 2,
  FUEL_PER_SECOND: 0.25,
  HEAT_BASE_DPS: 4,
  HEAT_RAMP: 200,
  DOCK_RADIUS: 40,
  CONTACT_RADIUS: 12,
  GRACE_SECONDS: 4,
  RESCUE_FUEL: 15,
  /** Longest a vehicle stranded on the scorched side survives while waiting for help. */
  SCORCH_SURVIVE_SECONDS: 20,
  /** Raiders still this far off after this long give up the chase. */
  CHASE_SECONDS: 12,
  CHASE_CLOSE: 60,
  /** This close to a city its guns keep every raider away. */
  CITY_SAFE_RADIUS: 300,
  TURBO_BOOST: 1.6,
  TURBO_SECONDS: 3,
  TURBO_RECHARGE: 20,
  TURBO_FUEL: 3,
} as const;

/** Night is half of the planet's circumference. */
export const NIGHT_LEN = BALANCE.WORLD_LEN / 2;
