import { BALANCE } from '../config/balance';
import { PARTS, type HullId } from '../config/catalog';
import { hash2 } from '../sim/rng';
import { isPassable, terrainAt, type Terrain } from '../sim/terrain';
import type { VehicleState } from '../sim/vehicle';
import { drawText } from './font';
import { PAL } from './palette';

type Ctx = CanvasRenderingContext2D;
type Ramp = { base: string; light: string; dark: string };

export type TreadPhase = 0 | 1 | 2;

const K = PAL.ink;

// ---------------------------------------------------------------- primitives

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d') as Ctx;
  g.imageSmoothingEnabled = false;
  return [c, g];
}

function rect(g: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  g.fillStyle = color;
  g.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
}

function px(g: Ctx, x: number, y: number, color: string): void {
  g.fillStyle = color;
  g.fillRect(Math.floor(x), Math.floor(y), 1, 1);
}

/** Solid slab with a dark outline, a lit top-left edge and a shaded bottom-right edge. */
export function bevel(g: Ctx, x: number, y: number, w: number, h: number, ramp: Ramp): void {
  rect(g, x - 1, y - 1, w + 2, h + 2, K);
  rect(g, x, y, w, h, ramp.base);
  rect(g, x, y, w, 1, ramp.light);
  rect(g, x, y, 1, h, ramp.light);
  rect(g, x, y + h - 1, w, 1, ramp.dark);
  rect(g, x + w - 1, y + 1, 1, h - 1, ramp.dark);
}

const mod3 = (n: number): number => ((n % 3) + 3) % 3;

export function wheel(g: Ctx, x: number, y: number, w: number, h: number, phase: number): void {
  rect(g, x - 1, y - 1, w + 2, h + 2, K);
  rect(g, x, y, w, h, '#16121e');
  for (let yy = 0; yy < h; yy++) if (mod3(yy + phase) === 0) rect(g, x, y + yy, w, 1, '#4a4460');
  rect(g, x + (w >> 1), y + 1, 1, h - 2, '#8a84a8');
}

export function tread(g: Ctx, x: number, y: number, w: number, h: number, phase: number): void {
  rect(g, x - 1, y - 1, w + 2, h + 2, K);
  rect(g, x, y, w, h, PAL.rubber);
  for (let yy = 0; yy < h; yy++) {
    const m = mod3(yy + phase);
    if (m !== 2) rect(g, x + 1, y + yy, w - 2, 1, m ? PAL.rubberLight : PAL.rubberMid);
  }
  rect(g, x, y, 1, h, '#2a2440');
  rect(g, x + w - 1, y, 1, h, '#0e0a16');
}

export function circle(g: Ctx, cx: number, cy: number, r: number, color: string): void {
  g.fillStyle = color;
  for (let j = -r; j <= r; j++) {
    const hw = Math.floor(Math.sqrt(r * r - j * j));
    g.fillRect(cx - hw, cy + j, hw * 2 + 1, 1);
  }
}

// ----------------------------------------------------------------- player rig

interface RigPlan {
  hull: HullId;
  /** Tier of each fitted weapon, rearmost mount first. */
  weapons: number[];
  collectors: number;
  armorTier: number;
}

function planOf(v: VehicleState): RigPlan {
  const tiers = (slot: 'weapon' | 'collector' | 'armor'): number[] =>
    v.fitted[slot].flatMap((id) => (id && PARTS[id] ? [PARTS[id].tier] : []));
  return {
    hull: v.hullId,
    weapons: tiers('weapon'),
    collectors: Math.max(1, tiers('collector').length),
    armorTier: Math.max(1, ...tiers('armor')),
  };
}

export interface RigLayout {
  w: number;
  h: number;
  /** The cab's centre: the point the rig turns around. */
  pivotX: number;
  pivotY: number;
  /** Where the collector intake sits, measured from the top of the sprite. */
  rearY: number;
}

/** Sprite geometry for each hull; keep in step with the sizes used by paintRig. */
export function rigLayout(hull: HullId): RigLayout {
  if (hull === 'scout') return { w: 30, h: 30, pivotX: 15, pivotY: 13, rearY: 24 };
  if (hull === 'hauler') return { w: 48, h: 62, pivotX: 24, pivotY: 15, rearY: 55 };
  return { w: 58, h: 90, pivotX: 29, pivotY: 15, rearY: 82 };
}

/** Everything about a vehicle that changes how its sprite looks. */
export function rigSignature(v: VehicleState): string {
  const p = planOf(v);
  return `${p.hull}-w${p.weapons.join('')}-c${p.collectors}-a${p.armorTier}`;
}

function drawCab(g: Ctx, bx: number, by: number, bodyW: number, bodyH: number, armorTier: number, phase: number): void {
  const big = bodyH >= 18;
  const wW = big ? 4 : 3;
  const wH = big ? 7 : 6;
  for (const wx of [bx - wW - 1, bx + bodyW + 1]) {
    wheel(g, wx, by + 2, wW, wH, phase);
    wheel(g, wx, by + bodyH - wH, wW, wH, phase);
  }
  bevel(g, bx, by, bodyW, bodyH, PAL.cab);
  for (let y = 5; y < bodyH - 1; y++) {
    const c = (y >> 1) % 2 ? PAL.amber : K;
    px(g, bx, by + y, c);
    px(g, bx + bodyW - 1, by + y, c);
  }
  if (armorTier >= 2) rect(g, bx + 1, by + 5, 1, bodyH - 8, PAL.steel.light);
  if (armorTier >= 3) rect(g, bx + bodyW - 2, by + 5, 1, bodyH - 8, PAL.steel.light);
  bevel(g, bx - 1, by - 2, bodyW + 2, 2, PAL.steel);
  rect(g, bx, by - 2, 2, 1, '#fff3b0');
  rect(g, bx + bodyW - 2, by - 2, 2, 1, '#fff3b0');
  for (let x = bx + 3; x < bx + bodyW - 3; x += 2) rect(g, x, by + 1, 1, 3, PAL.cab.dark);
  rect(g, bx + 1, by + 4, bodyW - 2, 6, K);
  rect(g, bx + 2, by + 5, bodyW - 4, 4, PAL.glass);
  rect(g, bx + 2, by + 5, bodyW - 4, 1, PAL.cyan);
  px(g, bx + 3, by + 6, '#c8fdff');
  px(g, bx + 4, by + 6, '#c8fdff');
  px(g, bx + 3, by + 7, '#c8fdff');
  const roofH = big ? 6 : 5;
  const roofY = by + bodyH - roofH - 1;
  bevel(g, bx + 2, roofY, bodyW - 4, roofH, PAL.steel);
  for (const [rx, ry] of [
    [bx + 3, roofY + 1],
    [bx + bodyW - 4, roofY + 1],
    [bx + 3, roofY + roofH - 2],
    [bx + bodyW - 4, roofY + roofH - 2],
  ]) {
    px(g, rx, ry, '#8a84a8');
  }
  rect(g, bx + 5, roofY + 2, bodyW - 10, 1, PAL.amber);
}

function drawUnit(g: Ctx, cx: number, top: number, bodyW: number, bodyH: number, treadW: number, phase: number, armorTier: number): void {
  const bx = cx - (bodyW >> 1);
  tread(g, bx - treadW - 1, top, treadW, bodyH, phase);
  tread(g, bx + bodyW + 1, top, treadW, bodyH, phase);
  bevel(g, bx, top, bodyW, bodyH, PAL.unit);
  rect(g, bx, top + 4, 1, bodyH - 7, PAL.unit.dark);
  rect(g, bx + bodyW - 1, top + 4, 1, bodyH - 7, PAL.unit.dark);
  for (let y = top + 4; y < top + bodyH - 7; y += 4) {
    px(g, bx + 1, y, '#ffb07a');
    px(g, bx + bodyW - 2, y, '#ffb07a');
  }
  if (armorTier >= 3) {
    rect(g, bx + 2, top + 4, 1, bodyH - 8, PAL.steel.light);
    rect(g, bx + bodyW - 3, top + 4, 1, bodyH - 8, PAL.steel.light);
  }
  // ribbed Particle X tank with a gauge window
  const tw = bodyW - 6;
  const th = bodyH - 11;
  const tx = bx + 3;
  const ty = top + 7;
  bevel(g, tx, ty, tw, th, PAL.tank);
  for (let y = ty + 2; y < ty + th - 1; y += 3) rect(g, tx + 1, y, tw - 2, 1, '#2c2840');
  const gx = tx + (tw >> 1) - 2;
  rect(g, gx, ty + 1, 4, th - 2, '#0c2a3a');
  const fillTop = ty + 1 + Math.floor((th - 2) * 0.4);
  rect(g, gx, fillTop, 4, ty + th - 1 - fillTop, PAL.cyan);
  rect(g, gx, fillTop, 4, 1, '#b8fbff');
  // rear neon strip and taillights
  rect(g, bx + 1, top + bodyH - 2, bodyW - 2, 1, PAL.pink);
  rect(g, bx, top + bodyH, 3, 1, '#ff2050');
  rect(g, bx + bodyW - 3, top + bodyH, 3, 1, '#ff2050');
}

function drawCoupler(g: Ctx, cx: number, y: number): void {
  bevel(g, cx - 3, y, 6, 4, PAL.steel);
}

function drawIntake(g: Ctx, cx: number, y: number, width: number): void {
  rect(g, cx - (width >> 1) - 1, y - 1, width + 2, 4, K);
  rect(g, cx - (width >> 1), y, width, 1, PAL.cyanDeep);
  rect(g, cx - (width >> 1), y + 1, width, 1, PAL.cyanPale);
  g.globalAlpha = 0.3;
  rect(g, cx - (width >> 1) - 2, y - 2, width + 4, 5, PAL.cyanPale);
  g.globalAlpha = 1;
}

function drawTurretBase(g: Ctx, cx: number, ty: number, tier: number | null): void {
  if (tier === null) {
    bevel(g, cx - 3, ty + 1, 6, 3, PAL.steel);
    return;
  }
  bevel(g, cx - 4, ty, 8, 5, PAL.steel);
  px(g, cx - 2, ty + 2, tier >= 3 ? PAL.cyan : tier >= 2 ? PAL.amber : '#8a84a8');
  px(g, cx + 1, ty + 2, tier >= 3 ? PAL.cyan : tier >= 2 ? PAL.amber : '#8a84a8');
}

function drawBarrel(g: Ctx, cx: number, ty: number, tier: number): void {
  const len = 12 + 3 * tier;
  const top = ty + 2 - len;
  rect(g, cx - 1, top, 2, len, K);
  rect(g, cx - 1, top + 1, 1, len - 2, PAL.steel.light);
  rect(g, cx, top + 1, 1, len - 2, '#2c2840');
  if (tier >= 2) rect(g, cx - 1, top, 2, 2, tier >= 3 ? PAL.cyan : PAL.amber);
}

/** The player's rig, facing up (front at the top), with its treads at `phase`. */
export function paintRig(v: VehicleState, phase: TreadPhase = 0): HTMLCanvasElement {
  const plan = planOf(v);
  const mounts: { cx: number; ty: number }[] = [];

  if (plan.hull === 'scout') {
    const [c, g] = makeCanvas(30, 30);
    const cx = 15;
    const by = 6;
    drawIntake(g, cx, by + 15 + 2, 20);
    drawCab(g, cx - 6, by, 12, 15, plan.armorTier, phase);
    mounts.push({ cx, ty: by + 8 });
    finishWeapons(g, plan, mounts);
    return c;
  }

  if (plan.hull === 'hauler') {
    const [c, g] = makeCanvas(48, 62);
    const cx = 24;
    const by = 6;
    const unitTop = by + 18 + 4;
    drawIntake(g, cx, unitTop + 25 + 1, 36 + 6 * (plan.collectors - 1));
    drawUnit(g, cx, unitTop, 20, 25, 5, phase, plan.armorTier);
    drawCoupler(g, cx, by + 18);
    drawCab(g, cx - 8, by, 16, 18, plan.armorTier, phase);
    mounts.push({ cx, ty: unitTop + 1 }, { cx, ty: by + 11 });
    finishWeapons(g, plan, mounts);
    return c;
  }

  const [c, g] = makeCanvas(58, 90);
  const cx = 29;
  const by = 6;
  const u1 = by + 18 + 4;
  const u2 = u1 + 22 + 4;
  drawIntake(g, cx, u2 + 26 + 1, 40 + 6 * (plan.collectors - 1));
  drawUnit(g, cx, u2, 24, 26, 6, phase, plan.armorTier);
  drawCoupler(g, cx, u1 + 22);
  drawUnit(g, cx, u1, 20, 22, 5, phase, plan.armorTier);
  drawCoupler(g, cx, by + 18);
  drawCab(g, cx - 8, by, 16, 18, plan.armorTier, phase);
  mounts.push({ cx, ty: u2 + 1 }, { cx, ty: u1 + 1 }, { cx, ty: by + 11 });
  finishWeapons(g, plan, mounts);
  return c;
}

/** Turrets are drawn after every body so barrels pass over the cab roof. */
function finishWeapons(g: Ctx, plan: RigPlan, mounts: { cx: number; ty: number }[]): void {
  mounts.forEach((m, i) => drawTurretBase(g, m.cx, m.ty, plan.weapons[i] ?? null));
  mounts.forEach((m, i) => {
    const tier = plan.weapons[i];
    if (tier) drawBarrel(g, m.cx, m.ty, tier);
  });
}

// ------------------------------------------------------------------- pirates

/** A flying gunship, nose pointing down (toward the player's rig coming up the screen). */
export function paintPirate(level: number): HTMLCanvasElement {
  const [c, g] = makeCanvas(26, 22);
  const tier = level < 4 ? 0 : level < 8 ? 1 : 2;
  const body: Ramp = tier === 2 ? PAL.gunmetal : PAL.olive;
  const wing: Ramp = tier === 2 ? PAL.gunmetal : PAL.oliveWing;
  const trim = tier === 2 ? '#ff3a3a' : PAL.pirate;
  const o = 1;

  bevel(g, o, o + 6, 7, 6, wing);
  bevel(g, o + 17, o + 6, 7, 6, wing);
  if (level >= 8) {
    rect(g, o + 1, o + 8, 5, 1, trim);
    rect(g, o + 18, o + 8, 5, 1, trim);
  }
  px(g, o, o + 11, PAL.pirate);
  px(g, o + 23, o + 11, PAL.pirate);
  bevel(g, o + 5, o, 3, 12, PAL.pod);
  bevel(g, o + 16, o, 3, 12, PAL.pod);
  bevel(g, o + 8, o + 1, 8, 15, body);
  rect(g, o + 8, o + 5, 8, 1, trim);
  for (let i = 0; i < 3; i++) rect(g, o + 9 + i * 2, o + 2, 1, 2, body.dark);
  if (level >= 5) bevel(g, o + 10, o + 6, 4, 3, PAL.pod);
  rect(g, o + 9, o + 9, 6, 4, K);
  rect(g, o + 10, o + 10, 4, 2, PAL.red);
  px(g, o + 10, o + 10, '#ffb0b0');
  rect(g, o + 9, o + 16, 2, 4, K);
  rect(g, o + 13, o + 16, 2, 4, K);
  px(g, o + 9, o + 16, '#5a5a6a');
  px(g, o + 13, o + 16, '#5a5a6a');
  return c;
}

// ---------------------------------------------------------------------- city

export const CITY_W = 140;
export const CITY_H = 260;
/** The dock is the right edge of the city sprite, at mid height. */
export const CITY_DOCK_Y = 130;

/** The moving city: a huge platform on giant treads with domes, tanks, masts and a lit dock apron. */
export function paintCity(): HTMLCanvasElement {
  const [c, g] = makeCanvas(CITY_W, CITY_H);
  const seed = 31337;

  // giant treads with sprocket wheels
  for (const x of [1, 106]) {
    tread(g, x, 2, 12, 256, 0);
    for (let y = 14; y < 256; y += 40) {
      circle(g, x + 6, y, 5, K);
      circle(g, x + 6, y, 4, '#6a6488');
      circle(g, x + 6, y, 1, PAL.rubber);
    }
  }

  // deck plate and seams
  bevel(g, 14, 6, 92, 248, PAL.city);
  for (let y = 22; y < 250; y += 16) rect(g, 15, y, 90, 1, '#1e1630');
  for (let x = 38; x < 104; x += 24) rect(g, x, 7, 1, 246, '#1e1630');

  // lit windows
  for (let y = 10; y < 252; y += 4) {
    for (let x = 16; x < 104; x += 3) {
      const h = hash2(seed, x, y);
      if (h < 0.1) px(g, x, y, h < 0.04 ? PAL.pink : h < 0.07 ? PAL.cyan : PAL.amber);
    }
  }

  // ribbed tanks with neon stripes
  const tanks: [number, number, number, number, string][] = [
    [20, 20, 22, 36, PAL.pink],
    [66, 62, 34, 28, PAL.cyan],
    [22, 152, 26, 40, PAL.cyan],
    [72, 204, 28, 40, PAL.pink],
  ];
  for (const [x, y, w, h, neon] of tanks) {
    bevel(g, x, y, w, h, PAL.cityTank);
    for (let yy = y + 2; yy < y + h - 1; yy += 3) rect(g, x + 1, yy, w - 2, 1, '#251c3a');
    rect(g, x + (w >> 1) - 1, y + 1, 2, h - 2, neon);
    g.globalAlpha = 0.35;
    rect(g, x + (w >> 1) - 2, y + 1, 4, h - 2, neon);
    g.globalAlpha = 1;
  }

  // glass domes
  const domes: [number, number, number, string, string][] = [
    [54, 38, 11, '#5a2a7a', '#b04ec0'],
    [40, 114, 9, '#1e4a6a', '#3ea8d0'],
    [84, 150, 12, '#5a2a7a', '#b04ec0'],
    [56, 232, 8, '#1e4a6a', '#3ea8d0'],
  ];
  for (const [x, y, r, tint, hi] of domes) {
    circle(g, x, y, r + 1, K);
    circle(g, x, y, r, '#1a1030');
    circle(g, x, y, r - 1, tint);
    circle(g, x - 2, y - 2, Math.max(1, r - 4), hi);
    px(g, x - r + 3, y - r + 3, PAL.white);
    px(g, x - r + 4, y - r + 3, PAL.white);
    for (let a = 0; a < 6; a++) {
      const ang = (a / 6) * Math.PI * 2;
      px(g, x + Math.cos(ang) * (r - 2), y + Math.sin(ang) * (r - 2), PAL.amber);
    }
  }

  // lattice masts with red beacons
  for (const [x, y, s] of [
    [72, 98, 16],
    [28, 198, 12],
  ] as const) {
    rect(g, x, y, s, s, K);
    for (let i = 0; i < s; i++) {
      px(g, x + i, y + i, '#8a84a8');
      px(g, x + s - 1 - i, y + i, '#8a84a8');
    }
    rect(g, x, y, s, 1, '#8a84a8');
    rect(g, x, y + s - 1, s, 1, '#8a84a8');
    rect(g, x, y, 1, s, '#8a84a8');
    rect(g, x + s - 1, y, 1, s, '#8a84a8');
    rect(g, x + (s >> 1) - 1, y + (s >> 1) - 1, 2, 2, PAL.red);
  }

  // neon edges
  rect(g, 14, 6, 92, 1, PAL.pink);
  rect(g, 14, 253, 92, 1, PAL.cyan);

  // dock apron on the right, with a lit edge and hazard stripes
  bevel(g, 120, 94, 20, 72, { base: '#2e2548', light: '#5a4a82', dark: '#16102a' });
  for (let y = 96; y < 164; y++) {
    const col = (y >> 2) % 2 ? PAL.amber : K;
    px(g, 121, y, col);
  }
  rect(g, 138, 94, 2, 72, PAL.amber);
  g.globalAlpha = 0.3;
  rect(g, 136, 94, 4, 72, PAL.amber);
  g.globalAlpha = 1;
  drawText(g, 'DOCK', 123, 126, PAL.amber, '#ffd23f55');
  drawText(g, '<', 123, 114, PAL.amber);
  drawText(g, '<', 123, 138, PAL.amber);
  return c;
}

// -------------------------------------------------------------------- ground

export const CHUNK = 256;
export const CHUNKS_Y = BALANCE.WORLD_LEN / CHUNK;

export const wrapChunkY = (cy: number): number => ((cy % CHUNKS_Y) + CHUNKS_Y) % CHUNKS_Y;

const rgbCache = new Map<string, [number, number, number]>();
function rgb(hex: string): [number, number, number] {
  let v = rgbCache.get(hex);
  if (!v) {
    const n = parseInt(hex.slice(1), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(hex, v);
  }
  return v;
}

/**
 * A 256x256 piece of desert. World coordinates drive every pixel, so neighbouring
 * chunks (including across the wrap seam) line up with no visible joins.
 */
export function paintGroundChunk(seed: number, chunkX: number, chunkY: number): HTMLCanvasElement {
  const [c, g] = makeCanvas(CHUNK, CHUNK);
  const img = g.createImageData(CHUNK, CHUNK);
  const d = img.data;
  const x0 = chunkX * CHUNK;
  const y0 = wrapChunkY(chunkY) * CHUNK;
  const B = 4;
  const n = CHUNK / B;

  // terrain per 4x4 block, with one extra row above and below for edges and shadows
  const kinds: Terrain[][] = [];
  for (let by = -1; by <= n; by++) {
    const row: Terrain[] = [];
    for (let bx = 0; bx < n; bx++) row.push(terrainAt(seed, x0 + bx * B + 2, y0 + by * B + 2));
    kinds[by + 1] = row;
  }

  const grid = rgb(PAL.cyan);
  for (let py = 0; py < CHUNK; py++) {
    const by = py >> 2;
    const wy = y0 + py;
    const rowInBlock = py & 3;
    for (let pxl = 0; pxl < CHUNK; pxl++) {
      const bx = pxl >> 2;
      const wx = x0 + pxl;
      const kind = kinds[by + 1][bx];
      const above = kinds[by][bx];
      const below = kinds[by + 2][bx];
      const h = hash2(seed + 7, wx, wy);
      const topEdge = above !== kind;
      const bottomEdge = below !== kind;
      let color: string;
      switch (kind) {
        case 'dunes':
          if (topEdge && rowInBlock === 0) color = PAL.duneRim;
          else if (topEdge && rowInBlock === 1) color = PAL.duneMid;
          else color = wy % 8 < 2 ? PAL.duneBody : h < 0.05 ? '#1d0a3a' : '#27104a';
          break;
        case 'rock':
          if (topEdge && rowInBlock === 0) color = '#6a5a8a';
          else color = h < 0.18 ? '#4a3a6a' : h > 0.9 ? '#150d26' : '#2c1f45';
          break;
        case 'mountain':
          // massif: lit ridge facing the sunset, dark foot on the far side
          if (topEdge && rowInBlock === 0) color = '#ff6ab8';
          else if (topEdge && rowInBlock === 1) color = '#9a3a9a';
          else if (bottomEdge && rowInBlock >= 2) color = '#0e0618';
          else color = (wx + wy) % 9 === 0 ? '#4a2860' : h < 0.15 ? '#3d1f55' : h > 0.92 ? '#1a0b28' : '#2e1640';
          break;
        case 'canyon':
          // a rift: lit lip on the near side, near-black depths with a faint cyan glow
          if (topEdge && rowInBlock === 0) color = '#c0209f';
          else if (topEdge && rowInBlock === 1) color = '#3a1050';
          else if (bottomEdge && rowInBlock === 3) color = '#2a1040';
          else color = h < 0.04 ? '#1c6a7a' : h < 0.12 ? '#0b2a36' : '#05020a';
          break;
        case 'mesa':
          if (topEdge && rowInBlock <= 1) color = '#ff8ad8';
          else color = h < 0.2 ? '#5e3a70' : '#4a2a5a';
          break;
        case 'cliff':
          if (topEdge && rowInBlock === 0) color = '#c0209f';
          else color = wy % 6 === 0 ? '#1a0f2e' : h < 0.06 ? '#241540' : '#0c0618';
          break;
        default:
          color = h < 0.035 ? PAL.nightLight : h > 0.993 ? PAL.nightDark : PAL.night;
      }
      let [r, gg, b] = rgb(color);
      const passable = isPassable(kind);
      // obstacles cast a short shadow away from the sunset
      if (passable && !isPassable(above) && rowInBlock <= 1) {
        r *= 0.55;
        gg *= 0.55;
        b *= 0.55;
      }
      if (passable && (wx % 20 === 0 || wy % 20 === 0)) {
        r = r * 0.8 + grid[0] * 0.2;
        gg = gg * 0.8 + grid[1] * 0.2;
        b = b * 0.8 + grid[2] * 0.2;
      }
      const i = (py * CHUNK + pxl) * 4;
      d[i] = r;
      d[i + 1] = gg;
      d[i + 2] = b;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}
