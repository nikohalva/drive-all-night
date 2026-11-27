import type { SlotType } from './catalog';
import type { EscortKind } from './escorts';

/** Upgrade slots on each kind of escort, one of each, on top of its built-in gear. */
export const ESCORT_SLOTS: Record<EscortKind, readonly SlotType[]> = {
  collector: ['engine', 'armor', 'collector', 'cargo'],
  gunship: ['engine', 'armor', 'weapon'],
  guardian: ['engine', 'armor', 'weapon'],
  scout: ['engine', 'armor', 'weapon'],
  tanker: ['engine', 'armor', 'tank'],
  medic: ['engine', 'armor', 'cargo'],
};

/** Share of the list price a city pays for a spare part. */
export const PART_RESALE = 0.5;
/** What starter gear, which has no list price, is worth. */
export const PART_SCRAP = 25;
