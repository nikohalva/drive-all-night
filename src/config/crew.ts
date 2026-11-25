import type { HullId } from './catalog';
import type { EscortKind, Tier } from './escorts';

/** Hireable roles. The Road Captain is the player and is not one of them. */
export type CrewRole = 'driver' | 'mechanic' | 'gunner' | 'comms' | 'medic';
export const CREW_ROLES: readonly CrewRole[] = ['driver', 'mechanic', 'gunner', 'comms', 'medic'];

export const ROLE_NAME: Record<CrewRole, string> = {
  driver: 'DRIVER',
  mechanic: 'MECHANIC',
  gunner: 'GUNNER',
  comms: 'COMMS/NAV',
  medic: 'MEDIC',
};

export const ROLE_EFFECT: Record<CrewRole, string> = {
  driver: 'FASTER VEHICLE. ON YOUR RIG: LESS FUEL',
  mechanic: 'REPAIRS HULL ON THE MOVE, UP TO 60%',
  gunner: 'MORE DAMAGE AND ACCURACY',
  comms: 'SEES FARTHER, BETTER ESCAPES',
  medic: 'HEALS THE CREW AND SAVES LIVES',
};

/** 0 is a green hand: enough to run a vehicle, too raw to improve it. */
export type Skill = 0 | 1 | 2 | 3;
export const SKILL_NAME = ['GREEN', 'ABLE', 'SEASONED', 'LEGEND'] as const;

export type TraitId = 'steady' | 'tough' | 'lucky' | 'hardy' | 'thrifty' | 'dreamer' | 'grump' | 'joker';
export const TRAITS: Record<TraitId, { name: string; line: string }> = {
  steady: { name: 'STEADY', line: 'GETS HURT LESS OFTEN' },
  tough: { name: 'TOUGH', line: 'TAKES SMALLER WOUNDS' },
  lucky: { name: 'LUCKY', line: 'SOMETIMES CHEATS DEATH' },
  hardy: { name: 'HARDY', line: 'HEALS TWICE AS FAST' },
  thrifty: { name: 'THRIFTY', line: 'SIGNS ON FOR LESS' },
  dreamer: { name: 'DREAMER', line: 'TALKS ABOUT OTHER PLANETS' },
  grump: { name: 'GRUMP', line: 'NOTHING IS EVER GOOD ENOUGH' },
  joker: { name: 'JOKER', line: 'LAUGHS AT THE DAWN' },
};
export const TRAIT_IDS = Object.keys(TRAITS) as TraitId[];

export const FIRST_NAMES = [
  'ADA', 'BRAM', 'CASS', 'DEX', 'EDDA', 'FINN', 'GRIT', 'HOLLY', 'IVO', 'JUNO',
  'KAI', 'LUZ', 'MARA', 'NIKA', 'ORIN', 'PIA', 'QUILL', 'RAKE', 'SOL', 'TAMSIN',
  'ULF', 'VESNA', 'WREN', 'YARA', 'ZED',
] as const;
export const LAST_NAMES = [
  'ASHFORD', 'BOLT', 'CINDER', 'DUNE', 'EMBER', 'FLINT', 'GASKET', 'HALO', 'IRONS', 'JETT',
  'KOVAC', 'LUMEN', 'MOSS', 'NOVAK', 'OKAFOR', 'PIKE', 'QUASAR', 'REYES', 'STORM', 'VOSS',
] as const;

/** Hire seats on the lead rig, not counting the captain. */
export const LEAD_SEATS: Record<HullId, number> = { scout: 2, hauler: 4, juggernaut: 5 };
export const escortSeats = (tier: Tier): number => tier + 1;
export const RESERVE_SEATS = 3;

/** Who runs a newly bought escort. */
export const ROOKIE_ROLE: Record<EscortKind, CrewRole> = {
  collector: 'driver',
  gunship: 'gunner',
  guardian: 'driver',
  scout: 'comms',
  tanker: 'driver',
  medic: 'medic',
};

export const CREW = {
  /** Below this a person is too hurt to work. */
  FIT_HEALTH: 40,
  HIRE_PRICE: [0, 150, 450, 1100] as const,
  RECRUITS_PER_CITY: 4,
  /** World seconds before a city has new faces. */
  RECRUIT_SECONDS: 900,
  TREAT_PRICE_PER_HEALTH: 1,

  DRIVER_SPEED: 0.04,
  DRIVER_FUEL: 0.06,
  MECHANIC_REPAIR: 0.04,
  MECHANIC_LIMIT: 0.6,
  GUNNER_DAMAGE: 0.08,
  GUNNER_ACCURACY: 0.04,
  COMMS_SIGHT: 150,
  COMMS_FLEE: 0.05,

  HEAL_PER_SECOND: 0.03,
  MEDIC_HEAL_PER_SECOND: 0.08,
  MEDIC_SAVE: 0.2,
  LUCKY_SAVE: 0.35,
  /** Injury chance per share of the hull lost in a fight. */
  INJURY_PER_DAMAGE: 0.9,
  MAX_INJURY_CHANCE: 0.8,
  WRECK_INJURY_CHANCE: 0.85,
  WOUND_MIN: 15,
  WOUND_SPREAD: 45,
} as const;
