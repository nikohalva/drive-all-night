import Phaser from 'phaser';
import { drawText, textWidth } from '../art/font';
import { PAL } from '../art/palette';
import { rigSignature } from '../art/painters';
import { ensureRigTextures } from '../art/textures';
import { BALANCE } from '../config/balance';
import { getState, setState } from '../game/session';
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
import { compatibleOwned, cycleFit, garageRows, shopRows } from '../sim/shop';
import { vehicleStats } from '../sim/vehicle';
import { cityPosition, nearestCopy } from '../sim/world';
import type { HullId } from '../config/catalog';

const W = 480;
const H = 270;
const TABS = ['SELL', 'SHOP', 'GARAGE', 'SERVICES', 'SAVE', 'LEAVE'] as const;
type Tab = (typeof TABS)[number];
const VISIBLE_ROWS = 15;
const ROW_H = 11;
const LIST_Y = 52;
const LIST_X = 6;
const LIST_W = 296;
const RIG_SCALE: Record<HullId, number> = { scout: 3, hauler: 2, juggernaut: 1.5 };

const REASONS: Record<string, string> = {
  credits: 'NOT ENOUGH CREDITS',
  slot: 'NO FREE SLOT',
  'not-owned': 'NOT IN YOUR GARAGE',
  nothing: 'NOTHING TO DO',
};

interface Row {
  text: string;
  right?: string;
  color: string;
  dim?: boolean;
  detail?: string;
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

  constructor() {
    super('city');
  }

  create(): void {
    this.tab = 0;
    this.cursors = TABS.map(() => 0);
    this.locked = false;
    this.lastSig = '';
    this.rigSig = '';

    this.drawBackground();
    this.rig = this.add.image(392, 104, ensureRigTextures(this, getState().vehicle)[0]).setRotation(Math.PI / 2).setDepth(25);

    if (this.textures.exists('city-ui')) this.textures.remove('city-ui');
    this.canvas = this.textures.createCanvas('city-ui', W, H) as Phaser.Textures.CanvasTexture;
    this.add.image(0, 0, 'city-ui').setOrigin(0, 0).setDepth(20);

    // docking autosaves, so every visit is a checkpoint
    const saved = saveGame(getState());
    this.message = { text: saved ? 'DOCKED. GAME AUTOSAVED' : 'DOCKED. COULD NOT SAVE', good: saved };

    this.bindKeys();
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
    this.tab = (this.tab + step + TABS.length) % TABS.length;
  }

  private moveRow(step: number): void {
    if (this.locked) return;
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

  private choose(): void {
    if (this.locked) return;
    const s = getState();
    const cursor = this.cursors[this.tab];
    switch (this.current()) {
      case 'SELL': {
        const proceeds = Math.floor(s.vehicle.cargo * BALANCE.X_SELL_PRICE);
        this.apply(sellCargo(s), `SOLD CARGO FOR ${proceeds} CR`);
        break;
      }
      case 'SHOP': {
        const row = shopRows(s)[cursor];
        if (!row) break;
        const result =
          row.kind === 'hull' ? buyHull(s, row.id as HullId) : row.kind === 'part' ? buyPart(s, row.id) : buyRepairKit(s);
        if (this.apply(result, `BOUGHT ${row.name}`)) this.afterPurchase();
        break;
      }
      case 'GARAGE': {
        const row = garageRows(s)[cursor];
        if (!row) break;
        const spare = compatibleOwned(s, row.slot);
        if (spare.length === 0) {
          this.say('NO SPARE PARTS FOR THAT SLOT. BUY SOME IN THE SHOP', false);
          break;
        }
        this.apply(cycleFit(s, row.slot, row.index), 'FITTED');
        break;
      }
      case 'SERVICES':
        if (cursor === 0) this.apply(repairFull(s), 'HULL REPAIRED');
        else this.apply(refuelFull(s), 'TANK REFUELLED');
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
    if (this.locked || this.current() !== 'GARAGE') return;
    const row = garageRows(getState())[this.cursors[this.tab]];
    if (row) this.apply(unfitPart(getState(), row.slot, row.index), 'PART REMOVED');
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
    const s = getState();
    const city = cityPosition(s.t);
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
        const value = Math.floor(s.vehicle.cargo * BALANCE.X_SELL_PRICE);
        return [
          {
            text: 'SELL ALL CARGO',
            right: `${value} CR`,
            color: PAL.amber,
            dim: s.vehicle.cargo <= 0,
            detail: `CARGO ${s.vehicle.cargo.toFixed(1)} X AT ${BALANCE.X_SELL_PRICE} CR EACH${s.debt > 0 ? '. DEBT IS PAID FIRST' : ''}`,
          },
        ];
      }
      case 'SHOP':
        return shopRows(s).map((r) => ({
          text: r.name,
          right: `${r.price} CR`,
          color: r.kind === 'hull' ? PAL.pink : r.kind === 'kit' ? PAL.cyanPale : PAL.amber,
          dim: !r.affordable,
          detail: `${r.summary}   ${r.delta}`,
        }));
      case 'GARAGE':
        return garageRows(s).map((r) => ({
          text: r.label,
          color: r.partId ? PAL.white : '#7a6a9a',
          detail:
            compatibleOwned(s, r.slot).length > 0
              ? 'ENTER: FIT NEXT SPARE   U: REMOVE'
              : 'NO SPARE PARTS. BUY SOME IN THE SHOP   U: REMOVE',
        }));
      case 'SERVICES': {
        const stats = vehicleStats(s.vehicle);
        const repairCost = Math.ceil((stats.maxHp - s.vehicle.hp) * BALANCE.REPAIR_COST_PER_HP);
        const fuelCost = Math.ceil((stats.tankCap - s.vehicle.fuel) * BALANCE.X_BUY_PRICE);
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
            detail: `FUEL ${s.vehicle.fuel.toFixed(0)}/${stats.tankCap}. PARTICLE X IS FUEL`,
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
    this.text(ctx, 'MEGA CITY DOCK', 6, 5, PAL.pink, 2);
    const cr = `CR ${Math.floor(s.credits)}`;
    this.text(ctx, cr, W - textWidth(cr) * 2 - 8, 5, PAL.amber, 2);
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
    const start = Math.max(0, Math.min(cursor - 7, rows.length - VISIBLE_ROWS));
    rows.slice(start, start + VISIBLE_ROWS).forEach((row, i) => {
      const y = LIST_Y + 2 + i * ROW_H;
      const selected = start + i === cursor;
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
    this.panel(ctx, 310, LIST_Y - 2, 164, 128);
    const stats = vehicleStats(s.vehicle);
    this.panel(ctx, 310, 184, 164, 66);
    const lines = [
      `HULL ${Math.ceil(s.vehicle.hp)}/${stats.maxHp}  ARMOR ${stats.armor}`,
      `SPEED ${stats.topSpeed}  SWEEP ${stats.collectRadius}`,
      `FUEL ${s.vehicle.fuel.toFixed(0)}/${stats.tankCap}`,
      `CARGO ${s.vehicle.cargo.toFixed(0)}/${stats.cargoCap}  KITS ${s.vehicle.repairKits}`,
      ...stats.weapons.map((w, i) => `GUN ${i + 1} ${w.name.toUpperCase()} ${w.damage}`),
    ];
    lines.slice(0, 7).forEach((line, i) => this.text(ctx, line, 316, 190 + i * 8, i < 4 ? PAL.white : PAL.amber));

    // message
    this.panel(ctx, 0, 256, W, 14);
    this.text(ctx, this.message.text, 6, 260, this.message.good ? PAL.cyanPale : PAL.red);
  }
}
