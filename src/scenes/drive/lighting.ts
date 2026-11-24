import Phaser from 'phaser';
import { PAL } from '../../art/palette';
import { nearestCopy, sunsetY, type Zone } from '../../sim/world';
import { VIEW_H, VIEW_W } from './particles-layer';

const hex = (c: string): number => parseInt(c.slice(1), 16);

/** Where the rig sits on screen: low, so more of the road toward the sunset shows. */
export const RIG_SCREEN_X = VIEW_W / 2;
export const RIG_SCREEN_Y = Math.round(VIEW_H * 0.72);

const DARKNESS: Record<Zone, number> = { sunset: 0.1, deep: 0.4, predawn: 0.3, scorch: 0, dawn: 0 };

export interface LightingFrame {
  t: number;
  playerY: number;
  scrollY: number;
  heading: number;
  zone: Zone;
  scorchDepth: number;
  secondsUntilDawn: number;
  dt: number;
}

/** Screen-space mood: night darkness, the striped sunset band, day glare, dawn haze, headlights. */
export class Lighting {
  private readonly dark: Phaser.GameObjects.Graphics;
  private readonly sun: Phaser.GameObjects.Graphics;
  private readonly glow: Phaser.GameObjects.Graphics;
  private darkAlpha = 0.1;

  constructor(scene: Phaser.Scene) {
    this.dark = scene.add.graphics().setScrollFactor(0).setDepth(50);
    this.sun = scene.add.graphics().setScrollFactor(0).setDepth(51);
    this.glow = scene.add.graphics().setScrollFactor(0).setDepth(52).setBlendMode(Phaser.BlendModes.ADD);
  }

  update(f: LightingFrame): void {
    this.darkAlpha += (DARKNESS[f.zone] - this.darkAlpha) * Math.min(1, f.dt * 2);
    this.drawDarkness();
    this.drawSunAndHaze(f);
    this.drawGlow(f);
  }

  private drawDarkness(): void {
    const g = this.dark;
    g.clear();
    if (this.darkAlpha < 0.005) return;
    g.fillStyle(hex(PAL.ink), this.darkAlpha);
    g.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  private drawSunAndHaze(f: LightingFrame): void {
    const g = this.sun;
    g.clear();
    const lineY = Math.round(nearestCopy(sunsetY(f.t), f.playerY) - f.scrollY);

    // the scorched day side, ahead of the sunset line
    if (lineY > 0) {
      g.fillStyle(hex('#ffb03a'), 0.34);
      g.fillRect(0, 0, VIEW_W, Math.min(VIEW_H, lineY));
    }

    // the striped sunset band
    for (let y = 0; y < 30; y++) {
      const gap = y > 14 && y % 4 < (y - 14) / 5;
      const sy = lineY + y;
      if (gap || sy < 0 || sy >= VIEW_H) continue;
      g.fillStyle(hex(PAL.SUN[Math.min(PAL.SUN.length - 1, Math.floor(y / 2.5))]), 1);
      g.fillRect(0, sy, VIEW_W, 1);
    }

    // cold dawn haze creeping up from the bottom edge
    const haze = 0.25 * (1 - Math.min(1, f.secondsUntilDawn / 120));
    if (haze > 0.003) {
      for (let i = 0; i < 40; i += 2) {
        g.fillStyle(hex(PAL.dawn), haze * (i / 40));
        g.fillRect(0, VIEW_H - 40 + i, VIEW_W, 2);
      }
    }
  }

  private drawGlow(f: LightingFrame): void {
    const g = this.glow;
    g.clear();
    const lineY = Math.round(nearestCopy(sunsetY(f.t), f.playerY) - f.scrollY);

    // pink light bleeding onto the sand behind the band
    for (let y = 30; y < 80; y += 2) {
      const sy = lineY + y;
      if (sy < 0 || sy >= VIEW_H) continue;
      g.fillStyle(hex('#ff3e8a'), 0.22 * (1 - (y - 30) / 50));
      g.fillRect(0, sy, VIEW_W, 2);
    }
    // white-hot glare on the day side of the line
    for (let y = 2; y < 60; y += 2) {
      const sy = lineY - y;
      if (sy < 0 || sy >= VIEW_H) continue;
      g.fillStyle(hex('#fff1a8'), 0.25 * (1 - y / 60));
      g.fillRect(0, sy, VIEW_W, 2);
    }
    // the deeper into the day, the harsher the light
    if (f.zone === 'scorch') {
      g.fillStyle(hex('#ff8a3d'), Math.min(0.35, f.scorchDepth / 600));
      g.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    // headlights
    if (this.darkAlpha > 0.05) {
      const ax = RIG_SCREEN_X + Math.cos(f.heading) * 10;
      const ay = RIG_SCREEN_Y + Math.sin(f.heading) * 10;
      for (const [half, alpha] of [
        [0.5, 0.05],
        [0.28, 0.06],
      ] as const) {
        const len = 140;
        g.fillStyle(hex('#ffe3f4'), alpha);
        g.fillTriangle(
          ax,
          ay,
          ax + Math.cos(f.heading + half) * len,
          ay + Math.sin(f.heading + half) * len,
          ax + Math.cos(f.heading - half) * len,
          ay + Math.sin(f.heading - half) * len,
        );
      }
    }
  }
}
