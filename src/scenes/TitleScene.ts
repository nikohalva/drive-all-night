import Phaser from 'phaser';
import { PAL } from '../art/palette';
import { VERSION_LABEL } from '../config/version';
import { VIEW } from '../config/view';
import { ensureLabel, ensureRigTextures } from '../art/textures';
import { resetDepletion, setState } from '../game/session';
import { newGame } from '../sim/game-state';
import { randomSeed } from '../sim/rng';
import { loadGame, saveGame } from '../sim/save';
import { starterVehicle } from '../sim/vehicle';

const W = VIEW.W;
const H = VIEW.H;
/** Layout was drawn for 270 px of height; scale vertical positions from that. */
const S = H / 270;
const hex = (c: string): number => parseInt(c.slice(1), 16);

/** Title screen: CONTINUE (only with a usable save), NEW GAME and STORY. */
export class TitleScene extends Phaser.Scene {
  private items: { label: string; run: () => void }[] = [];
  private choice = 0;
  private menu: Phaser.GameObjects.Image[] = [];

  constructor() {
    super('title');
  }

  create(): void {
    this.drawBackdrop();

    const label = (text: string, x: number, y: number, color: string, scale: number): Phaser.GameObjects.Image =>
      this.add.image(x, y, ensureLabel(this, text, color, `${color}66`)).setScale(scale).setOrigin(0.5, 0).setDepth(10);
    // big lettering: a dark drop shadow instead of a glow, which would clog the letters when scaled up
    const title = (text: string, y: number, color: string, scale: number): void => {
      const tex = ensureLabel(this, text, color);
      this.add.image(W / 2 + scale, y + scale, tex).setScale(scale).setOrigin(0.5, 0).setTintFill(0x07020f).setDepth(9);
      this.add.image(W / 2, y, tex).setScale(scale).setOrigin(0.5, 0).setDepth(10);
    };
    title('DRIVE', Math.round(24 * S), PAL.pink, 8);
    title('ALL NIGHT', Math.round(72 * S), PAL.amber, 5);

    const rig = this.add
      .image(W / 2, Math.round(218 * S), ensureRigTextures(this, starterVehicle())[0])
      .setRotation(Math.PI / 2)
      .setScale(2)
      .setDepth(10);
    this.tweens.add({ targets: rig, x: W / 2 + 6, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const saved = loadGame();
    this.items = [];
    if (saved) {
      this.items.push({
        label: 'CONTINUE',
        run: () => {
          setState(saved);
          resetDepletion();
          this.scene.start('drive');
        },
      });
    }
    this.items.push({
      label: 'NEW GAME',
      run: () => {
        const fresh = newGame(randomSeed());
        setState(fresh);
        resetDepletion();
        saveGame(fresh);
        this.scene.start('intro', { next: 'drive' });
      },
    });
    // watch the opening again without touching the save
    this.items.push({ label: 'STORY', run: () => this.scene.start('intro', { next: 'title' }) });
    this.choice = 0;

    this.add.image(W - 6, 6, ensureLabel(this, VERSION_LABEL, '#c8b8e8')).setOrigin(1, 0).setDepth(10);
    label('UP/DOWN + ENTER', W / 2, H - 20, '#7a6a9a', 1);
    this.add
      .image(W / 2, H - 10, ensureLabel(this, 'W/S/A/D OR ARROWS DRIVE   F FUEL   E DOCK   H HELP   C CREW   N SOUND', '#7a6a9a'))
      .setOrigin(0.5, 0)
      .setDepth(10);

    const kb = this.input.keyboard;
    kb?.removeAllListeners();
    for (const key of ['UP', 'W']) kb?.on(`keydown-${key}`, () => this.move(-1));
    for (const key of ['DOWN', 'S']) kb?.on(`keydown-${key}`, () => this.move(1));
    for (const key of ['ENTER', 'SPACE']) kb?.on(`keydown-${key}`, () => this.items[this.choice].run());
    this.events.once('shutdown', () => kb?.removeAllListeners());

    this.renderMenu();
  }

  private move(step: number): void {
    this.choice = (this.choice + step + this.items.length) % this.items.length;
    this.renderMenu();
  }

  private renderMenu(): void {
    this.menu.forEach((m) => m.destroy());
    this.menu = this.items.map((item, i) => {
      const selected = i === this.choice;
      const text = selected ? `> ${item.label} <` : item.label;
      return this.add
        .image(W / 2, Math.round(132 * S) + i * 22, ensureLabel(this, text, selected ? PAL.white : '#8a7aaa', selected ? `${PAL.pink}88` : undefined))
        .setScale(2)
        .setOrigin(0.5, 0)
        .setDepth(10);
    });
  }

  private drawBackdrop(): void {
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(0x12062a, 1);
    g.fillRect(0, 0, W, H);

    // a big striped sun sinking into the horizon
    const horizon = Math.round(160 * S);
    const cx = W / 2;
    for (let y = 0; y < 90; y++) {
      const gap = y > 40 && y % 5 < (y - 40) / 8;
      if (gap) continue;
      const hw = Math.floor(Math.sqrt(Math.max(0, 90 * 90 - (90 - y) * (90 - y))));
      g.fillStyle(hex(PAL.SUN[Math.min(11, Math.floor(y / 7.5))]), 1);
      g.fillRect(cx - hw, horizon - 90 + y, hw * 2, 1);
    }
    for (let y = 0; y < 40; y += 2) {
      g.fillStyle(hex('#ff3e8a'), 0.16 * (1 - y / 40));
      g.fillRect(0, horizon - 90 - y, W, 2);
    }

    // neon grid floor
    g.fillStyle(hex(PAL.night), 1);
    g.fillRect(0, horizon, W, H - horizon);
    g.lineStyle(1, hex(PAL.cyan), 0.32);
    for (let i = 1; i <= 8; i++) {
      const y = Math.round(horizon + i * i * 1.8);
      g.lineBetween(0, y, W, y);
    }
    for (let x = -400; x <= W + 400; x += 60) g.lineBetween(cx, horizon, x, H);
    g.fillStyle(hex(PAL.pink), 1);
    g.fillRect(0, horizon, W, 1);
  }
}
