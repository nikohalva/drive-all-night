/** An escort as it is now: its built-in gear plus whatever parts are fitted. */
import { PARTS, type Part } from '../config/catalog';
import { escortDef, type EscortDef } from '../config/escorts';
import type { Escort } from './caravan';

export interface EscortStats extends EscortDef {
  /** A fitted weapon, fired alongside the built-in guns. */
  extraGun: { name: string; damage: number; accuracy: number } | null;
}

const ENGINE_BASE = 80;

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

export function escortStats(e: Escort): EscortStats {
  const out: EscortStats = { ...escortDef(e.kind, e.tier), extraGun: null };
  for (const id of Object.values(e.fitted ?? {})) {
    const p = id ? PARTS[id] : undefined;
    if (!p) continue;
    const bonus = escortBonus(p);
    if (p.slot === 'engine') out.speed += bonus;
    else if (p.slot === 'armor') {
      out.armor += bonus;
      out.hp += p.stats.hpBonus ?? 0;
    } else if (p.slot === 'weapon') out.extraGun = { name: p.name, damage: bonus, accuracy: p.stats.accuracy ?? 0 };
    else if (p.slot === 'collector') out.collectRadius += bonus;
    else if (p.slot === 'cargo') out.cargoCap += bonus;
    else out.tankCap += bonus;
  }
  return out;
}
