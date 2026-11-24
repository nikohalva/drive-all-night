import Phaser from 'phaser';
import { drawText, textWidth } from '../art/font';
import { PAL } from '../art/palette';
import { NIGHT_LEN } from '../config/balance';
import { getState, ui } from '../game/session';
import { planetTimeLabel } from '../sim/clock';
import { vehicleStats } from '../sim/vehicle';
import { behindSunset, cityPosition, secondsUntilDawn, zoneAt } from '../sim/world';

const W = 480;
const H = 270;
const BAR_Y = 250;
const SEGMENTS = 8;
const MAP_X = 340;
const MAP_W = 130;

interface HudData {
  fuel: number;
  cargo: number;
  hull: number;
  credits: number;
  debt: number;
  mapPlayer: number;
  mapCity: number;
  dawnLabel: string | null;
  scorching: boolean;
  broken: boolean;
  nearDock: boolean;
  fuelHint: boolean;
  message: string | null;
  blink: boolean;
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** The always-on overlay: bars, credits, strip map and prompts. Redrawn only when something changes. */
export class HudScene extends Phaser.Scene {
  private canvas!: Phaser.Textures.CanvasTexture;
  private lastSig = '';

  constructor() {
    super('hud');
  }

  create(): void {
    if (this.textures.exists('hud')) this.textures.remove('hud');
    this.canvas = this.textures.createCanvas('hud', W, H) as Phaser.Textures.CanvasTexture;
    this.add.image(0, 0, 'hud').setOrigin(0, 0);
    this.lastSig = '';
  }

  update(time: number): void {
    const data = this.read(time);
    const sig = JSON.stringify(data);
    if (sig === this.lastSig) return;
    this.lastSig = sig;
    const ctx = this.canvas.getContext();
    ctx.clearRect(0, 0, W, H);
    this.draw(ctx, data);
    this.canvas.refresh();
  }

  private read(time: number): HudData {
    const s = getState();
    const stats = vehicleStats(s.vehicle);
    const y = s.player.y;
    const zone = zoneAt(y, s.t);
    const b = behindSunset(y, s.t);
    const mapPlayer = b < NIGHT_LEN ? 1 - b / NIGHT_LEN : zone === 'scorch' ? 1 : 0;
    const mapCity = 1 - behindSunset(cityPosition(s.t).y, s.t) / NIGHT_LEN;
    const dawnIn = secondsUntilDawn(y, s.t);
    return {
      fuel: Math.ceil(clamp01(s.vehicle.fuel / stats.tankCap) * SEGMENTS),
      cargo: Math.ceil(clamp01(s.vehicle.cargo / stats.cargoCap) * SEGMENTS),
      hull: Math.ceil(clamp01(s.vehicle.hp / stats.maxHp) * SEGMENTS),
      credits: Math.floor(s.credits),
      debt: Math.floor(s.debt),
      mapPlayer: Math.round(clamp01(mapPlayer) * (MAP_W - 1)),
      mapCity: Math.round(clamp01(mapCity) * (MAP_W - 1)),
      dawnLabel: Number.isFinite(dawnIn) ? planetTimeLabel(dawnIn) : null,
      scorching: ui.scorching,
      broken: ui.broken,
      nearDock: ui.nearDock,
      fuelHint: ui.fuelHint,
      message: ui.message,
      blink: Math.floor(time / 300) % 2 === 0,
    };
  }

  private bar(ctx: CanvasRenderingContext2D, x: number, label: string, filled: number, color: string): number {
    drawText(ctx, label, x, BAR_Y + 7, color, `${color}44`);
    const bx = x + textWidth(label) + 3;
    for (let i = 0; i < SEGMENTS; i++) {
      ctx.fillStyle = i < filled ? color : '#2a1a40';
      ctx.fillRect(bx + i * 5, BAR_Y + 7, 4, 5);
    }
    return bx + SEGMENTS * 5;
  }

  private centered(ctx: CanvasRenderingContext2D, text: string, y: number, color: string, scale = 1): void {
    const w = textWidth(text) * scale;
    ctx.save();
    ctx.translate(Math.round((W - w) / 2), y);
    ctx.scale(scale, scale);
    drawText(ctx, text, 0, 0, color, scale > 1 ? `${color}55` : undefined);
    ctx.restore();
  }

  private draw(ctx: CanvasRenderingContext2D, d: HudData): void {
    // bottom bar
    ctx.fillStyle = '#0a0414';
    ctx.fillRect(0, BAR_Y, W, H - BAR_Y);
    ctx.fillStyle = PAL.pink;
    ctx.fillRect(0, BAR_Y, W, 1);

    let x = this.bar(ctx, 6, 'FUEL', d.fuel, PAL.amber);
    x = this.bar(ctx, x + 10, 'CARGO', d.cargo, PAL.cyanPale);
    x = this.bar(ctx, x + 10, 'HULL', d.hull, PAL.pink);
    const cr = `CR ${d.credits}`;
    drawText(ctx, cr, 6, BAR_Y + 14, PAL.white);
    if (d.debt > 0) drawText(ctx, `DEBT ${d.debt}`, 6 + textWidth(cr) + 8, BAR_Y + 14, PAL.red);

    // strip map: dawn on the left, sunset on the right
    for (let i = 0; i < MAP_W; i++) {
      const f = i / MAP_W;
      ctx.fillStyle = f < 0.12 ? PAL.dawn : f > 0.9 ? '#ff8a3d' : '#3a2560';
      ctx.fillRect(MAP_X + i, BAR_Y + 9, 1, 2);
    }
    drawText(ctx, 'D', MAP_X - 6, BAR_Y + 7, PAL.dawn);
    drawText(ctx, 'S', MAP_X + MAP_W + 3, BAR_Y + 7, '#ff8a3d');
    ctx.fillStyle = PAL.amber;
    ctx.fillRect(MAP_X + d.mapCity, BAR_Y + 7, 1, 6);
    ctx.fillRect(MAP_X + d.mapCity - 1, BAR_Y + 9, 3, 2);
    ctx.fillStyle = PAL.cyan;
    ctx.fillRect(MAP_X + d.mapPlayer - 1, BAR_Y + 4, 3, 1);
    ctx.fillRect(MAP_X + d.mapPlayer, BAR_Y + 5, 1, 4);

    // dawn countdown
    if (d.dawnLabel) {
      const label = `DAWN IN ${d.dawnLabel}`;
      drawText(ctx, label, W - textWidth(label) - 6, 6, PAL.dawn, `${PAL.dawn}44`);
    }

    // warnings and prompts
    if (d.message) {
      this.centered(ctx, d.message, 108, PAL.white, 2);
      return;
    }
    if (d.scorching && d.blink) this.centered(ctx, 'SCORCHING!', 40, PAL.amber, 2);
    const prompts: string[] = [];
    if (d.broken) prompts.push('BROKEN DOWN');
    if (d.nearDock) prompts.push('E: DOCK');
    if (d.fuelHint) prompts.push('F: FUEL FROM CARGO');
    prompts.forEach((p, i) => this.centered(ctx, p, 226 - i * 9, d.broken && i === 0 ? PAL.red : PAL.amber));
  }
}
