/** A caravan vehicle as it is now: its built-in gear plus whatever parts are fitted. */
import { HULLS, PARTS, type Part } from '../config/catalog';
import { escortDef, type EscortDef } from '../config/escorts';
import { PART_RESALE, PART_SCRAP } from '../config/outfit';
import { ESCORT_RESALE } from '../config/escorts';
import type { Escort, VehicleKind } from './caravan';
import { vehicleStats, type WeaponStats } from './vehicle';

export interface EscortStats extends Omit<EscortDef, 'kind'> {
  kind: VehicleKind;
  /** Fitted weapons, fired alongside any built-in gun. */
  extraGuns: WeaponStats[];
}

const ENGINE_BASE = 80;
/** What a city gives for a hull that cost nothing. */
const SCOUT_HULL_VALUE = 250;

/** What a part adds to an escort: half of what it gives your rig, full armour, or a whole gun. */
export function escortBonus(p: Part): number {
  const st = p.stats;
  switch (p.slot) {
    case 'engine':
      return Math.round(((st.topSpeed ?? ENGINE_BASE) - ENGINE_BASE) / 2);
    case 'armor':
      return st.armor ?? 0;
    case 'weapon':
      return st.damage ?? 0;
    case 'collector':
      return Math.round((st.collectRadius ?? 0) / 2);
    case 'cargo':
      return Math.round((st.cargoCap ?? 0) / 2);
    case 'tank':
      return Math.round((st.tankCap ?? 0) / 2);
  }
}

/** One of your old rigs running as a caravan vehicle: it keeps what it could do as the lead. */
function rigStats(e: Escort): EscortStats {
  const { hullId, fitted } = e.rig!;
  const hull = HULLS[hullId];
  const st = vehicleStats({ hullId, fitted, owned: [], hp: 0, fuel: 0, cargo: 0, repairKits: 0 });
  return {
    kind: 'rig',
    tier: e.tier,
    name: `OLD ${hull.name.toUpperCase()}`,
    price: hull.price,
    hp: st.maxHp,
    armor: st.armor,
    speed: st.topSpeed,
    cargoCap: st.cargoCap,
    tankCap: st.tankCap,
    collectRadius: st.collectRadius,
    damage: 0,
    accuracy: 0,
    longRange: false,
    heal: 0,
    sight: 0,
    row: 'front',
    extraGuns: st.weapons,
  };
}

export function escortStats(e: Escort): EscortStats {
  if (e.kind === 'rig') return rigStats(e);
  const out: EscortStats = { ...escortDef(e.kind, e.tier), extraGuns: [] };
  for (const id of Object.values(e.fitted ?? {})) {
    const p = id ? PARTS[id] : undefined;
    if (!p) continue;
    const bonus = escortBonus(p);
    if (p.slot === 'engine') out.speed += bonus;
    else if (p.slot === 'armor') {
      out.armor += bonus;
      out.hp += p.stats.hpBonus ?? 0;
    } else if (p.slot === 'weapon') out.extraGuns.push({ name: p.name, damage: bonus, accuracy: p.stats.accuracy ?? 0 });
    else if (p.slot === 'collector') out.collectRadius += bonus;
    else if (p.slot === 'cargo') out.cargoCap += bonus;
    else out.tankCap += bonus;
  }
  return out;
}

export function partValue(partId: string): number {
  const price = PARTS[partId]?.price ?? 0;
  return price > 0 ? Math.floor(price * PART_RESALE) : PART_SCRAP;
}

/** What a city pays for a whole vehicle, with everything fitted to it. */
export function vehicleResale(e: Escort): number {
  const ids = e.kind === 'rig' ? Object.values(e.rig!.fitted).flat() : Object.values(e.fitted ?? {});
  const parts = ids.reduce((n, id) => n + (id ? partValue(id) : 0), 0);
  const price = escortStats(e).price;
  const body = e.kind === 'rig' && price === 0 ? SCOUT_HULL_VALUE : Math.floor(price * ESCORT_RESALE);
  return body + parts;
}
