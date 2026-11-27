import Phaser from 'phaser';
import { drawText, textWidth } from '../art/font';
import { PORTRAIT, portrait } from '../art/portraits';
import { PAY_PERIOD, ROLE_EFFECT, ROLE_NAME, SKILL_NAME, TRAITS, WAGE } from '../config/crew';
import { BANK_STEP, GARAGE_PRICE, GARAGE_RENT, GARAGE_VEHICLES, RENT_SECONDS, SPARE_SLOTS } from '../config/holdings';
import { PARTS } from '../config/catalog';
import { asOnePurse, deposit, funds, payInCity, withdraw } from '../sim/bank';
import { buyGarage, garageAt, hasGarage, parkEscort, rentGarage, storePart, takeEscort, takePart } from '../sim/garage';
import { crewAt, hireCrew, isCrewed, payWages, recruitPool, settlePayday, treatCrew, treatmentCost, wagesDue } from '../sim/crew';
import { PAL } from '../art/palette';
import { rigSignature } from '../art/painters';
import { ensureRigTextures } from '../art/textures';
import { VIEW } from '../config/view';
import { getState, setState, ui } from '../game/session';
import {
  buyHull,
  buyPart,
  buyRepairKit,
  refuelFull,
  repairFull,
  sellCargo,
  unfitPart,
  type TxResult,
} from '../sim/economy';
import type { GameState } from '../sim/game-state';
import { hash2 } from '../sim/rng';
import { saveGame } from '../sim/save';
import { cycleFit, escortFitRows, fitChoice, fitRows, shopRows, shopSection, type FitRow } from '../sim/shop';
import { fitEscort, partValue, sellPart, unfitEscort, type PartSource } from '../sim/outfit';
import { escortStats } from '../sim/escort-stats';
import { vehicleStats } from '../sim/vehicle';
import { CITIES, CITY_BY_ID, START_CITY, type CityDef, type CityId } from '../config/cities';
import { cityPos, nearestCopy } from '../sim/world';
import type { HullId } from '../config/catalog';
import { CARAVAN_CAP, ESCORT_RESALE, ESCORT_ROLE, escortDef, type EscortKind, type Tier } from '../config/escorts';
import { cityPrice } from '../config/cities';
import { buyEscort, caravanStats, repairEscorts, sellEscort } from '../sim/caravan';
import type { Escort } from '../sim/caravan';

const W = VIEW.W;
const H = VIEW.H;
const TABS = ['SELL', 'SHOP', 'FIT', 'CARAVAN', 'CREW', 'GARAGE', 'BANK', 'SERVICES', 'SAVE', 'LEAVE'] as const;

/** A spare part offered for sale on the SELL tab. */
type SpareEntry = { part: string; from: PartSource };

/** What a row on the GARAGE tab does. */
type GarageEntry =
  | { kind: 'buy' }
  | { kind: 'rent' }
  | { kind: 'store'; part: string }
  | { kind: 'take'; part: string }
  | { kind: 'park'; id: number }
  | { kind: 'drive'; id: number };

/** What a row on the CARAVAN tab does. */
type CaravanEntry =
  | { kind: 'repair' }
  | { kind: 'own'; id: number }
  | { kind: 'buy'; escort: EscortKind; tier: Tier };
type Tab = (typeof TABS)[number];
const VISIBLE_ROWS = 20;
const ROW_H = 11;
const LIST_Y = 52;
const LIST_X = 6;
const LIST_W = 400;
/** Right-hand panel with the rig and its stats. */
const SIDE_X = LIST_X + LIST_W + 8;
const SIDE_W = W - SIDE_X - 6;
const RIG_SCALE: Record<HullId, number> = { scout: 3, hauler: 2, juggernaut: 1.5 };

const REASONS: Record<string, string> = {
  credits: 'NOT ENOUGH CREDITS',
  slot: 'NO ROOM FOR THAT',
  'not-owned': 'NOT IN YOUR GARAGE',
  nothing: 'NOTHING TO DO',
  required: 'EVERY RIG NEEDS AN ENGINE AND A TANK',
  refused: 'THEY REFUSE',
};

interface Row {
  text: string;
  right?: string;
  color: string;
  dim?: boolean;
  detail?: string;
  /** Heading drawn above the first row of each group. */
  section?: string;
}

/** The city menu: sell, shop, garage, services, save. The world clock is frozen while it is open. */
export class CityScene extends Phaser.Scene {
  private tab = 0;
  private cursors: number[] = TABS.map(() => 0);
  private message = { text: '', good: true };
  private locked = false;
  private canvas!: Phaser.Textures.CanvasTexture;
  private lastSig = '';
  private rig!: Phaser.GameObjects.Image;
  private rigSig = '';
  private city: CityDef = CITY_BY_ID[START_CITY];
  /** Escort id waiting for a second Enter to confirm its sale. */
  private pendingSell: number | null = null;
  /** Spare part row waiting for a second Enter to confirm its sale. */
  private pendingPart: number | null = null;

  constructor() {
    super('city');
  }

  init(data: { cityId?: CityId | null }): void {
    this.city = CITY_BY_ID[data.cityId ?? START_CITY] ?? CITY_BY_ID[START_CITY];
  }

  create(): void {
    this.tab = 0;
    this.pendingSell = null;
    this.pendingPart = null;
    this.cursors = TABS.map(() => 0);
    this.locked = false;
    this.lastSig = '';
    this.rigSig = '';

    this.drawBackground();
    this.rig = this.add.image(SIDE_X + SIDE_W / 2, LIST_Y + 70, ensureRigTextures(this, getState().vehicle)[0]).setRotation(Math.PI / 2).setDepth(25);

    if (this.textures.exists('city-ui')) this.textures.remove('city-ui');
    this.canvas = this.textures.createCanvas('city-ui', W, H) as Phaser.Textures.CanvasTexture;
    this.add.image(0, 0, 'city-ui').setOrigin(0, 0).setDepth(20);

    // docking autosaves, so every visit is a checkpoint
    const saved = saveGame(getState());
    const due = wagesDue(getState());
    const docked = saved ? 'DOCKED. GAME AUTOSAVED' : 'DOCKED. COULD NOT SAVE';
    this.message = { text: due > 0 ? `${docked}. CREW WAGES DUE: ${due} CR (CREW TAB)` : docked, good: saved };

    this.bindKeys();
    this.events.off('crew-done');
    this.events.on('crew-done', () => {
      // the Esc that closed the roster also reaches this scene; stay locked until it has passed
      this.time.delayedCall(250, () => {
        this.locked = false;
        this.lastSig = '';
      });
    });
    this.events.off('victory-done');
    this.events.on('victory-done', () => {
      this.locked = false;
    });
  }

  update(): void {
    const s = getState();
    const sig = rigSignature(s.vehicle);
    if (sig !== this.rigSig) {
      this.rigSig = sig;
      this.rig.setTexture(ensureRigTextures(this, s.vehicle)[0]).setScale(RIG_SCALE[s.vehicle.hullId]);
    }
    this.redraw();
  }

  // ------------------------------------------------------------------ input

  private bindKeys(): void {
    const kb = this.input.keyboard;
    if (!kb) return;
    kb.removeAllListeners();
    for (const key of ['LEFT', 'A']) kb.on(`keydown-${key}`, () => this.moveTab(-1));
    for (const key of ['RIGHT', 'D']) kb.on(`keydown-${key}`, () => this.moveTab(1));
    for (const key of ['UP', 'W']) kb.on(`keydown-${key}`, () => this.moveRow(-1));
    for (const key of ['DOWN', 'S']) kb.on(`keydown-${key}`, () => this.moveRow(1));
    for (const key of ['ENTER', 'SPACE']) kb.on(`keydown-${key}`, () => this.choose());
    kb.on('keydown-U', () => this.unfit());
    kb.on('keydown-ESC', () => this.leave());
    this.events.once('shutdown', () => kb.removeAllListeners());
  }

  private moveTab(step: number): void {
    if (this.locked) return;
    this.pendingSell = null;
    this.pendingPart = null;
    this.tab = (this.tab + step + TABS.length) % TABS.length;
  }

  private moveRow(step: number): void {
    if (this.locked) return;
    this.pendingSell = null;
    this.pendingPart = null;
    const n = this.rows().length;
    if (n === 0) return;
    this.cursors[this.tab] = (this.cursors[this.tab] + step + n) % n;
  }

  private current(): Tab {
    return TABS[this.tab];
  }

  private say(text: string, good = true): void {
    this.message = { text, good };
  }

  /** Apply a transaction result: keep the new state, or explain why not. */
  private apply(result: TxResult, done: string): boolean {
    if (result.ok) {
      setState(result.state);
      this.say(done);
      return true;
    }
    this.say(REASONS[result.reason] ?? 'NOT POSSIBLE', false);
    return false;
  }

  /** Spares you can sell here: aboard, then in this city's garage. */
  private spares(s: GameState): SpareEntry[] {
    const stored = hasGarage(s, this.city.id) ? garageAt(s, this.city.id).parts : [];
    return [
      ...s.vehicle.owned.map((part): SpareEntry => ({ part, from: 'aboard' })),
      ...stored.map((part): SpareEntry => ({ part, from: 'garage' })),
    ];
  }

  /** Every slot and part choice on the FIT tab, your rig first, then the caravan in order. */
  private fitRowsAll(s: GameState): FitRow[] {
    return [...fitRows(s, this.city.id), ...s.caravan.flatMap((e) => escortFitRows(s, this.city.id, e.id))];
  }

  private escortSummary(e: Escort): string {
    const st = escortStats(e);
    return [
      st.damage ? `DMG ${st.damage}` : '',
      st.extraGun ? `+ ${st.extraGun.damage}` : '',
      st.collectRadius ? `SWEEP ${st.collectRadius}` : '',
      st.cargoCap ? `HOLD ${st.cargoCap}` : '',
      st.tankCap ? `TANK ${st.tankCap}` : '',
      st.heal ? `HEAL ${st.heal}` : '',
      `ARM ${st.armor}`,
      `SPD ${st.speed}`,
    ]
      .filter(Boolean)
      .join(' ');
  }

  /** Your vehicles and their slots with the spares for them, then whatever is parked. */
  private fitList(s: GameState): Row[] {
    const heading = (target: FitRow['target']): string => {
      if (target === 'rig') return `YOUR RIG - ${s.vehicle.hullId.toUpperCase()} (IN USE)`;
      const at = s.caravan.findIndex((x) => x.id === target);
      const e = s.caravan[at];
      const note = e.hp <= 0 ? 'WRECKED' : isCrewed(s, e.id) ? `CREW ${crewAt(s, e.id).length}` : 'NO CREW';
      return `${at + 1}. ${escortStats(e).name}  HP ${Math.ceil(e.hp)}/${escortStats(e).hp}  ${note}`;
    };
    const stats = (target: FitRow['target']): string => {
      const e = s.caravan.find((x) => x.id === target);
      return e ? this.escortSummary(e) : '';
    };
    const rows: Row[] = this.fitRowsAll(s).map((r): Row =>
      r.type === 'slot'
        ? {
            section: heading(r.target),
            text: r.label,
            right: r.summary,
            color: r.partId ? PAL.white : '#7a6a9a',
            detail: r.target === 'rig' ? 'PICK A PART BELOW TO FIT IT.  U: REMOVE THIS ONE' : `${stats(r.target)}.  U: REMOVE`,
          }
        : {
            section: heading(r.target),
            text: `   ${r.label}  (${r.from === 'aboard' ? 'ABOARD' : 'IN GARAGE'})`,
            right: r.delta,
            color: PAL.amber,
            detail: r.summary,
          },
    );
    for (const city of CITIES) {
      for (const e of s.garages[city.id]?.vehicles ?? []) {
        rows.push({
          section: `PARKED AT ${city.name}`,
          text: `${escortStats(e).name}  HP ${Math.ceil(e.hp)}/${escortStats(e).hp}  NOT IN USE`,
          color: e.hp <= 0 ? PAL.red : PAL.cyanPale,
          detail: `${this.escortSummary(e)}.  TAKE IT OUT TO FIT PARTS`,
        });
      }
    }
    return rows;
  }

  private garageEntries(s: GameState): GarageEntry[] {
    const g = garageAt(s, this.city.id);
    const entries: GarageEntry[] = [];
    if (!g.owned) entries.push({ kind: 'buy' }, { kind: 'rent' });
    if (!hasGarage(s, this.city.id)) return entries;
    for (const part of g.parts) entries.push({ kind: 'take', part });
    for (const v of g.vehicles) entries.push({ kind: 'drive', id: v.id });
    for (const part of s.vehicle.owned) entries.push({ kind: 'store', part });
    for (const e of s.caravan) entries.push({ kind: 'park', id: e.id });
    return entries;
  }

  private garageRow(s: GameState, entry: GarageEntry): Row {
    const g = garageAt(s, this.city.id);
    const holds = `STORED HERE: ${g.parts.length} PARTS, ${g.vehicles.length}/${GARAGE_VEHICLES} VEHICLES. SPARES ABOARD ${s.vehicle.owned.length}/${SPARE_SLOTS[s.vehicle.hullId]}`;
    if (entry.kind === 'buy') {
      return { text: 'BUY THIS GARAGE', right: `${GARAGE_PRICE} CR`, color: PAL.pink, dim: funds(s) < GARAGE_PRICE, detail: holds };
    }
    if (entry.kind === 'rent') {
      const left = Math.ceil((g.rentUntil - s.t) / 60);
      return {
        text: left > 0 ? `EXTEND THE RENT (${left} MIN LEFT)` : 'RENT THIS GARAGE',
        right: `${GARAGE_RENT} CR`,
        color: PAL.pink,
        dim: funds(s) < GARAGE_RENT,
        detail: `${RENT_SECONDS / 60} MINUTES A PAYMENT. ${holds}`,
      };
    }
    if (entry.kind === 'store' || entry.kind === 'take') {
      const name = PARTS[entry.part]?.name.toUpperCase() ?? entry.part;
      return entry.kind === 'take'
        ? { text: `TAKE ${name}`, color: PAL.cyanPale, detail: holds }
        : { text: `STORE ${name}`, color: PAL.amber, detail: holds };
    }
    const list = entry.kind === 'drive' ? g.vehicles : s.caravan;
    const e = list.find((v) => v.id === entry.id);
    const name = e ? escortStats(e).name : '?';
    const hp = e ? `HP ${Math.ceil(e.hp)}/${escortStats(e).hp}` : '';
    return entry.kind === 'drive'
      ? { text: `TAKE OUT ${name}  ${hp}`, color: PAL.cyanPale, detail: holds }
      : { text: `PARK ${name}  ${hp}`, color: PAL.amber, detail: 'ITS CREW MOVES TO THE RESERVE' };
  }

  private chooseGarage(s: GameState, cursor: number): void {
    const entry = this.garageEntries(s)[cursor];
    if (!entry) return;
    const id = this.city.id;
    switch (entry.kind) {
      case 'buy':
        this.apply(payInCity(s, (p) => buyGarage(p, id)), 'THE GARAGE IS YOURS');
        break;
      case 'rent':
        this.apply(payInCity(s, (p) => rentGarage(p, id)), 'RENT PAID');
        break;
      case 'store':
        this.apply(storePart(s, id, entry.part), 'STORED');
        break;
      case 'take':
        this.apply(takePart(s, id, entry.part), 'LOADED ABOARD');
        break;
      case 'park':
        this.apply(parkEscort(s, id, entry.id), 'PARKED');
        break;
      case 'drive':
        this.apply(takeEscort(s, id, entry.id), 'ROLLING WITH YOU AGAIN. CHECK ITS CREW');
        break;
    }
  }

  private caravanEntries(s: GameState): CaravanEntry[] {
    const entries: CaravanEntry[] = [];
    if (s.caravan.some((e) => e.hp < escortStats(e).hp)) entries.push({ kind: 'repair' });
    for (const e of s.caravan) entries.push({ kind: 'own', id: e.id });
    for (const escort of this.city.escortStock) {
      for (const tier of [1, 2, 3] as Tier[]) entries.push({ kind: 'buy', escort, tier });
    }
    return entries;
  }

  private chooseCaravan(s: GameState, cursor: number): void {
    const entry = this.caravanEntries(s)[cursor];
    if (!entry) return;
    if (entry.kind === 'repair') {
      this.apply(payInCity(s, (p) => repairEscorts(p, this.city)), 'ESCORTS REPAIRED');
    } else if (entry.kind === 'own') {
      const e = s.caravan.find((x) => x.id === entry.id);
      if (!e) return;
      if (this.pendingSell !== e.id) {
        this.pendingSell = e.id;
        this.say(`PRESS ENTER AGAIN TO SELL ${escortDef(e.kind, e.tier).name}`, false);
        return;
      }
      this.apply(sellEscort(s, e.id), `SOLD ${escortDef(e.kind, e.tier).name}`);
    } else {
      const def = escortDef(entry.escort, entry.tier);
      this.apply(payInCity(s, (p) => buyEscort(p, entry.escort, entry.tier, this.city)), `${def.name} JOINS THE CARAVAN`);
    }
    this.pendingSell = null;
  }

  private choose(): void {
    if (this.locked) return;
    const s = getState();
    const cursor = Math.max(0, Math.min(this.cursors[this.tab], this.rows().length - 1));
    this.cursors[this.tab] = cursor;
    switch (this.current()) {
      case 'SELL': {
        if (cursor === 0) {
          const proceeds = Math.floor(s.vehicle.cargo * this.city.sellPrice);
          this.apply(sellCargo(s, this.city), `SOLD CARGO FOR ${proceeds} CR`);
          break;
        }
        const spare = this.spares(s)[cursor - 1];
        if (!spare) break;
        const name = PARTS[spare.part].name.toUpperCase();
        if (this.pendingPart !== cursor) {
          this.pendingPart = cursor;
          this.say(`PRESS ENTER AGAIN TO SELL ${name}`, false);
          break;
        }
        this.pendingPart = null;
        this.apply(sellPart(s, this.city.id, spare.part, spare.from), `SOLD ${name} FOR ${partValue(spare.part)} CR`);
        break;
      }
      case 'SHOP': {
        const row = shopRows(s, this.city)[cursor];
        if (!row) break;
        const result = payInCity(s, (p) =>
          row.kind === 'hull'
            ? buyHull(p, row.id as HullId, this.city)
            : row.kind === 'part'
              ? buyPart(p, row.id, this.city)
              : buyRepairKit(p),
        );
        if (this.apply(result, `BOUGHT ${row.name}`)) this.afterPurchase();
        break;
      }
      case 'FIT': {
        const row = this.fitRowsAll(s)[cursor];
        if (!row) break; // the last rows only list parked vehicles
        if (row.target !== 'rig') {
          if (row.type === 'option') {
            this.apply(fitEscort(s, this.city.id, row.target, row.slot, row.partId, row.from), 'FITTED');
          } else {
            this.say('PICK A PART BELOW THE SLOT', false);
          }
        } else if (row.type === 'option') {
          this.apply(fitChoice(s, this.city.id, row.slot, row.index, row.partId, row.from), 'FITTED');
        } else if (s.vehicle.owned.some((id) => PARTS[id]?.slot === row.slot)) {
          this.apply(cycleFit(s, row.slot, row.index), 'FITTED');
        } else {
          this.say('NOTHING ABOARD FOR THAT SLOT', false);
        }
        break;
      }
      case 'CARAVAN':
        this.chooseCaravan(s, cursor);
        return;
      case 'GARAGE':
        this.chooseGarage(s, cursor);
        break;
      case 'BANK': {
        const amount = cursor % 2 === 0 ? Infinity : BANK_STEP;
        if (cursor < 2) this.apply(deposit(s, amount), 'DEPOSITED');
        else this.apply(withdraw(s, amount), 'WITHDRAWN');
        break;
      }
      case 'CREW': {
        if (cursor === 0) {
          this.locked = true;
          this.scene.launch('crew', { from: 'city' });
          return;
        }
        if (cursor === 1) {
          this.apply(payInCity(s, payWages), 'WAGES PAID');
          break;
        }
        const recruit = recruitPool(s, this.city)[cursor - 2];
        if (recruit) this.apply(payInCity(s, (p) => hireCrew(p, this.city, recruit.key)), `${recruit.name} SIGNS ON`);
        break;
      }
      case 'SERVICES':
        if (cursor === 2) this.apply(payInCity(s, treatCrew), 'CREW PATCHED UP');
        else if (cursor === 0) this.apply(payInCity(s, (p) => repairFull(p, this.city)), 'HULL REPAIRED');
        else this.apply(payInCity(s, (p) => refuelFull(p, this.city)), 'TANK REFUELLED');
        break;
      case 'SAVE':
        if (saveGame(getState())) this.say('GAME SAVED');
        else this.say('COULD NOT SAVE', false);
        break;
      case 'LEAVE':
        this.leave();
        break;
    }
  }

  private unfit(): void {
    if (this.locked || this.current() !== 'FIT') return;
    const s = getState();
    const row = this.fitRowsAll(s)[this.cursors[this.tab]];
    if (!row) return;
    const result =
      row.target === 'rig'
        ? unfitPart(s, row.slot, row.index, this.city)
        : unfitEscort(s, this.city.id, row.target, row.slot);
    this.apply(result, 'PART REMOVED');
  }

  /** Buying the largest hull ends the first playable's story, once. */
  private afterPurchase(): void {
    const s = getState();
    if (!s.flags.won || s.flags.victoryShown) return;
    setState({ ...s, flags: { ...s.flags, victoryShown: true } });
    this.locked = true;
    this.scene.launch('victory');
  }

  private leave(): void {
    if (this.locked) return;
    // rolling out is the end of payday
    const payday = settlePayday(getState());
    const s = payday.state;
    if (payday.report.length > 0) {
      ui.toast = payday.report.slice(-3).join('. ');
      ui.toastUntil = this.game.loop.time + 6000;
    }
    const city = cityPos(this.city.id, s.t);
    setState({
      ...s,
      player: { x: city.x + 40, y: nearestCopy(city.y, s.player.y), heading: -Math.PI / 2 },
    });
    this.scene.stop();
    this.scene.get('drive').events.emit('city-done');
  }

  // ------------------------------------------------------------------- rows

  private rows(): Row[] {
    const s = getState();
    switch (this.current()) {
      case 'SELL': {
        const value = Math.floor(s.vehicle.cargo * this.city.sellPrice);
        return [
          {
            section: 'CARGO',
            text: 'SELL ALL CARGO',
            right: `${value} CR`,
            color: PAL.amber,
            dim: s.vehicle.cargo <= 0,
            detail: `CARGO ${s.vehicle.cargo.toFixed(1)} X AT ${this.city.sellPrice} CR EACH${s.debt > 0 ? '. DEBT IS PAID FIRST' : ''}`,
          },
          ...this.spares(s).map(({ part, from }): Row => ({
            section: from === 'aboard' ? 'SPARE PARTS ABOARD' : 'SPARE PARTS IN THIS GARAGE',
            text: `SELL ${PARTS[part].name.toUpperCase()}`,
            right: `${partValue(part)} CR`,
            color: PAL.cyanPale,
            detail: `ENTER TWICE TO SELL${s.debt > 0 ? '. DEBT IS PAID FIRST' : ''}`,
          })),
        ];
      }
      case 'SHOP':
        return shopRows(asOnePurse(s), this.city).map((r) => ({
          section: shopSection(r),
          text: r.name,
          right: `${r.price} CR`,
          color: r.kind === 'hull' ? PAL.pink : r.kind === 'kit' ? PAL.cyanPale : PAL.amber,
          dim: !r.affordable,
          detail: `${r.summary}   ${r.delta}`,
        }));
      case 'FIT':
        return this.fitList(s);
      case 'GARAGE':
        return this.garageEntries(s).map((entry) => this.garageRow(s, entry));
      case 'BANK': {
        const detail = `IN THE BANK ${Math.floor(s.bank)} CR. SAFE IF YOU LOSE A FIGHT`;
        return [
          { text: 'DEPOSIT ALL', right: `${Math.floor(s.credits)} CR`, color: PAL.amber, dim: s.credits <= 0, detail },
          { text: `DEPOSIT ${BANK_STEP}`, color: PAL.amber, dim: s.credits <= 0, detail },
          { text: 'WITHDRAW ALL', right: `${Math.floor(s.bank)} CR`, color: PAL.cyanPale, dim: s.bank <= 0, detail },
          { text: `WITHDRAW ${BANK_STEP}`, color: PAL.cyanPale, dim: s.bank <= 0, detail },
        ];
      }
      case 'CARAVAN': {
        const cap = CARAVAN_CAP[s.vehicle.hullId];
        return this.caravanEntries(s).map((entry): Row => {
          if (entry.kind === 'repair') {
            const missing = s.caravan.reduce((n, e) => n + Math.max(0, escortStats(e).hp - e.hp), 0);
            return {
              text: 'REPAIR ESCORTS',
              right: `${Math.ceil(missing * this.city.repairPrice)} CR`,
              color: PAL.pink,
              detail: 'WRECKED ESCORTS ROLL AGAIN ONCE REPAIRED',
            };
          }
          if (entry.kind === 'own') {
            const e = s.caravan.find((x) => x.id === entry.id);
            const def = e ? escortStats(e) : undefined;
            if (!e || !def) return { text: '?', color: PAL.white };
            const wrecked = e.hp <= 0;
            return {
              text: `${def.name}  ${wrecked ? 'WRECKED' : `HP ${Math.ceil(e.hp)}/${def.hp}`}`,
              right: `SELL +${Math.floor(def.price * ESCORT_RESALE)}`,
              color: wrecked ? PAL.red : PAL.cyanPale,
              detail: `YOURS. ${ESCORT_ROLE[e.kind]}`,
            };
          }
          const def = escortDef(entry.escort, entry.tier);
          const price = cityPrice(def.price, this.city);
          const bits = [
            `HP ${def.hp}`,
            def.armor ? `ARM ${def.armor}` : '',
            def.damage ? `DMG ${def.damage}` : '',
            def.cargoCap ? `HOLD +${def.cargoCap}` : '',
            def.tankCap ? `TANK +${def.tankCap}` : '',
            def.heal ? `HEAL ${def.heal}` : '',
            `SPD ${def.speed}`,
          ].filter(Boolean);
          return {
            text: `BUY ${def.name}`,
            right: `${price} CR`,
            color: PAL.amber,
            dim: funds(s) < price || s.caravan.length >= cap,
            detail: `${ESCORT_ROLE[entry.escort]}. ${bits.join(' ')}`,
          };
        });
      }
      case 'CREW':
        return [
          {
            text: 'MANAGE YOUR CREW',
            right: `${s.crew.length} HIRED`,
            color: PAL.cyan,
            detail: 'SEE, MOVE AND DISMISS. ALSO C ON THE ROAD',
          },
          {
            text: 'PAY WAGES',
            right: `${wagesDue(s)} CR`,
            color: PAL.pink,
            dim: wagesDue(s) <= 0 || funds(s) <= 0,
            detail: 'LEAVE UNPAID: NO BONUS. TWICE IN A ROW: THEY QUIT',
          },
          ...recruitPool(s, this.city).map((r) => ({
            text: `HIRE ${r.name}  ${SKILL_NAME[r.skill]} ${ROLE_NAME[r.role]}`,
            right: `${r.price} CR`,
            color: PAL.amber,
            dim: funds(s) < r.price,
            detail: `${ROLE_EFFECT[r.role]}. ${TRAITS[r.trait].name}. WAGE ${WAGE[r.skill]} PER ${PAY_PERIOD / 60} MIN`,
          })),
        ];
      case 'SERVICES': {
        const stats = vehicleStats(s.vehicle);
        const repairCost = Math.ceil((stats.maxHp - s.vehicle.hp) * this.city.repairPrice);
        const fuelCost = Math.ceil((caravanStats(s).tankCap - s.vehicle.fuel) * this.city.fuelPrice);
        return [
          {
            text: 'REPAIR HULL',
            right: `${Math.max(0, repairCost)} CR`,
            color: PAL.pink,
            dim: repairCost <= 0,
            detail: `HULL ${Math.ceil(s.vehicle.hp)}/${stats.maxHp}. PARTIAL REPAIR IF SHORT ON CREDITS`,
          },
          {
            text: 'REFUEL TANK',
            right: `${Math.max(0, fuelCost)} CR`,
            color: PAL.amber,
            dim: fuelCost <= 0,
            detail: `FUEL ${s.vehicle.fuel.toFixed(0)}/${caravanStats(s).tankCap}. PARTICLE X IS FUEL`,
          },
          {
            text: 'TREAT CREW',
            right: `${treatmentCost(s)} CR`,
            color: PAL.cyanPale,
            dim: treatmentCost(s) <= 0,
            detail: 'CITY DOCTORS BRING EVERYONE BACK TO FULL HEALTH',
          },
        ];
      }
      case 'SAVE':
        return [{ text: 'SAVE GAME', color: PAL.cyan, detail: 'ONE SAVE SLOT, KEPT IN THIS BROWSER' }];
      case 'LEAVE':
        return [{ text: 'LEAVE THE CITY', color: PAL.white, detail: 'YOU ROLL OUT BESIDE THE DOCK. ESC ALSO LEAVES' }];
    }
  }

  // ---------------------------------------------------------------- drawing

  private drawBackground(): void {
    const g = this.add.graphics().setDepth(0);
    const hex = (c: string): number => parseInt(c.slice(1), 16);
    for (let y = 0; y < H; y += 2) {
      const f = y / H;
      g.fillStyle(hex(f < 0.5 ? '#12062a' : '#1b0a33'), 1);
      g.fillRect(0, y, W, 2);
    }
    // neon skyline
    for (let i = 0; i < 24; i++) {
      const w = 12 + Math.floor(hash2(7, i, 1) * 20);
      const h = 30 + Math.floor(hash2(7, i, 2) * 90);
      const x = i * 21 - 6;
      g.fillStyle(hex('#0c0618'), 1);
      g.fillRect(x, H - h, w, h);
      g.fillStyle(hex(hash2(7, i, 3) > 0.5 ? PAL.pink : PAL.cyan), 0.6);
      g.fillRect(x, H - h, w, 1);
      for (let wy = H - h + 4; wy < H - 4; wy += 5) {
        for (let wx = x + 2; wx < x + w - 2; wx += 4) {
          if (hash2(i, wx, wy) < 0.25) {
            g.fillStyle(hex(hash2(wx, wy, 5) > 0.5 ? PAL.amber : PAL.cyanPale), 0.7);
            g.fillRect(wx, wy, 1, 2);
          }
        }
      }
    }
  }

  private redraw(): void {
    const s = getState();
    const sig = JSON.stringify({
      t: this.tab,
      c: this.cursors,
      m: this.message,
      l: this.locked,
      cr: s.credits,
      d: s.debt,
      v: s.vehicle,
      p: s.crew,
      b: s.bank,
      g: s.garages,
      e: s.caravan,
    });
    if (sig === this.lastSig) return;
    this.lastSig = sig;
    const ctx = this.canvas.getContext();
    ctx.clearRect(0, 0, W, H);
    this.drawUi(ctx, s);
    this.canvas.refresh();
  }

  private text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, scale = 1): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    drawText(ctx, s, 0, 0, color, scale > 1 ? `${color}55` : undefined);
    ctx.restore();
  }

  private panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    ctx.fillStyle = 'rgba(7,3,12,0.82)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = PAL.pink;
    ctx.fillRect(x, y, w, 1);
  }

  private drawUi(ctx: CanvasRenderingContext2D, s: GameState): void {
    // header
    this.panel(ctx, 0, 0, W, 22);
    this.text(ctx, this.city.name, 6, 5, this.city.color, 2);
    const cr = `CR ${Math.floor(s.credits)}`;
    this.text(ctx, cr, W - textWidth(cr) * 2 - 8, 5, PAL.amber, 2);
    const bank = `BANK ${Math.floor(s.bank)}`;
    this.text(ctx, bank, W - textWidth(cr) * 2 - textWidth(bank) - 18, 7, PAL.cyanPale);
    if (s.debt > 0) {
      const debt = `DEBT ${Math.floor(s.debt)}`;
      this.text(ctx, debt, W - textWidth(debt) - 8, 14, PAL.red);
    }

    // tabs
    let x = 6;
    TABS.forEach((name, i) => {
      const w = textWidth(name) + 12;
      if (i === this.tab) {
        ctx.fillStyle = 'rgba(255,43,214,0.35)';
        ctx.fillRect(x, 26, w, 13);
        ctx.fillStyle = PAL.pink;
        ctx.fillRect(x, 38, w, 1);
      }
      this.text(ctx, name, x + 6, 30, i === this.tab ? PAL.white : '#8a7aaa');
      x += w + 4;
    });
    this.text(ctx, 'LEFT/RIGHT: TAB  UP/DOWN: PICK  ENTER: DO IT', 6, 42, '#6a5a8a');

    // list
    this.panel(ctx, LIST_X, LIST_Y - 2, LIST_W, VISIBLE_ROWS * ROW_H + 6);
    const rows = this.rows();
    const cursor = Math.min(this.cursors[this.tab], Math.max(0, rows.length - 1));
    // headings take a line of their own but cannot be picked
    const listed: ({ heading: string } | { row: Row; index: number })[] = [];
    rows.forEach((row, index) => {
      if (row.section && row.section !== rows[index - 1]?.section) listed.push({ heading: row.section });
      listed.push({ row, index });
    });
    const at = listed.findIndex((l) => 'index' in l && l.index === cursor);
    const start = Math.max(0, Math.min(at - 7, listed.length - VISIBLE_ROWS));
    listed.slice(start, start + VISIBLE_ROWS).forEach((line, i) => {
      const y = LIST_Y + 2 + i * ROW_H;
      if ('heading' in line) {
        this.text(ctx, line.heading, LIST_X + 6, y, PAL.pink);
        ctx.fillStyle = 'rgba(255,43,214,0.35)';
        ctx.fillRect(LIST_X + 10 + textWidth(line.heading), y + 2, LIST_W - 18 - textWidth(line.heading), 1);
        return;
      }
      const { row } = line;
      const selected = line.index === cursor;
      if (selected) {
        ctx.fillStyle = 'rgba(255,43,214,0.22)';
        ctx.fillRect(LIST_X + 2, y - 2, LIST_W - 4, ROW_H);
        this.text(ctx, '>', LIST_X + 5, y, PAL.amber);
      }
      const color = row.dim ? '#5a4a7a' : row.color;
      this.text(ctx, row.text, LIST_X + 14, y, color);
      if (row.right) this.text(ctx, row.right, LIST_X + LIST_W - textWidth(row.right) - 8, y, color);
    });
    if (rows.length > VISIBLE_ROWS) {
      this.text(ctx, `${cursor + 1}/${rows.length}`, LIST_X + LIST_W - 40, LIST_Y + VISIBLE_ROWS * ROW_H + 6, '#6a5a8a');
    }

    // detail for the selected row
    const detail = rows[cursor]?.detail;
    if (detail) this.text(ctx, detail, LIST_X + 4, LIST_Y + VISIBLE_ROWS * ROW_H + 6, PAL.cyanPale);

    // rig and stats
    this.panel(ctx, SIDE_X, LIST_Y - 2, SIDE_W, 150);
    const stats = vehicleStats(s.vehicle);
    const caravan = caravanStats(s);
    this.panel(ctx, SIDE_X, LIST_Y + 154, SIDE_W, 92);
    const lines = [
      `HULL ${Math.ceil(s.vehicle.hp)}/${stats.maxHp}  ARMOR ${stats.armor}`,
      `SPEED ${Math.round(caravan.topSpeed)}  SWEEP ${stats.collectRadius}`,
      `FUEL ${s.vehicle.fuel.toFixed(0)}/${caravan.tankCap}`,
      `CARGO ${s.vehicle.cargo.toFixed(0)}/${caravan.cargoCap}  KITS ${s.vehicle.repairKits}`,
      `CARAVAN ${caravan.escorts}/${CARAVAN_CAP[s.vehicle.hullId]}${caravan.wrecked ? `  ${caravan.wrecked} WRECKED` : ''}`,
      ...stats.weapons.map((w, i) => `GUN ${i + 1} ${w.name.toUpperCase()} ${w.damage}`),
    ];
    lines.slice(0, 9).forEach((line, i) => this.text(ctx, line, SIDE_X + 6, LIST_Y + 160 + i * 9, i < 5 ? PAL.white : PAL.amber));

    // the face of the recruit being considered covers the rig
    const face = this.current() === 'CREW' && cursor > 1 ? recruitPool(s, this.city)[cursor - 2] : undefined;
    this.rig.setVisible(!face);
    if (face) {
      const size = PORTRAIT * 5;
      const px = SIDE_X + Math.floor((SIDE_W - size) / 2);
      ctx.drawImage(portrait(face.face, face.role), px, LIST_Y + 6, size, size);
      this.text(ctx, face.name, SIDE_X + 6, LIST_Y + 134, PAL.white);
      this.text(ctx, TRAITS[face.trait].line, SIDE_X + 6, LIST_Y + 143, '#b8a8d8');
    }

    // message
    this.panel(ctx, 0, H - 14, W, 14);
    this.text(ctx, this.message.text, 6, H - 10, this.message.good ? PAL.cyanPale : PAL.red);
  }
}
