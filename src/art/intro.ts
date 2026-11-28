/** Pictures for the opening slides, painted in code like the rest of the game. */
import type { SlideArt } from '../config/intro';
import { VIEW } from '../config/view';
import { hash2 } from '../sim/rng';
import { PAL } from './palette';
import { makeCanvas } from './painters';

export const PICTURE_W = VIEW.W;
export const PICTURE_H = 270;

type Ctx = CanvasRenderingContext2D;

function rect(g: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  g.fillStyle = color;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** A filled ellipse in hard pixel rows. */
function blob(g: Ctx, cx: number, cy: number, rx: number, ry: number, color: string): void {
  for (let y = -ry; y <= ry; y++) {
    const half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
    rect(g, cx - half, cy + y, half * 2, 1, color);
  }
}

function stars(g: Ctx, seed: number, height = PICTURE_H): void {
  rect(g, 0, 0, PICTURE_W, PICTURE_H, '#0a0416');
  for (let i = 0; i < 260; i++) {
    const x = hash2(seed, i, 0) * PICTURE_W;
    const y = hash2(seed, i, 1) * height;
    const bright = hash2(seed, i, 2);
    rect(g, x, y, bright > 0.95 ? 2 : 1, bright > 0.95 ? 2 : 1, bright > 0.7 ? PAL.cyanPale : '#6a5a9a');
  }
}

/** The family's hauler of the void, nose to the right. */
function cargoShip(g: Ctx, x: number, y: number, s: number): void {
  rect(g, x - 1, y - 1, 90 * s + 2, 24 * s + 2, PAL.ink);
  rect(g, x, y, 90 * s, 24 * s, PAL.cab.dark);
  rect(g, x, y, 90 * s, 3 * s, PAL.cab.light);
  for (let i = 0; i < 4; i++) {
    rect(g, x + (8 + i * 18) * s, y - 10 * s, 15 * s, 10 * s, PAL.tank.base);
    rect(g, x + (8 + i * 18) * s, y - 10 * s, 15 * s, 2 * s, PAL.tank.light);
  }
  rect(g, x + 90 * s, y + 4 * s, 18 * s, 16 * s, PAL.cab.base);
  rect(g, x + 100 * s, y + 7 * s, 6 * s, 5 * s, PAL.cyan);
  for (const dy of [5, 15]) {
    rect(g, x - 8 * s, y + dy * s, 8 * s, 5 * s, PAL.steel.base);
    rect(g, x - 20 * s, y + (dy + 1) * s, 12 * s, 3 * s, PAL.cyan);
    rect(g, x - 30 * s, y + (dy + 2) * s, 10 * s, s, '#2b7a98');
  }
  for (let i = 0; i < 10; i++) rect(g, x + (6 + i * 8) * s, y + 11 * s, 3 * s, 2 * s, PAL.amber);
}

/** Something much bigger, seen only as a shape with red lamps. */
function pirate(g: Ctx): void {
  const body = '#030106';
  const edge = '#4a1030';
  for (let i = 0; i < 110; i++) {
    const half = 300 - i * 2.4;
    rect(g, 380 - half * 0.8, i, half * 1.6, 1, body);
  }
  // hooked jaws hanging over the little ship
  for (const [x, dir] of [[210, 1], [520, -1]]) {
    for (let i = 0; i < 70; i++) rect(g, x + dir * i * 0.6, 100 + i, 26 - i / 3, 1, body);
    rect(g, x + dir * 42, 168, 6, 6, edge);
  }
  rect(g, 190, 108, 380, 1, edge);
  for (let i = 0; i < 9; i++) {
    const x = 240 + i * 34;
    rect(g, x, 92 + (i % 2) * 6, 5, 3, PAL.red);
    rect(g, x - 2, 91 + (i % 2) * 6, 9, 5, '#ff303033');
  }
}

function dunes(g: Ctx, horizon: number): void {
  rect(g, 0, horizon, PICTURE_W, PICTURE_H - horizon, PAL.duneBody);
  for (let layer = 0; layer < 3; layer++) {
    const base = horizon + 14 + layer * 34;
    for (let x = 0; x < PICTURE_W; x++) {
      const top = base + Math.sin(x / (46 + layer * 20) + layer * 2) * (8 + layer * 4);
      rect(g, x, top, 1, PICTURE_H - top, layer === 1 ? PAL.nightDark : PAL.duneBody);
      rect(g, x, top, 1, 1, PAL.duneMid);
    }
  }
}

/** A truck seen from the side, facing `dir`. */
function truck(g: Ctx, x: number, y: number, dir: 1 | -1): void {
  const at = (dx: number, w: number): number => (dir === 1 ? x + dx : x - dx - w);
  rect(g, at(0, 40), y, 40, 18, PAL.cab.dark);
  rect(g, at(40, 22), y - 6, 22, 24, PAL.cab.base);
  rect(g, at(48, 12), y - 2, 12, 8, PAL.cyan);
  rect(g, at(0, 40), y, 40, 3, PAL.cab.light);
  for (const dx of [4, 22, 46]) blob(g, at(dx, 12) + 6, y + 20, 7, 7, PAL.ink);
  rect(g, at(62, 3), y + 8, 3, 4, '#fff3b0');
}

function paint(art: SlideArt, g: Ctx): void {
  switch (art) {
    case 'ship':
      stars(g, 71);
      blob(g, 540, 60, 34, 34, '#5a1c94');
      blob(g, 532, 52, 26, 26, '#7c23a2');
      cargoShip(g, 230, 130, 2);
      break;
    case 'shadow':
      stars(g, 72);
      for (let i = 0; i < 6; i++) blob(g, 380, 70, 330 - i * 34, 170 - i * 18, '#8a104016');
      pirate(g);
      cargoShip(g, 340, 216, 1);
      break;
    case 'pod': {
      rect(g, 0, 0, PICTURE_W, PICTURE_H, '#140726');
      for (let x = 0; x < PICTURE_W; x += 48) rect(g, x, 0, 2, PICTURE_H, PAL.steel.dark);
      rect(g, 0, 36, PICTURE_W, 2, PAL.red);
      rect(g, 0, 232, PICTURE_W, 2, PAL.red);
      // the pod's round window, with two figures on the far side of it
      blob(g, 320, 134, 112, 112, PAL.steel.base);
      blob(g, 320, 134, 98, 98, PAL.ink);
      blob(g, 320, 134, 92, 92, '#4a1030');
      for (const [x, h] of [[290, 0], [356, 8]]) {
        blob(g, x, 112 + h, 17, 20, '#12040c');
        blob(g, x, 188 + h, 34, 50, '#12040c');
      }
      rect(g, 312, 150, 26, 8, '#12040c'); // arms about each other
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        rect(g, 320 + Math.cos(a) * 105 - 2, 134 + Math.sin(a) * 105 - 2, 4, 4, PAL.steel.light);
      }
      break;
    }
    case 'fall': {
      stars(g, 73);
      // the planet: its day side burning, its night side dark
      for (let y = -190; y <= 190; y++) {
        const half = Math.floor(Math.sqrt(190 * 190 - y * y));
        const x0 = 470 - half;
        rect(g, x0, 190 + y, half, 1, PAL.night);
        rect(g, 470, 190 + y, half, 1, y % 6 < 3 ? PAL.SUN[3] : PAL.SUN[4]);
        rect(g, 468, 190 + y, 4, 1, PAL.SUN[1]);
      }
      for (let i = 0; i < 140; i++) rect(g, 150 + i, 24 + i * 0.62, 3, 2, i < 70 ? '#5a1c94' : i < 115 ? PAL.SUN[5] : PAL.SUN[1]);
      blob(g, 294, 112, 9, 9, PAL.steel.light);
      blob(g, 292, 110, 4, 4, PAL.cyan);
      break;
    }
    case 'found':
      stars(g, 74, 150);
      dunes(g, 150);
      // the pod, half buried
      blob(g, 190, 214, 26, 20, PAL.steel.base);
      blob(g, 186, 208, 9, 8, PAL.cyan);
      rect(g, 150, 224, 90, 18, PAL.duneBody);
      for (let i = 0; i < 12; i++) rect(g, 186 - i * 3, 190 - i * 5, 4, 4, '#6a5a9a44');
      truck(g, 480, 200, -1);
      for (let i = 0; i < 170; i++) rect(g, 414 - i, 209 - i * 0.12, 1, 6 + i * 0.28, '#fff3b01c');
      break;
    case 'dawn':
      stars(g, 75, 110);
      // sunset ahead on the right, the dawn creeping up behind
      for (let i = 0; i < 12; i++) rect(g, 330, 98 + i * 5, 310, 4, PAL.SUN[i]);
      for (let i = 0; i < 8; i++) blob(g, 0, 156, 250 - i * 28, 60 - i * 7, '#bcd8ff1c');
      dunes(g, 156);
      truck(g, 330, 206, 1);
      for (let i = 0; i < 60; i += 4) rect(g, 322 - i * 2, 224, 4, 2, PAL.duneMid);
      break;
  }
}

export function paintSlide(art: SlideArt): HTMLCanvasElement {
  const [c, g] = makeCanvas(PICTURE_W, PICTURE_H);
  paint(art, g);
  return c;
}
