import Phaser from 'phaser';
import { drawText, textWidth } from '../art/font';
import { PAL } from '../art/palette';
import { rigLayout } from '../art/painters';
import { ensureEscortTextures, ensurePirateTexture, ensureRigTextures } from '../art/textures';
import type { EscortKind } from '../config/escorts';
import { VIEW } from '../config/view';
import { getState, setState } from '../game/session';
import {
  applyBattleResult,
  autoOrders,
  battleLoot,
  isAlive,
  living,
  ordersFor,
  resolveRound,
  startBattle,
  targetsFor,
  type BattleState,
  type Order,
  type OrderType,
  type Unit,
} from '../sim/battle';
import type { Pirate } from '../sim/pirates';
import { makeRng, randomSeed } from '../sim/rng';

const W = VIEW.W;
const H = VIEW.H;
const PANEL_Y = H - 88;
const COLUMN_X = { player: { front: 250, back: 140 }, enemy: { front: 400, back: 510 } } as const;
const ROW_STEP = 50;
const CENTRE_Y = 150;
const ROUND_PAUSE_MS = 650;
const RESULT_MS = 1600;

const ORDER_LABEL: Record<OrderType, string> = {
  fire: 'FIRE',
  guard: 'GUARD AN ALLY',
  repair: 'REPAIR AN ALLY',
  spot: 'SPOT TARGETS',
  brace: 'BRACE',
  move: 'SWAP ROW',
  kit: 'USE REPAIR KIT',
  flee: 'FLEE (WHOLE CARAVAN)',
};

export interface BattleData {
  enemies: Pirate[];
}

type Phase = 'order' | 'target' | 'resolving' | 'over';

/** Tactical turn-based fight: give every vehicle an order, then the round plays out. */
export class BattleScene extends Phaser.Scene {
  private enemies0: Pirate[] = [];
  private battle!: BattleState;
  private rng = makeRng(1);
  private orders: Record<string, Order> = {};
  /** Index into the living player units of the vehicle being given an order. */
  private active = 0;
  private menu = 0;
  private targetIndex = 0;
  private phase: Phase = 'order';
  private resultLines: string[] = [];
  private sprites = new Map<string, Phaser.GameObjects.Image>();
  private canvas!: Phaser.Textures.CanvasTexture;
  private lastSig = '';

  constructor() {
    super('battle');
  }

  init(data: BattleData): void {
    this.enemies0 = data.enemies.map((e) => ({ ...e }));
  }

  create(): void {
    this.rng = makeRng(randomSeed());
    this.battle = startBattle(getState(), this.enemies0);
    this.orders = {};
    this.active = 0;
    this.menu = 0;
    this.phase = 'order';
    this.resultLines = [];
    this.lastSig = '';
    this.sprites = new Map();

    this.drawBackground();
    this.makeSprites();

    if (this.textures.exists('battle-ui')) this.textures.remove('battle-ui');
    this.canvas = this.textures.createCanvas('battle-ui', W, H) as Phaser.Textures.CanvasTexture;
    this.add.image(0, 0, 'battle-ui').setOrigin(0, 0).setDepth(20);

    this.bindKeys();
  }

  update(): void {
    this.layoutSprites();
    this.redraw();
  }

  // --------------------------------------------------------------- sprites

  private makeSprites(): void {
    const s = getState();
    for (const u of this.battle.units) {
      let key: string;
      let scale = 2;
      if (u.role === 'lead') {
        key = ensureRigTextures(this, s.vehicle)[0];
        scale = s.vehicle.hullId === 'scout' ? 2 : 1;
      } else if (u.side === 'player') {
        const e = s.caravan.find((x) => x.id === u.escortId);
        key = ensureEscortTextures(this, u.role as EscortKind, e?.tier ?? 1)[0];
      } else {
        key = ensurePirateTexture(this, u.level ?? 1);
      }
      // player sprites face up and enemy sprites face down; a quarter turn faces each at the other side
      const img = this.add.image(0, 0, key).setScale(scale).setRotation(Math.PI / 2).setDepth(10);
      if (u.role === 'lead') {
        const l = rigLayout(s.vehicle.hullId);
        img.setOrigin(l.pivotX / l.w, 0.5);
      }
      this.sprites.set(u.uid, img);
    }
    this.layoutSprites();
  }

  /** Where each unit stands: its side and row pick the column, its place in the row the height. */
  private positionOf(u: Unit): { x: number; y: number } {
    const rowMates = this.battle.units.filter((x) => x.side === u.side && x.row === u.row);
    const i = rowMates.findIndex((x) => x.uid === u.uid);
    return { x: COLUMN_X[u.side][u.row], y: Math.round(CENTRE_Y + (i - (rowMates.length - 1) / 2) * ROW_STEP) };
  }

  private layoutSprites(): void {
    for (const u of this.battle.units) {
      const img = this.sprites.get(u.uid);
      if (!img) continue;
      const p = this.positionOf(u);
      img.setPosition(p.x, p.y).setAlpha(isAlive(u) ? 1 : 0.2);
    }
  }

  // ----------------------------------------------------------------- input

  private bindKeys(): void {
    const kb = this.input.keyboard;
    if (!kb) return;
    kb.removeAllListeners();
    for (const key of ['UP', 'W']) kb.on(`keydown-${key}`, () => this.step(-1, 'vertical'));
    for (const key of ['DOWN', 'S']) kb.on(`keydown-${key}`, () => this.step(1, 'vertical'));
    for (const key of ['LEFT', 'A']) kb.on(`keydown-${key}`, () => this.step(-1, 'horizontal'));
    for (const key of ['RIGHT', 'D']) kb.on(`keydown-${key}`, () => this.step(1, 'horizontal'));
    for (const key of ['ENTER', 'SPACE']) kb.on(`keydown-${key}`, () => this.confirm());
    for (const key of ['ESC', 'BACKSPACE']) kb.on(`keydown-${key}`, () => this.back());
    kb.on('keydown-Q', () => this.autoRest());
    this.events.once('shutdown', () => kb.removeAllListeners());
  }

  private mine(): Unit[] {
    return living(this.battle, 'player');
  }

  private activeUnit(): Unit | undefined {
    return this.mine()[this.active];
  }

  private menuItems(): OrderType[] {
    const u = this.activeUnit();
    return u ? ordersFor(this.battle, u) : [];
  }

  /** Who the highlighted order may be aimed at. */
  private targetChoices(): Unit[] {
    const u = this.activeUnit();
    const type = this.menuItems()[this.menu];
    if (!u) return [];
    if (type === 'fire') {
      const spotted = this.mine().some((m) => m.role === 'scout' && this.orders[m.uid]?.type === 'spot');
      return targetsFor(this.battle, u, spotted);
    }
    if (type === 'guard') return this.mine().filter((m) => m.uid !== u.uid);
    if (type === 'repair') return this.mine();
    return [];
  }

  private step(dir: number, axis: 'vertical' | 'horizontal'): void {
    if (this.phase === 'order' && axis === 'vertical') {
      const n = this.menuItems().length;
      if (n > 0) this.menu = (this.menu + dir + n) % n;
    } else if (this.phase === 'target') {
      const n = this.targetChoices().length;
      if (n > 0) this.targetIndex = (this.targetIndex + dir + n) % n;
    }
  }

  private confirm(): void {
    const u = this.activeUnit();
    if (!u) return;
    if (this.phase === 'order') {
      const type = this.menuItems()[this.menu];
      if (type === 'fire' || type === 'guard' || type === 'repair') {
        const choices = this.targetChoices();
        if (choices.length === 0) return;
        // start on the weakest enemy, or the most hurt ally
        const sorted = [...choices].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
        this.targetIndex = choices.indexOf(sorted[0]);
        this.phase = 'target';
        return;
      }
      this.setOrder(u, { type } as Order);
    } else if (this.phase === 'target') {
      const type = this.menuItems()[this.menu] as 'fire' | 'guard' | 'repair';
      const target = this.targetChoices()[this.targetIndex];
      if (target) this.setOrder(u, { type, target: target.uid });
    }
  }

  private back(): void {
    if (this.phase === 'target') {
      this.phase = 'order';
    } else if (this.phase === 'order' && this.active > 0) {
      this.active--;
      const u = this.activeUnit();
      if (u) delete this.orders[u.uid];
      this.menu = 0;
    }
  }

  private setOrder(u: Unit, order: Order): void {
    this.orders[u.uid] = order;
    this.phase = 'order';
    this.menu = 0;
    if (order.type === 'flee') {
      this.resolve();
      return;
    }
    this.active++;
    if (this.active >= this.mine().length) this.resolve();
  }

  /** Q: sensible orders for everyone still waiting, then fight. */
  private autoRest(): void {
    if (this.phase !== 'order' && this.phase !== 'target') return;
    const auto = autoOrders(this.battle);
    for (const u of this.mine()) if (!this.orders[u.uid]) this.orders[u.uid] = auto[u.uid];
    this.resolve();
  }

  private resolve(): void {
    const before = this.battle;
    this.battle = resolveRound(before, this.orders, this.rng);
    this.feedback(before, this.battle);
    this.orders = {};
    this.active = 0;
    this.menu = 0;
    if (this.battle.outcome !== 'ongoing') {
      this.phase = 'over';
      this.finish();
      return;
    }
    this.phase = 'resolving';
    this.time.delayedCall(ROUND_PAUSE_MS, () => {
      if (this.phase === 'resolving') this.phase = 'order';
    });
  }

  private feedback(before: BattleState, after: BattleState): void {
    let mineHurt = false;
    for (const u of after.units) {
      const prev = before.units.find((x) => x.uid === u.uid);
      const img = this.sprites.get(u.uid);
      if (!prev || !img) continue;
      if (u.hp < prev.hp) {
        img.setTintFill(u.side === 'player' ? 0xff3030 : 0xffffff);
        this.time.delayedCall(110, () => img.clearTint());
        if (u.side === 'player') mineHurt = true;
      } else if (u.hp > prev.hp) {
        img.setTintFill(0x7dff3a);
        this.time.delayedCall(140, () => img.clearTint());
      }
    }
    if (mineHurt) this.cameras.main.shake(140, 0.006);
  }

  private finish(): void {
    const state = getState();
    const loot = this.battle.outcome === 'won' ? battleLoot(this.enemies0, this.rng) : { credits: 0, cargo: 0 };
    const next = applyBattleResult(state, this.battle, loot);
    setState(next);
    const wrecked = next.caravan.filter((e) => e.hp <= 0).length - state.caravan.filter((e) => e.hp <= 0).length;
    if (this.battle.outcome === 'won') {
      const gained = Math.round(next.vehicle.cargo - state.vehicle.cargo);
      this.resultLines = ['VICTORY', `+${loot.credits} CR   +${gained} X`];
    } else if (this.battle.outcome === 'fled') {
      this.resultLines = ['THE CARAVAN GOT AWAY'];
    } else {
      this.resultLines = ['THEY STRIPPED YOUR CARGO'];
    }
    if (wrecked > 0) this.resultLines.push(`${wrecked} ESCORT${wrecked > 1 ? 'S' : ''} WRECKED - REPAIR IN A CITY`);
    this.time.delayedCall(RESULT_MS, () => {
      const outcome = this.battle.outcome;
      this.scene.stop();
      this.scene.get('drive').events.emit('battle-done', outcome);
    });
  }

  // ---------------------------------------------------------------- drawing

  private drawBackground(): void {
    const g = this.add.graphics().setDepth(0);
    const hex = (c: string): number => parseInt(c.slice(1), 16);
    g.fillStyle(0x12062a, 1);
    g.fillRect(0, 0, W, H);
    const horizon = 70;
    for (let y = 0; y < 36; y++) {
      if (y > 16 && y % 4 < (y - 16) / 5) continue;
      g.fillStyle(hex(PAL.SUN[Math.min(11, Math.floor(y / 3))]), 1);
      g.fillRect(0, horizon - 40 + y, W, 1);
    }
    g.fillStyle(hex(PAL.night), 1);
    g.fillRect(0, horizon, W, H - horizon);
    g.lineStyle(1, hex(PAL.cyan), 0.25);
    for (let i = 1; i <= 12; i++) {
      const y = Math.round(horizon + i * i * 2);
      g.lineBetween(0, y, W, y);
    }
    for (let x = -400; x <= W + 400; x += 60) g.lineBetween(W / 2, horizon, x, H);
    g.fillStyle(hex(PAL.pink), 1);
    g.fillRect(0, horizon, W, 1);
  }

  private redraw(): void {
    const sig = JSON.stringify({
      b: this.battle,
      o: this.orders,
      a: this.active,
      m: this.menu,
      t: this.targetIndex,
      p: this.phase,
      r: this.resultLines,
    });
    if (sig === this.lastSig) return;
    this.lastSig = sig;
    const ctx = this.canvas.getContext();
    ctx.clearRect(0, 0, W, H);
    this.drawUi(ctx);
    this.canvas.refresh();
  }

  private text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, scale = 1): void {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(scale, scale);
    drawText(ctx, s, 0, 0, color, scale > 1 ? `${color}55` : undefined);
    ctx.restore();
  }

  private drawUi(ctx: CanvasRenderingContext2D): void {
    const b = this.battle;
    const active = this.phase === 'order' || this.phase === 'target' ? this.activeUnit() : undefined;
    const target = this.phase === 'target' ? this.targetChoices()[this.targetIndex] : undefined;

    this.text(ctx, 'BACK', COLUMN_X.player.back - 8, 76, '#7a6a9a');
    this.text(ctx, 'FRONT', COLUMN_X.player.front - 10, 76, '#7a6a9a');
    this.text(ctx, 'FRONT', COLUMN_X.enemy.front - 10, 76, '#7a6a9a');
    this.text(ctx, 'BACK', COLUMN_X.enemy.back - 8, 76, '#7a6a9a');

    // unit plates: name, hull bar, current order
    for (const u of b.units) {
      const p = this.positionOf(u);
      const alive = isAlive(u);
      const color = u.side === 'player' ? (u.role === 'lead' ? PAL.cyan : PAL.white) : PAL.pirate;
      const name = u.role === 'lead' ? 'YOU' : u.name;
      this.text(ctx, name, p.x - textWidth(name) / 2, p.y + 18, alive ? color : '#4a3a5a');
      ctx.fillStyle = '#2a1a40';
      ctx.fillRect(p.x - 16, p.y + 25, 32, 3);
      ctx.fillStyle = u.side === 'player' ? PAL.pink : PAL.pirate;
      ctx.fillRect(p.x - 16, p.y + 25, Math.round(32 * Math.max(0, u.hp / u.maxHp)), 3);
      const order = this.orders[u.uid];
      if (order) this.text(ctx, ORDER_LABEL[order.type].split(' ')[0], p.x - 12, p.y - 26, PAL.amber);
      if (active && u.uid === active.uid) {
        ctx.strokeStyle = PAL.cyan;
        ctx.strokeRect(p.x - 26.5, p.y - 20.5, 53, 52);
      }
      if (target && u.uid === target.uid) {
        ctx.strokeStyle = PAL.amber;
        ctx.strokeRect(p.x - 26.5, p.y - 20.5, 53, 52);
        this.text(ctx, '>', p.x - 36, p.y - 3, PAL.amber, 2);
      }
    }

    // log
    ctx.fillStyle = 'rgba(7,3,12,0.65)';
    ctx.fillRect(4, 4, 330, 34);
    b.log.slice(-3).forEach((line, i) => this.text(ctx, line.toUpperCase(), 8, 8 + i * 9, i === 2 ? PAL.white : PAL.dawn));
    const round = `ROUND ${b.round}`;
    this.text(ctx, round, W - textWidth(round) - 6, 6, PAL.cyan);

    // order panel
    ctx.fillStyle = 'rgba(10,4,20,0.9)';
    ctx.fillRect(0, PANEL_Y, W, H - PANEL_Y);
    ctx.fillStyle = PAL.pink;
    ctx.fillRect(0, PANEL_Y, W, 1);

    if (active) {
      const title = active.role === 'lead' ? 'YOUR RIG' : active.name;
      this.text(ctx, `ORDERS FOR ${title}`, 10, PANEL_Y + 7, PAL.cyan);
      this.menuItems().forEach((type, i) => {
        const selected = i === this.menu;
        const label = type === 'kit' ? `${ORDER_LABEL.kit} (${b.repairKits})` : ORDER_LABEL[type];
        this.text(ctx, `${selected ? '>' : ' '} ${label}`, 10, PANEL_Y + 19 + i * 9, selected ? PAL.amber : '#b8a8d8');
      });
      const help =
        this.phase === 'target'
          ? 'LEFT/RIGHT: PICK TARGET   ENTER: CONFIRM   ESC: BACK'
          : 'UP/DOWN: ORDER   ENTER: CHOOSE   ESC: BACK   Q: AUTO FOR THE REST';
      this.text(ctx, help, 10, H - 9, '#7a6a9a');
    }

    // who still needs orders
    this.text(ctx, 'CARAVAN', 330, PANEL_Y + 7, PAL.cyan);
    this.mine().forEach((u, i) => {
      const o = this.orders[u.uid];
      const name = u.role === 'lead' ? 'YOUR RIG' : u.name;
      const line = `${name.padEnd(16, ' ')} ${o ? ORDER_LABEL[o.type].split(' ')[0] : '...'}`;
      this.text(ctx, line, 330, PANEL_Y + 19 + i * 9, o ? PAL.amber : active?.uid === u.uid ? PAL.white : '#8a7aaa');
    });

    if (this.resultLines.length) {
      ctx.fillStyle = 'rgba(7,3,12,0.75)';
      ctx.fillRect(0, 110, W, 24 + this.resultLines.length * 20);
      this.resultLines.forEach((line, i) => {
        const scale = i === 0 ? 2 : 1;
        this.text(ctx, line, (W - textWidth(line) * scale) / 2, 120 + i * 20, i === 0 ? PAL.amber : PAL.white, scale);
      });
    }
  }
}
