import Phaser from 'phaser';
import { BALANCE } from '../../config/balance';
import { getDepletion } from '../../game/session';
import { cellHasX } from '../../sim/particles';
import { hash2 } from '../../sim/rng';

export const VIEW_W = 480;
export const VIEW_H = 270;

const WHITE = 0xffffff;
const PALE = 0x7ffcff;
const DEEP = 0x36b6ff;

/** Twinkling Particle X sparks for every uncollected cell in view. */
export class ParticleLayer {
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    private readonly seed: number,
  ) {
    this.g = scene.add.graphics().setDepth(5);
  }

  update(camX: number, camY: number, t: number, timeMs: number): void {
    const g = this.g;
    g.clear();
    const cell = BALANCE.CELL;
    const depletion = getDepletion();
    const cx1 = Math.floor((camX + VIEW_W) / cell);
    const cy1 = Math.floor((camY + VIEW_H) / cell);
    for (let cy = Math.floor(camY / cell); cy <= cy1; cy++) {
      for (let cx = Math.floor(camX / cell); cx <= cx1; cx++) {
        if (!cellHasX(this.seed, cx, cy, t) || depletion.isDepleted(cx, cy, t)) continue;
        const h = hash2(this.seed + 3, cx, cy);
        const x = cx * cell + Math.floor(hash2(this.seed + 1, cx, cy) * cell);
        const y = cy * cell + Math.floor(hash2(this.seed + 2, cx, cy) * cell);
        const tw = (Math.sin(timeMs * 0.006 + h * 60) + 1) / 2;
        const color = tw > 0.8 ? WHITE : tw > 0.4 ? PALE : DEEP;
        g.fillStyle(color, 1);
        g.fillRect(x, y, 1, 1);
        if (h < 0.1) {
          g.fillStyle(color, 0.5);
          g.fillRect(x - 1, y, 1, 1);
          g.fillRect(x + 1, y, 1, 1);
          g.fillRect(x, y - 1, 1, 1);
          g.fillRect(x, y + 1, 1, 1);
        }
      }
    }
  }
}
