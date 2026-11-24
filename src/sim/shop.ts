import { HULLS, PARTS, REPAIR_KIT, SLOT_TYPES, type Part, type SlotType } from '../config/catalog';
import { fitPart, type TxResult } from './economy';
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
export function shopRows(s: GameState): ShopRow[] {
  const current = HULLS[s.vehicle.hullId];
  const rows: ShopRow[] = [];

  for (const hull of Object.values(HULLS).filter((h) => h.tier > current.tier).sort((a, b) => a.tier - b.tier)) {
    const slots = Object.values(hull.slots).reduce((n, c) => n + c, 0);
    rows.push({
      kind: 'hull',
      id: hull.id,
      name: hull.name.toUpperCase(),
      price: hull.price,
      affordable: s.credits >= hull.price,
      summary: `HP ${hull.baseHp} ${slots} SLOTS`,
      delta: `HP ${signed(hull.baseHp - current.baseHp)}`,
    });
  }

  const order = (slot: SlotType): number => SLOT_TYPES.indexOf(slot);
  const parts = Object.values(PARTS)
    .filter((p) => p.price > 0)
    .sort((a, b) => order(a.slot) - order(b.slot) || a.tier - b.tier);
  for (const part of parts) {
    rows.push({
      kind: 'part',
      id: part.id,
      name: part.name.toUpperCase(),
      price: part.price,
      affordable: s.credits >= part.price,
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
