import Phaser from 'phaser';
import { drawText, textWidth } from '../art/font';
import { PAL } from '../art/palette';
import { rigLayout } from '../art/painters';
import { ensurePirateTexture, ensureRigTextures } from '../art/textures';
import { getState, setState } from '../game/session';
import {
  applyBattleResult,
  battleLoot,
  startBattle,
  takeTurn,
  type Action,
  type BattleState,
} from '../sim/battle';
import type { Pirate } from '../sim/pirates';
import { makeRng, randomSeed } from '../sim/rng';
import { vehicleStats } from '../sim/vehicle';

const W = 480;
const H = 270;
const PANEL_Y = 214;
const SEGMENTS = 10;
const ENEMY_X = 372;
const RIG_PIVOT_X = 170;
const RIG_Y = 168;
/** How long the log stays readable between rounds. */
const ROUND_PAUSE_MS = 450;
const RESULT_MS = 1500;

export interface BattleData {
  enemies: Pirate[];
}

type Phase = 'choose' | 'resolving' | 'over';

const RIG_SCALE = { scout: 3, hauler: 2, juggernaut: 1.5 } as const;
const enemyYs = (n: number): number[] => (n === 1 ? [140] : n === 2 ? [105, 175] : [80, 140, 200]);

/** Turn-based fight on its own screen. The world clock is frozen while this runs. */
export class BattleScene extends Phaser.Scene {
  private enemies0: Pirate[] = [];
  private battle!: BattleState;
  private rng = makeRng(1);
  private target = 0;
  private phase: Phase = 'choose';
  private resultLines: string[] = [];
  private canvas!: Phaser.Textures.CanvasTexture;
  private lastSig = '';
  private rigSprite!: Phaser.GameObjects.Image;
  private enemySprites: Phaser.GameObjects.Image[] = [];

  constructor() {
    super('battle');
  }

  init(data: BattleData): void {
    this.enemies0 = data.enemies.map((e) => ({ ...e }));
  }

  create(): void {
    const s = getState();
    this.rng = makeRng(randomSeed());
    this.battle = startBattle(vehicleStats(s.vehicle), s.vehicle, this.enemies0);
    this.target = 0;
    this.phase = 'choose';
    this.resultLines = [];
    this.lastSig = '';
    this.enemySprites = [];

    this.drawBackground();

    const hull = s.vehicle.hullId;
    const layout = rigLayout(hull);
    this.rigSprite = this.add
      .image(RIG_PIVOT_X, RIG_Y, ensureRigTextures(this, s.vehicle)[0])
      .setOrigin(layout.pivotX / layout.w, layout.pivotY / layout.h)
      .setScale(RIG_SCALE[hull])
      .setRotation(Math.PI / 2)
      .setDepth(10);

    const ys = enemyYs(this.enemies0.length);
    this.enemies0.forEach((e, i) => {
      const sprite = this.add
        .image(ENEMY_X, ys[i], ensurePirateTexture(this, e.level))
        .setScale(3)
        .setRotation(Math.PI / 2)
        .setDepth(10);
      this.enemySprites.push(sprite);
      this.tweens.add({
        targets: sprite,
        y: ys[i] + 5,
        duration: 900 + i * 150,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    });

    if (this.textures.exists('battle-ui')) this.textures.remove('battle-ui');
    this.canvas = this.textures.createCanvas('battle-ui', W, H) as Phaser.Textures.CanvasTexture;
    this.add.image(0, 0, 'battle-ui').setOrigin(0, 0).setDepth(20);

    this.bindKeys();
    this.redraw();
  }

  update(): void {
    this.redraw();
  }

  // ------------------------------------------------------------------ input

  private bindKeys(): void {
    const kb = this.input.keyboard;
    if (!kb) return;
    kb.removeAllListeners();
    kb.on('keydown-ONE', () => this.fire(0));
    kb.on('keydown-TWO', () => this.fire(1));
    kb.on('keydown-THREE', () => this.fire(2));
    kb.on('keydown-B', () => this.act({ type: 'brace' }));
    kb.on('keydown-R', () => {
      if (this.battle.player.repairKits > 0) this.act({ type: 'repair' });
    });
    kb.on('keydown-X', () => this.act({ type: 'flee' }));
    for (const key of ['LEFT', 'UP', 'A', 'W']) kb.on(`keydown-${key}`, () => this.cycleTarget(-1));
    for (const key of ['RIGHT', 'DOWN', 'D', 'S']) kb.on(`keydown-${key}`, () => this.cycleTarget(1));
    this.events.once('shutdown', () => kb.removeAllListeners());
  }

  private cycleTarget(step: number): void {
    const n = this.battle.enemies.length;
    for (let i = 1; i <= n; i++) {
      const next = (this.target + step * i + n * i) % n;
      if (this.battle.enemies[next].hp > 0) {
        this.target = next;
        return;
      }
    }
  }

  private fire(weapon: number): void {
    if (weapon < this.battle.player.weapons.length) this.act({ type: 'fire', weapon, target: this.target });
  }

  private act(action: Action): void {
    if (this.phase !== 'choose') return;
    const before = this.battle;
    this.battle = takeTurn(before, action, this.rng);
    if (this.battle === before) return; // a bad pick costs no turn
    this.feedback(before, this.battle);
    if (!this.battle.enemies[this.target] || this.battle.enemies[this.target].hp <= 0) this.cycleTarget(1);

    if (this.battle.outcome === 'ongoing') {
      this.phase = 'resolving';
      this.time.delayedCall(ROUND_PAUSE_MS, () => {
        if (this.phase === 'resolving') this.phase = 'choose';
      });
    } else {
      this.phase = 'over';
      this.finish();
    }
  }

  // --------------------------------------------------------------- feedback

  private feedback(before: BattleState, after: BattleState): void {
    if (after.player.hp < before.player.hp) {
      this.cameras.main.shake(140, 0.006);
      this.rigSprite.setTintFill(0xff3030);
      this.time.delayedCall(110, () => this.rigSprite.clearTint());
    }
    after.enemies.forEach((e, i) => {
      const sprite = this.enemySprites[i];
      if (e.hp < before.enemies[i].hp) {
        sprite.setTintFill(0xffffff);
        this.time.delayedCall(90, () => sprite.clearTint());
      }
      if (e.hp <= 0) sprite.setAlpha(0.2);
    });
  }

  private finish(): void {
    const state = getState();
    const loot = this.battle.outcome === 'won' ? battleLoot(this.enemies0, this.rng) : { credits: 0, cargo: 0 };
    const next = applyBattleResult(state, this.battle, loot);
    setState(next);

    if (this.battle.outcome === 'won') {
      const gained = Math.round(next.vehicle.cargo - state.vehicle.cargo);
      this.resultLines = ['VICTORY', `+${loot.credits} CR   +${gained} X`];
    } else if (this.battle.outcome === 'fled') {
      this.resultLines = ['YOU GOT AWAY'];
    } else {
      this.resultLines = ['THEY STRIPPED YOUR CARGO'];
    }

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

    // striped sun on the horizon
    const horizon = 74;
    for (let y = 0; y < 36; y++) {
      if (y > 16 && y % 4 < (y - 16) / 5) continue;
      g.fillStyle(hex(PAL.SUN[Math.min(11, Math.floor(y / 3))]), 1);
      g.fillRect(0, horizon - 40 + y, W, 1);
    }
    for (let y = 0; y < 30; y += 2) {
      g.fillStyle(hex('#ff3e8a'), 0.18 * (1 - y / 30));
      g.fillRect(0, horizon - 40 - y, W, 2);
    }

    // neon grid floor running to the horizon
    g.fillStyle(hex(PAL.night), 1);
    g.fillRect(0, horizon, W, H - horizon);
    g.lineStyle(1, hex(PAL.cyan), 0.3);
    for (let i = 1; i <= 10; i++) {
      const y = Math.round(horizon + i * i * 1.9);
      g.lineBetween(0, y, W, y);
    }
    for (let x = -240; x <= 720; x += 60) g.lineBetween(240, horizon, x, H);
    g.fillStyle(hex(PAL.pink), 1);
    g.fillRect(0, horizon, W, 1);
  }

  private redraw(): void {
    const sig = JSON.stringify({ b: this.battle, t: this.target, p: this.phase, r: this.resultLines });
    if (sig === this.lastSig) return;
    this.lastSig = sig;
    const ctx = this.canvas.getContext();
    ctx.clearRect(0, 0, W, H);
    this.drawUi(ctx);
    this.canvas.refresh();
  }

  private text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, scale = 1): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    drawText(ctx, s, 0, 0, color, scale > 1 ? `${color}55` : undefined);
    ctx.restore();
  }

  private centered(ctx: CanvasRenderingContext2D, s: string, y: number, color: string, scale = 1): void {
    this.text(ctx, s, Math.round((W - textWidth(s) * scale) / 2), y, color, scale);
  }

  private bar(ctx: CanvasRenderingContext2D, x: number, y: number, frac: number, color: string, segW = 4): void {
    const filled = frac <= 0 ? 0 : Math.ceil(Math.min(1, frac) * SEGMENTS);
    for (let i = 0; i < SEGMENTS; i++) {
      ctx.fillStyle = i < filled ? color : '#2a1a40';
      ctx.fillRect(x + i * (segW + 1), y, segW, 4);
    }
  }

  private drawUi(ctx: CanvasRenderingContext2D): void {
    const b = this.battle;

    // log
    ctx.fillStyle = 'rgba(7,3,12,0.6)';
    ctx.fillRect(4, 4, 250, 40);
    b.log.slice(-4).forEach((line, i) => this.text(ctx, line.toUpperCase(), 8, 8 + i * 9, i === 3 ? PAL.white : PAL.dawn));
    this.text(ctx, `ROUND ${b.round}`, W - textWidth(`ROUND ${b.round}`) - 6, 6, PAL.cyan);

    // enemies
    const ys = enemyYs(b.enemies.length);
    b.enemies.forEach((e, i) => {
      const alive = e.hp > 0;
      const label = `${e.name.toUpperCase()} L${e.level}`;
      this.text(ctx, label, ENEMY_X - textWidth(label) / 2, ys[i] - 46, alive ? PAL.pirate : '#4a5a3a');
      this.bar(ctx, ENEMY_X - 25, ys[i] - 36, e.hp / e.maxHp, PAL.pirate);
      if (alive && i === this.target && b.enemies.filter((x) => x.hp > 0).length > 1) {
        this.text(ctx, '>', ENEMY_X - 62, ys[i] - 3, PAL.amber, 2);
      }
    });

    // player status
    this.text(ctx, 'HULL', 8, PANEL_Y + 6, PAL.pink);
    this.bar(ctx, 30, PANEL_Y + 6, b.player.hp / b.player.maxHp, PAL.pink);
    this.text(ctx, `${Math.ceil(b.player.hp)}/${b.player.maxHp}`, 86, PANEL_Y + 6, PAL.white);
    this.text(ctx, `KITS ${b.player.repairKits}`, 130, PANEL_Y + 6, b.player.repairKits > 0 ? PAL.cyanPale : '#4a3a6a');

    // menu
    ctx.fillStyle = 'rgba(10,4,20,0.85)';
    ctx.fillRect(0, PANEL_Y + 16, W, H - PANEL_Y - 16);
    ctx.fillStyle = PAL.pink;
    ctx.fillRect(0, PANEL_Y + 16, W, 1);

    const items: { text: string; color: string }[] = b.player.weapons.map((w, i) => ({
      text: `${i + 1} FIRE ${w.name.toUpperCase()}`,
      color: PAL.amber,
    }));
    items.push({ text: 'B BRACE', color: PAL.cyan });
    items.push({ text: `R REPAIR KIT X${b.player.repairKits}`, color: b.player.repairKits > 0 ? PAL.pink : '#4a3a6a' });
    items.push({ text: 'X FLEE', color: PAL.white });
    const locked = this.phase !== 'choose';
    items.forEach((item, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      this.text(ctx, item.text, 10 + col * 160, PANEL_Y + 24 + row * 11, locked ? '#5a4a7a' : item.color);
    });
    this.text(ctx, 'LEFT/RIGHT: TARGET', W - textWidth('LEFT/RIGHT: TARGET') - 6, H - 8, '#7a6a9a');

    // result
    if (this.resultLines.length) {
      ctx.fillStyle = 'rgba(7,3,12,0.7)';
      ctx.fillRect(0, 96, W, 64);
      this.resultLines.forEach((line, i) => this.centered(ctx, line, 106 + i * 20, i === 0 ? PAL.amber : PAL.white, 2));
    }
  }
}
