import Phaser from 'phaser';
import { drawText, textWidth } from '../art/font';
import { PAL } from '../art/palette';
import { NIGHT_LEN } from '../config/balance';
import { CITIES, CITY_BY_ID } from '../config/cities';
import { VIEW } from '../config/view';
import { getState } from '../game/session';
import { allWrecks } from '../sim/desert';
import { vacantSites } from '../sim/shelter';
import { STANDING_COLOR, mineSites, relation, statusOf } from '../sim/barons';
import { planetTimeLabel } from '../sim/clock';
import { mapWindow, placeLabel, toMap, type MapArea, type MapWindow, type MapZoom } from '../sim/map';
import { isPassable, terrainAt } from '../sim/terrain';
import { cityPositions, nearestCopy, secondsUntilDawn, sunsetY, zoneAt } from '../sim/world';

const W = VIEW.W;
const H = VIEW.H;
const AREA: MapArea = { x: 16, y: 26, w: 300, h: H - 44 };
const PANEL_X = AREA.x + AREA.w + 16;

/** A place shown on the map: a city now, night baron mines later. */
export interface MapMarker {
  name: string;
  x: number;
  y: number;
  color: string;
  shape: 'city' | 'mine';
}

/** Full-screen world map. M or Esc closes it; Z switches between local and whole-night zoom. */
export class MapScene extends Phaser.Scene {
  private zoom: MapZoom = 'local';
  private canvas!: Phaser.Textures.CanvasTexture;

  constructor() {
    super('map');
  }

  create(): void {
    if (this.textures.exists('map-ui')) this.textures.remove('map-ui');
    this.canvas = this.textures.createCanvas('map-ui', W, H) as Phaser.Textures.CanvasTexture;
    this.add.image(0, 0, 'map-ui').setOrigin(0, 0);

    const kb = this.input.keyboard;
    kb?.removeAllListeners();
    for (const key of ['M', 'ESC']) kb?.on(`keydown-${key}`, () => this.close());
    kb?.on('keydown-Z', () => {
      this.zoom = this.zoom === 'local' ? 'night' : 'local';
      this.render();
    });
    this.events.once('shutdown', () => kb?.removeAllListeners());
    this.render();
  }

  private close(): void {
    this.scene.stop();
    this.scene.get('drive').events.emit('map-done');
  }

  private markers(): MapMarker[] {
    const s = getState();
    const cities = cityPositions(s.t).map((c) => ({
      name: CITY_BY_ID[c.id].name,
      x: c.x,
      y: c.y,
      color: CITY_BY_ID[c.id].color,
      shape: 'city' as const,
    }));
    const mines = mineSites(s.seed)
      .filter((m) => s.known.includes(m.id))
      .map((m) => ({
        name: m.baron,
        x: m.x,
        y: m.y,
        color: STANDING_COLOR[statusOf(relation(s, m))],
        shape: 'mine' as const,
      }));
    const vacant = vacantSites(s.seed)
      .filter((v) => s.known.includes(v.id))
      .map((v) => ({ name: 'VACANT', x: v.x, y: v.y, color: '#c8b8e8', shape: 'mine' as const }));
    return [...cities, ...mines, ...vacant];
  }

  private render(): void {
    const s = getState();
    const ctx = this.canvas.getContext();
    ctx.fillStyle = '#07030c';
    ctx.fillRect(0, 0, W, H);
    const win = mapWindow(this.zoom, s.player, s.t, AREA);

    this.drawTerrain(ctx, win, s.seed, s.t);
    this.drawLines(ctx, win, s.t, s.player.y);

    // places
    for (const m of this.markers()) {
      const p = toMap(m.x, m.y, win);
      if (p.y < AREA.y - 2 || p.y > AREA.y + AREA.h + 2) continue;
      ctx.fillStyle = '#07030c';
      ctx.fillRect(Math.round(p.x) - 3, Math.round(p.y) - 3, 7, 7);
      ctx.fillStyle = m.color;
      if (m.shape === 'city') {
        ctx.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 1, 5, 3);
        ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 2, 3, 5);
      } else {
        ctx.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 2, 5, 5);
        ctx.fillStyle = '#07030c';
        ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 3);
      }
      drawText(ctx, m.name, Math.round(p.x) + 6, Math.round(p.y) - 2, m.color);
    }

    // wrecks you have spotted and not yet searched: small amber crosses, no names
    ctx.fillStyle = PAL.amber;
    for (const w of allWrecks(s.seed)) {
      if (!s.wrecks.found.includes(w.id)) continue;
      const p = toMap(w.x, nearestCopy(w.y, s.player.y), win);
      if (p.y < AREA.y + 2 || p.y > AREA.y + AREA.h - 2) continue;
      ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y), 3, 1);
      ctx.fillRect(Math.round(p.x), Math.round(p.y) - 1, 1, 3);
    }

    // you
    const me = toMap(s.player.x, s.player.y, win);
    ctx.fillStyle = PAL.cyan;
    ctx.fillRect(Math.round(me.x) - 1, Math.round(me.y) - 3, 3, 1);
    ctx.fillRect(Math.round(me.x) - 2, Math.round(me.y) - 2, 5, 1);
    ctx.fillRect(Math.round(me.x) - 1, Math.round(me.y) - 1, 3, 3);
    // label on the left so it never sits on top of a city name
    drawText(ctx, 'YOU', Math.round(me.x) - 6 - textWidth('YOU'), Math.round(me.y) - 2, PAL.cyan);

    this.drawPanel(ctx, s);
    this.canvas.refresh();
  }

  private drawTerrain(ctx: CanvasRenderingContext2D, win: MapWindow, seed: number, t: number): void {
    ctx.fillStyle = '#140726';
    ctx.fillRect(AREA.x, AREA.y, AREA.w, AREA.h);
    const cell = 2;
    const span = win.bottomY - win.topY;
    for (let my = 0; my < AREA.h; my += cell) {
      const wy = win.topY + ((my + cell / 2) / AREA.h) * span;
      const zone = zoneAt(wy, t);
      const day = zone === 'scorch' || zone === 'dawn';
      for (let mx = 0; mx < AREA.w; mx += cell) {
        const wx = ((mx + cell / 2) / AREA.w) * 4096;
        const kind = terrainAt(seed, wx, wy);
        let color = day ? '#3a1d10' : '#1b0a33';
        if (!isPassable(kind)) color = day ? '#7a3a20' : kind === 'canyon' ? '#05020a' : '#5a2a70';
        ctx.fillStyle = color;
        ctx.fillRect(AREA.x + mx, AREA.y + my, cell, cell);
      }
    }
    ctx.strokeStyle = PAL.pink;
    ctx.strokeRect(AREA.x - 0.5, AREA.y - 0.5, AREA.w + 1, AREA.h + 1);
  }

  private drawLines(ctx: CanvasRenderingContext2D, win: MapWindow, t: number, playerY: number): void {
    const line = (y: number, color: string, label: string): void => {
      const p = toMap(0, y, win);
      if (p.y < AREA.y || p.y > AREA.y + AREA.h) return;
      ctx.fillStyle = color;
      ctx.fillRect(AREA.x, Math.round(p.y), AREA.w, 2);
      drawText(ctx, label, AREA.x + AREA.w - textWidth(label) - 2, Math.round(p.y) - 7, color);
    };
    const sunset = nearestCopy(sunsetY(t), playerY);
    line(sunset, '#ff8a3d', 'SUNSET');
    line(nearestCopy(sunset + NIGHT_LEN, playerY), PAL.dawn, 'DAWN');
  }

  private drawPanel(ctx: CanvasRenderingContext2D, s: ReturnType<typeof getState>): void {
    const x = PANEL_X;
    const text = (str: string, y: number, color: string, scale = 1): void => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      drawText(ctx, str, 0, 0, color, scale > 1 ? `${color}55` : undefined);
      ctx.restore();
    };
    text('WORLD MAP', 8, PAL.pink, 2);
    text(`ZOOM: ${this.zoom === 'local' ? 'LOCAL' : 'WHOLE NIGHT'}   Z: CHANGE   M: CLOSE`, 30, '#8a7aaa');

    const dawn = secondsUntilDawn(s.player.y, s.t);
    text(`DAWN IN ${planetTimeLabel(dawn)}`, 46, PAL.dawn);

    text('PLACES', 66, PAL.amber);
    const places = this.markers()
      .map((m) => ({ m, d: nearestCopy(m.y, s.player.y) - s.player.y }))
      .sort((a, b) => Math.abs(a.d) - Math.abs(b.d));
    places.slice(0, 16).forEach(({ m }, i) => {
      const label = placeLabel(s.player.y, m.y);
      drawText(ctx, m.name, x, 80 + i * 10, m.color);
      drawText(ctx, label, W - textWidth(label) - 10, 80 + i * 10, '#c8b8e8');
    });

    const legendY = H - 40;
    drawText(ctx, 'CITY', x + 8, legendY, PAL.amber);
    drawText(ctx, 'MINE:', x + 48, legendY, '#c8b8e8');
    (['HOSTILE', 'WARY', 'NEUTRAL', 'FRIENDLY', 'ALLIED'] as const).forEach((st, i) =>
      drawText(ctx, st, x + 8 + i * 58, legendY - 12, STANDING_COLOR[st]),
    );
    drawText(ctx, 'IMPASSABLE', x + 100, legendY, '#b07ad0');
    drawText(ctx, '+ WRECK', x + 150, legendY, PAL.amber);
    drawText(ctx, `${CITIES.length} CITIES ROLL THROUGH THE NIGHT`, x, legendY + 14, '#6a5a8a');
  }
}
