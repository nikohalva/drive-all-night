import Phaser from 'phaser';
import { drawText, textWidth } from '../art/font';
import { PAL } from '../art/palette';
import { NIGHT_LEN } from '../config/balance';
import { VERSION_LABEL } from '../config/version';
import { VIEW } from '../config/view';
import { getState, ui } from '../game/session';
import { planetTimeLabel } from '../sim/clock';
import { caravanStats } from '../sim/caravan';
import { isFit } from '../sim/crew';
import { vehicleStats } from '../sim/vehicle';
import { CITIES } from '../config/cities';
import { behindSunset, cityPositions, secondsUntilDawn, zoneAt } from '../sim/world';

const W = VIEW.W;
const H = VIEW.H;
const BAR_Y = H - 20;
const SEGMENTS = 8;
const MAP_X = W - 140;
const MAP_W = 130;

interface HudData {
  fuel: number;
  cargo: number;
  hull: number;
  credits: number;
  escorts: number;
  wrecked: number;
  idle: number;
  hurt: number;
  down: number;
  debt: number;
  mapPlayer: number;
  mapCities: number[];
  dockName: string | null;
  dawnLabel: string | null;
  scorching: boolean;
  broken: boolean;
  nearDock: boolean;
  fuelHint: boolean;
  message: string | null;
  blink: boolean;
  nearMine: string | null;
  mineSealed: boolean;
  nearWreck: boolean;
  toast: string | null;
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
    const caravan = caravanStats(s);
    const y = s.player.y;
    const zone = zoneAt(y, s.t);
    const b = behindSunset(y, s.t);
    const mapPlayer = b < NIGHT_LEN ? 1 - b / NIGHT_LEN : zone === 'scorch' ? 1 : 0;
    const mapCities = cityPositions(s.t).map((c) => 1 - behindSunset(c.y, s.t) / NIGHT_LEN);
    const dawnIn = secondsUntilDawn(y, s.t);
    return {
      fuel: Math.ceil(clamp01(s.vehicle.fuel / caravan.tankCap) * SEGMENTS),
      cargo: Math.ceil(clamp01(s.vehicle.cargo / caravan.cargoCap) * SEGMENTS),
      escorts: caravan.escorts,
      wrecked: caravan.wrecked,
      idle: caravan.idle,
      hurt: s.crew.filter((m) => m.health < 100 && isFit(m)).length,
      down: s.crew.filter((m) => !isFit(m)).length,
      hull: Math.ceil(clamp01(s.vehicle.hp / stats.maxHp) * SEGMENTS),
      credits: Math.floor(s.credits),
      debt: Math.floor(s.debt),
      mapPlayer: Math.round(clamp01(mapPlayer) * (MAP_W - 1)),
      mapCities: mapCities.map((f) => Math.round(clamp01(f) * (MAP_W - 1))),
      dockName: ui.dockName,
      dawnLabel: Number.isFinite(dawnIn) ? planetTimeLabel(dawnIn) : null,
      scorching: ui.scorching,
      broken: ui.broken,
      nearDock: ui.nearDock,
      fuelHint: ui.fuelHint,
      message: ui.message,
      blink: Math.floor(time / 300) % 2 === 0,
      nearMine: ui.nearMine,
      mineSealed: ui.mineSealed,
      nearWreck: ui.nearWreck,
      toast: ui.toast && time < ui.toastUntil ? ui.toast : null,
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
    let infoX = 6 + textWidth(cr) + 8;
    if (d.debt > 0) {
      drawText(ctx, `DEBT ${d.debt}`, infoX, BAR_Y + 14, PAL.red);
      infoX += textWidth(`DEBT ${d.debt}`) + 8;
    }
    const info = (text: string, color: string): void => {
      drawText(ctx, text, infoX, BAR_Y + 14, color);
      infoX += textWidth(text) + 8;
    };
    if (d.escorts > 0) info(`CARAVAN ${d.escorts}`, PAL.cyanPale);
    if (d.wrecked > 0) info(`${d.wrecked} WRECKED`, PAL.red);
    if (d.idle > 0) info(`${d.idle} NO CREW`, PAL.red);
    if (d.down > 0) info(`${d.down} DOWN`, PAL.red);
    if (d.hurt > 0) info(`${d.hurt} HURT`, PAL.amber);
    info('C CREW', '#7a6a9a');

    // strip map: dawn on the left, sunset on the right
    for (let i = 0; i < MAP_W; i++) {
      const f = i / MAP_W;
      ctx.fillStyle = f < 0.12 ? PAL.dawn : f > 0.9 ? '#ff8a3d' : '#3a2560';
      ctx.fillRect(MAP_X + i, BAR_Y + 9, 1, 2);
    }
    drawText(ctx, 'D', MAP_X - 6, BAR_Y + 7, PAL.dawn);
    drawText(ctx, 'S', MAP_X + MAP_W + 3, BAR_Y + 7, '#ff8a3d');
    d.mapCities.forEach((m, i) => {
      ctx.fillStyle = CITIES[i].color;
      ctx.fillRect(MAP_X + m, BAR_Y + 7, 1, 6);
      ctx.fillRect(MAP_X + m - 1, BAR_Y + 9, 3, 2);
    });
    drawText(ctx, 'M MAP', MAP_X - 34, BAR_Y + 14, '#7a6a9a');
    ctx.fillStyle = PAL.cyan;
    ctx.fillRect(MAP_X + d.mapPlayer - 1, BAR_Y + 4, 3, 1);
    ctx.fillRect(MAP_X + d.mapPlayer, BAR_Y + 5, 1, 4);

    drawText(ctx, VERSION_LABEL, W - textWidth(VERSION_LABEL) - 6, 6, '#8a7aaa');

    // dawn countdown
    if (d.dawnLabel) {
      const label = `DAWN IN ${d.dawnLabel}`;
      drawText(ctx, label, W - textWidth(label) - 6, 15, PAL.dawn, `${PAL.dawn}44`);
    }

    // warnings and prompts
    if (d.message) {
      this.centered(ctx, d.message, Math.round(H * 0.4), PAL.white, 2);
      return;
    }
    if (d.toast) this.centered(ctx, d.toast, 22, '#c050ff');
    if (d.scorching && d.blink) this.centered(ctx, 'SCORCHING!', 40, PAL.amber, 2);
    const prompts: string[] = [];
    if (d.broken) prompts.push('BROKEN DOWN  H: CALL FOR HELP');
    if (d.nearDock) prompts.push(`E: DOCK AT ${d.dockName ?? 'CITY'}`);
    if (d.nearMine) prompts.push(`E: ENTER THE MINE OF ${d.nearMine}`);
    if (d.mineSealed) prompts.push('THE MINE IS SEALED UNTIL NIGHT');
    if (d.nearWreck) prompts.push('E: SEARCH THE WRECK');
    if (d.fuelHint) prompts.push('F: FUEL FROM CARGO');
    prompts.forEach((p, i) => this.centered(ctx, p, H - 44 - i * 9, d.broken && i === 0 ? PAL.red : PAL.amber));
  }
}
