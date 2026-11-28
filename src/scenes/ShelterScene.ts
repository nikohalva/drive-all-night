import Phaser from 'phaser';
import { sound } from '../audio/engine';
import { drawText, textWidth } from '../art/font';
import { PAL } from '../art/palette';
import { VIEW } from '../config/view';
import { getState, setState } from '../game/session';
import { planetTimeLabel } from '../sim/clock';
import { saveGame } from '../sim/save';
import { vacantSites, type Vacant } from '../sim/shelter';
import { nearestCopy } from '../sim/world';
import { restRows, restFor } from './rest-rows';

const W = VIEW.W;
const H = VIEW.H;
const ROW_H = 16;

/** A vacant mine: wait out the day, save, and leave. */
export class ShelterScene extends Phaser.Scene {
  private site!: Vacant;
  private cursor = 0;
  private message = '';
  private canvas!: Phaser.Textures.CanvasTexture;

  constructor() {
    super('shelter');
  }

  init(data: { vacantId?: string }): void {
    const sites = vacantSites(getState().seed);
    this.site = sites.find((v) => v.id === data.vacantId) ?? sites[0];
  }

  create(): void {
    this.cursor = 0;
    this.message = 'AN ABANDONED SHAFT. NOBODY WILL MIND IF YOU STAY.';
    if (this.textures.exists('shelter-ui')) this.textures.remove('shelter-ui');
    this.canvas = this.textures.createCanvas('shelter-ui', W, H) as Phaser.Textures.CanvasTexture;
    this.add.image(0, 0, 'shelter-ui').setOrigin(0, 0);
    const kb = this.input.keyboard;
    kb?.removeAllListeners();
    for (const key of ['UP', 'W']) kb?.on(`keydown-${key}`, () => this.move(-1));
    for (const key of ['DOWN', 'S']) kb?.on(`keydown-${key}`, () => this.move(1));
    for (const key of ['ENTER', 'SPACE']) kb?.on(`keydown-${key}`, () => this.choose());
    kb?.on('keydown-ESC', () => this.leave());
    this.events.once('shutdown', () => kb?.removeAllListeners());
    this.render();
  }

  private labels(): { text: string; right: string }[] {
    return [
      ...restRows(getState(), this.site.y).map((r) => ({ text: r.text, right: planetTimeLabel(r.seconds) })),
      { text: 'SAVE GAME', right: '' },
      { text: 'BACK TO THE SURFACE', right: '' },
    ];
  }

  private move(step: number): void {
    const n = this.labels().length;
    this.cursor = (this.cursor + step + n) % n;
    this.render();
  }

  private choose(): void {
    const waits = restRows(getState(), this.site.y);
    if (this.cursor < waits.length) {
      this.message = restFor(waits[this.cursor]);
      sound.play('find');
    } else if (this.cursor === waits.length) {
      this.message = saveGame(getState()) ? 'GAME SAVED' : 'COULD NOT SAVE';
    } else {
      this.leave();
      return;
    }
    this.render();
  }

  private leave(): void {
    const s = getState();
    setState({ ...s, player: { x: this.site.exitX, y: nearestCopy(this.site.exitY, s.player.y), heading: -Math.PI / 2 } });
    this.scene.stop();
    this.scene.get('drive').events.emit('baron-done');
  }

  private render(): void {
    const ctx = this.canvas.getContext();
    ctx.fillStyle = '#0a0512';
    ctx.fillRect(0, 0, W, H);
    const text = (str: string, x: number, y: number, color: string, scale = 1): void => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      drawText(ctx, str, 0, 0, color, scale > 1 ? `${color}55` : undefined);
      ctx.restore();
    };
    text('VACANT MINE', 20, 24, '#c8b8e8', 3);
    text('MEDICS HEAL AND MECHANICS REPAIR WHILE YOU WAIT', 20, 50, '#8a7aaa');
    this.labels().forEach((row, i) => {
      const y = 80 + i * ROW_H;
      if (i === this.cursor) {
        ctx.fillStyle = 'rgba(192,80,255,0.25)';
        ctx.fillRect(14, y - 5, W - 28, ROW_H);
        text('>', 20, y, PAL.amber);
      }
      text(row.text, 30, y, PAL.white);
      if (row.right) text(row.right, W - textWidth(row.right) - 24, y, PAL.amber);
    });
    text(this.message, 20, H - 20, PAL.cyanPale);
    this.canvas.refresh();
  }
}
