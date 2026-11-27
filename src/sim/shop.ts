import { HULLS, PARTS, REPAIR_KIT, SLOT_TYPES, type Part, type SlotType } from '../config/catalog';
import { CITY_BY_ID, START_CITY, type CityDef, type CityId } from '../config/cities';
import { SPARE_SLOTS } from '../config/holdings';
import { garageAt, hasGarage, stash } from './garage';
import { ESCORT_SLOTS } from '../config/outfit';
import type { EscortKind } from '../config/escorts';
import { escortBonus } from './escort-stats';
import { cityPrice, fitPart, type TxResult } from './economy';
import type { GameState } from './game-state';

export interface ShopRow {
  kind: 'hull' | 'part' | 'kit';
  id: string;
  name: string;
  price: number;
  affordable: boolean;
  /** What the item is, in a few words. */
  summary: string;
  /** What it changes compared with what you have now. */
  delta: string;
}

export interface GarageRow {
  slot: SlotType;
  index: number;
  partId: string | null;
  label: string;
}

const SLOT_NAME: Record<SlotType, string> = {
  engine: 'ENGINE',
  tank: 'TANK',
  collector: 'COLLECTOR',
  cargo: 'CARGO',
  armor: 'ARMOR',
  weapon: 'WEAPON',
};

const SECTION: Record<SlotType, string> = {
  engine: 'ENGINES',
  tank: 'TANKS',
  collector: 'COLLECTORS',
  cargo: 'CARGO HOLDS',
  armor: 'ARMOR',
  weapon: 'WEAPONS',
};

/** The shop heading an item is listed under. */
export function shopSection(row: ShopRow): string {
  if (row.kind === 'hull') return 'RIGS';
  if (row.kind === 'kit') return 'SUPPLIES';
  return SECTION[PARTS[row.id].slot];
}

const signed = (n: number): string => (n >= 0 ? `+${n}` : `${n}`);

function partSummary(p: Part): string {
  const st = p.stats;
  switch (p.slot) {
    case 'engine':
      return `SPD ${st.topSpeed} ACC ${st.accel}`;
    case 'tank':
      return `TANK ${st.tankCap}`;
    case 'collector':
      return `SWEEP ${st.collectRadius}`;
    case 'cargo':
      return `HOLD ${st.cargoCap}`;
    case 'armor':
      return `ARMOR ${st.armor} HP +${st.hpBonus}`;
    case 'weapon':
      return `DMG ${st.damage} ACC ${Math.round((st.accuracy ?? 0) * 100)}%`;
  }
}

/** The stat each slot type is judged by, and its label in the shop. */
const MAIN_STAT: Record<SlotType, { key: 'topSpeed' | 'tankCap' | 'collectRadius' | 'cargoCap' | 'armor' | 'damage'; label: string }> = {
  engine: { key: 'topSpeed', label: 'SPEED' },
  tank: { key: 'tankCap', label: 'TANK' },
  collector: { key: 'collectRadius', label: 'SWEEP' },
  cargo: { key: 'cargoCap', label: 'HOLD' },
  armor: { key: 'armor', label: 'ARMOR' },
  weapon: { key: 'damage', label: 'DMG' },
};

/** How `part` compares with the best part currently fitted in the same slot type. */
function partDelta(s: GameState, part: Part): string {
  const { key, label } = MAIN_STAT[part.slot];
  const fitted = s.vehicle.fitted[part.slot].flatMap((id) => (id && PARTS[id] ? [PARTS[id]] : []));
  const best = fitted.reduce<Part | null>((b, p) => (!b || (p.stats[key] ?? 0) > (b.stats[key] ?? 0) ? p : b), null);
  const diff = (part.stats[key] ?? 0) - (best?.stats[key] ?? 0);
  if (part.slot === 'armor') {
    const hp = (part.stats.hpBonus ?? 0) - (best?.stats.hpBonus ?? 0);
    return `${label} ${signed(diff)} HP ${signed(hp)}`;
  }
  return `${label} ${signed(diff)}`;
}

/** Everything the city sells that could still be useful: bigger hulls, upgrade parts, repair kits. */
export function shopRows(s: GameState, city: CityDef = CITY_BY_ID[START_CITY]): ShopRow[] {
  const current = HULLS[s.vehicle.hullId];
  const rows: ShopRow[] = [];

  for (const hull of Object.values(HULLS).filter((h) => h.tier > current.tier).sort((a, b) => a.tier - b.tier)) {
    const slots = Object.values(hull.slots).reduce((n, c) => n + c, 0);
    rows.push({
      kind: 'hull',
      id: hull.id,
      name: hull.name.toUpperCase(),
      price: cityPrice(hull.price, city),
      affordable: s.credits >= cityPrice(hull.price, city),
      summary: `HP ${hull.baseHp} ${slots} SLOTS`,
      delta: `HP ${signed(hull.baseHp - current.baseHp)}`,
    });
  }

  const order = (slot: SlotType): number => SLOT_TYPES.indexOf(slot);
  const parts = Object.values(PARTS)
    .filter((p) => p.price > 0 && city.stock.includes(p.id))
    .sort((a, b) => order(a.slot) - order(b.slot) || a.tier - b.tier);
  for (const part of parts) {
    rows.push({
      kind: 'part',
      id: part.id,
      name: part.name.toUpperCase(),
      price: cityPrice(part.price, city),
      affordable: s.credits >= cityPrice(part.price, city),
      summary: partSummary(part),
      delta: partDelta(s, part),
    });
  }

  rows.push({
    kind: 'kit',
    id: 'kit',
    name: 'REPAIR KIT',
    price: REPAIR_KIT.price,
    affordable: s.credits >= REPAIR_KIT.price,
    summary: `HEAL ${REPAIR_KIT.heal}`,
    delta: `OWNED ${s.vehicle.repairKits}`,
  });
  return rows;
}

/** One row per slot the current hull has, in a fixed order. */
export function garageRows(s: GameState): GarageRow[] {
  const rows: GarageRow[] = [];
  for (const slot of SLOT_TYPES) {
    for (let index = 0; index < HULLS[s.vehicle.hullId].slots[slot]; index++) {
      const partId = s.vehicle.fitted[slot][index] ?? null;
      const name = partId && PARTS[partId] ? PARTS[partId].name.toUpperCase() : 'EMPTY';
      rows.push({ slot, index, partId, label: `${SLOT_NAME[slot]} ${index + 1}: ${name}` });
    }
  }
  return rows;
}

/** Owned (unfitted) parts that belong in this slot type. */
export function compatibleOwned(s: GameState, slot: SlotType): string[] {
  return s.vehicle.owned.filter((id) => PARTS[id]?.slot === slot);
}

/** Swap the first compatible owned part into the slot; the part it replaces goes back to the garage. */
export function cycleFit(s: GameState, slot: SlotType, index: number): TxResult {
  const next = compatibleOwned(s, slot)[0];
  if (!next) return { ok: false, reason: 'nothing' };
  return fitPart(s, next, slot, index);
}

/** A line of the FIT page: a slot of your rig, or a spare part that could go into it. */
export type FitRow =
  | { type: 'slot'; target: 'rig' | number; slot: SlotType; index: number; partId: string | null; label: string; summary: string }
  | {
      type: 'option';
      target: 'rig' | number;
      slot: SlotType;
      index: number;
      partId: string;
      from: 'aboard' | 'garage';
      label: string;
      summary: string;
      delta: string;
    };

/** Every slot followed by the parts you could put in it, from aboard or this city's garage. */
export function fitRows(s: GameState, city: CityId): FitRow[] {
  const stored = hasGarage(s, city) ? garageAt(s, city).parts : [];
  const rows: FitRow[] = [];
  for (const slot of garageRows(s)) {
    const current = slot.partId ? PARTS[slot.partId] : undefined;
    rows.push({ type: 'slot', target: 'rig', ...slot, summary: current ? partSummary(current) : '' });
    const sources = [
      ['aboard', s.vehicle.owned],
      ['garage', stored],
    ] as const;
    for (const [from, parts] of sources) {
      for (const id of [...new Set(parts)].sort()) {
        const part = PARTS[id];
        if (!part || part.slot !== slot.slot) continue;
        const { key, label } = MAIN_STAT[slot.slot];
        rows.push({
          type: 'option',
          target: 'rig',
          slot: slot.slot,
          index: slot.index,
          partId: id,
          from,
          label: `FIT ${part.name.toUpperCase()}`,
          summary: partSummary(part),
          delta: `${label} ${signed((part.stats[key] ?? 0) - (current?.stats[key] ?? 0))}`,
        });
      }
    }
  }
  return rows;
}

/** Put a chosen spare into a slot. What comes out goes to your spares, or the garage if they are full. */
export function fitChoice(
  s: GameState,
  city: CityId,
  slot: SlotType,
  index: number,
  partId: string,
  from: 'aboard' | 'garage',
): TxResult {
  if (from === 'aboard') return fitPart(s, partId, slot, index);
  const { parts } = garageAt(s, city);
  const at = parts.indexOf(partId);
  if (at < 0 || !hasGarage(s, city)) return { ok: false, reason: 'not-owned' };
  const picked: GameState = {
    ...s,
    vehicle: { ...s.vehicle, owned: [...s.vehicle.owned, partId] },
    garages: { ...s.garages, [city]: { ...garageAt(s, city), parts: parts.filter((_, i) => i !== at) } },
  };
  const r = fitPart(picked, partId, slot, index);
  // a part came out of the garage, so the spares may be as they were, or one under the limit
  const limit = Math.max(SPARE_SLOTS[s.vehicle.hullId], s.vehicle.owned.length);
  if (!r.ok || r.state.vehicle.owned.length <= limit) return r;
  const owned = r.state.vehicle.owned;
  const removed = owned[owned.length - 1];
  return { ok: true, state: stash({ ...r.state, vehicle: { ...r.state.vehicle, owned: owned.slice(0, -1) } }, city, removed) };
}

/** The same for one escort in the caravan: its upgrade slots and what could go in them. */
export function escortFitRows(s: GameState, city: CityId, id: number): FitRow[] {
  const e = s.caravan.find((x) => x.id === id);
  if (!e) return [];
  // an old rig has all the slots it had when you drove it
  if (e.rig) {
    const asLead = { ...s, vehicle: { ...s.vehicle, hullId: e.rig.hullId, fitted: e.rig.fitted } };
    return fitRows(asLead, city).map((r) => ({ ...r, target: id }));
  }
  const stored = hasGarage(s, city) ? garageAt(s, city).parts : [];
  const rows: FitRow[] = [];
  for (const slot of ESCORT_SLOTS[e.kind as EscortKind]) {
    const partId = e.fitted?.[slot] ?? null;
    const current = partId ? PARTS[partId] : undefined;
    const name = current ? current.name.toUpperCase() : 'EMPTY';
    const { label } = MAIN_STAT[slot];
    rows.push({
      type: 'slot',
      target: id,
      slot,
      index: 0,
      partId,
      label: `${SLOT_NAME[slot]}: ${name}`,
      summary: current ? `${label} +${escortBonus(current)}` : '',
    });
    const sources = [
      ['aboard', s.vehicle.owned],
      ['garage', stored],
    ] as const;
    for (const [from, parts] of sources) {
      for (const spare of [...new Set(parts)].sort()) {
        const part = PARTS[spare];
        if (!part || part.slot !== slot) continue;
        rows.push({
          type: 'option',
          target: id,
          slot,
          index: 0,
          partId: spare,
          from,
          label: `FIT ${part.name.toUpperCase()}`,
          summary: partSummary(part),
          delta: `${label} ${signed(escortBonus(part) - (current ? escortBonus(current) : 0))}`,
        });
      }
    }
  }
  return rows;
}
