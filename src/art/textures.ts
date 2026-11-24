import Phaser from 'phaser';
import type { VehicleState } from '../sim/vehicle';
import { drawText, textWidth } from './font';
import {
  makeCanvas,
  paintCity,
  paintGroundChunk,
  paintPirate,
  paintRig,
  rigSignature,
  wrapChunkY,
  type TreadPhase,
} from './painters';

const PHASES: TreadPhase[] = [0, 1, 2];

function addOnce(scene: Phaser.Scene, key: string, make: () => HTMLCanvasElement): string {
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, make());
  return key;
}

/** Texture keys for the rig's three tread phases, made on first use. */
export function ensureRigTextures(scene: Phaser.Scene, v: VehicleState): string[] {
  const sig = rigSignature(v);
  return PHASES.map((phase) => addOnce(scene, `rig-${sig}-${phase}`, () => paintRig(v, phase)));
}

export function ensurePirateTexture(scene: Phaser.Scene, level: number): string {
  return addOnce(scene, `pirate-${level}`, () => paintPirate(level));
}

export function ensureCityTexture(scene: Phaser.Scene): string {
  return addOnce(scene, 'city', paintCity);
}

/** Pixel-font text as a texture, for labels and HUD text drawn as images. */
export function ensureLabel(scene: Phaser.Scene, text: string, color: string, glow?: string): string {
  return addOnce(scene, `label-${color}-${glow ?? ''}-${text}`, () => {
    const [c, g] = makeCanvas(textWidth(text) + 2, 7);
    drawText(g, text, 1, 1, color, glow);
    return c;
  });
}

const MAX_CHUNKS = 64;
const chunkLru = new Map<string, true>();

/** Ground chunk texture for chunk (cx, cy); the y index wraps with the planet. Old chunks are evicted. */
export function ensureChunk(scene: Phaser.Scene, seed: number, cx: number, cy: number): string {
  const key = `chunk-${seed}-${cx}-${wrapChunkY(cy)}`;
  if (chunkLru.has(key)) {
    chunkLru.delete(key);
  } else {
    addOnce(scene, key, () => paintGroundChunk(seed, cx, cy));
    while (chunkLru.size >= MAX_CHUNKS) {
      const oldest = chunkLru.keys().next().value as string;
      chunkLru.delete(oldest);
      scene.textures.remove(oldest);
    }
  }
  chunkLru.set(key, true);
  return key;
}
