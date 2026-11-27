/**
 * Desert art. Scenery is painted dim and flat with no lights, so it never looks like somewhere
 * to stop; wrecks are solid, outlined and warm, and the driving scene gives them a beacon.
 */
import type { SceneryKind } from '../config/desert';
import { hash2 } from '../sim/rng';
import { PAL } from './palette';
import { makeCanvas } from './painters';

export const SCENERY_SIZE = 48;
export const WRECK_SIZE = 44;

type Ctx = CanvasRenderingContext2D;
const dot = (g: Ctx, x: number, y: number, color: string, w = 1, h = 1): void => {
  g.fillStyle = color;
  g.fillRect(Math.round(x), Math.round(y), w, h);
};

export function paintScenery(kind: SceneryKind): HTMLCanvasElement {
  const [c, g] = makeCanvas(SCENERY_SIZE, SCENERY_SIZE);
  const mid = SCENERY_SIZE / 2;
  const bone = '#5c527a';
  const shade = '#160a2a';
  switch (kind) {
    case 'bones': // a spine with ribs
      dot(g, 8, mid, bone, 32, 2);
      for (let i = 0; i < 5; i++) {
        const reach = 12 - Math.abs(i - 2) * 3;
        const x = 12 + i * 6;
        dot(g, x, mid - reach, bone, 2, reach);
        dot(g, x, mid + 2, bone, 2, reach);
        dot(g, x + 2, mid - reach - 1, bone, 2, 1);
        dot(g, x + 2, mid + reach + 2, bone, 2, 1);
      }
      dot(g, 40, mid - 3, bone, 6, 8);
      dot(g, 43, mid - 1, shade, 2, 2);
      break;
    case 'glass': // fused sand with small crystals
      for (let i = 0; i < 130; i++) {
        const a = hash2(51, i, 0) * Math.PI * 2;
        const r = Math.sqrt(hash2(51, i, 1)) * 20;
        dot(g, mid + Math.cos(a) * r, mid + Math.sin(a) * r * 0.7, i % 5 === 0 ? '#3a6a8a' : '#2a3a66', 2, 1);
      }
      for (let i = 0; i < 6; i++) {
        const x = 10 + hash2(52, i, 0) * 28;
        const y = 14 + hash2(52, i, 1) * 20;
        dot(g, x, y - 4, '#4a8aa8', 1, 5);
        dot(g, x + 1, y - 2, '#2a4a70', 1, 3);
      }
      break;
    case 'pylon': // a fallen lattice mast
      dot(g, 4, mid - 4, bone, 40, 1);
      dot(g, 4, mid + 3, bone, 40, 1);
      for (let x = 4; x < 42; x += 8) {
        for (let i = 0; i < 8; i++) dot(g, x + i, mid - 4 + i, '#46406a');
        dot(g, x, mid - 4, bone, 1, 8);
      }
      dot(g, 42, mid - 8, bone, 2, 16);
      break;
    case 'spire': // a rock needle with its long shadow
      for (let i = 0; i < 18; i++) dot(g, mid + i, mid + 6 + i / 3, shade, 3, 2);
      for (let y = 0; y < 26; y++) {
        const half = 1 + Math.floor((y / 26) * 8);
        dot(g, mid - half, 8 + y, '#40285c', half, 1);
        dot(g, mid, 8 + y, '#2a1642', half, 1);
      }
      break;
    case 'crater':
      for (let a = 0; a < 90; a++) {
        const t = (a / 90) * Math.PI * 2;
        dot(g, mid + Math.cos(t) * 20, mid + Math.sin(t) * 14, Math.sin(t) < 0 ? shade : '#4a3070', 2, 2);
        dot(g, mid + Math.cos(t) * 12, mid + Math.sin(t) * 8, shade, 2, 1);
      }
      break;
    case 'tracks': // old tyre marks
      for (let x = 2; x < 46; x += 3) {
        const bend = Math.sin(x / 14) * 4;
        dot(g, x, mid - 7 + bend, shade, 2, 3);
        dot(g, x, mid + 5 + bend, shade, 2, 3);
      }
      break;
  }
  return c;
}

/** A broken-down hauler on its side: unmistakably something to look through. */
export function paintWreck(): HTMLCanvasElement {
  const [c, g] = makeCanvas(WRECK_SIZE, WRECK_SIZE);
  const box = (x: number, y: number, w: number, h: number, color: string): void => {
    dot(g, x - 1, y - 1, PAL.ink, w + 2, h + 2);
    dot(g, x, y, color, w, h);
    dot(g, x, y, '#ffffff33', w, 1);
  };
  dot(g, 4, 30, '#0c0618', 36, 8); // scorch and shadow
  box(8, 16, 22, 14, PAL.cab.dark);
  box(11, 19, 8, 8, '#4a2a2a');
  box(31, 14, 8, 11, PAL.cab.base);
  box(33, 16, 4, 3, PAL.ink); // broken window
  box(6, 11, 6, 5, PAL.rubber);
  box(22, 30, 7, 5, PAL.rubber);
  box(33, 31, 6, 4, PAL.rubber); // a wheel that came off
  for (let i = 0; i < 12; i++) {
    dot(g, 4 + hash2(61, i, 0) * 36, 6 + hash2(61, i, 1) * 34, i % 2 ? PAL.steel.light : PAL.amber, 2, 1);
  }
  return c;
}
