import Phaser from 'phaser';
import type { EscortKind, Tier } from '../config/escorts';
import type { Escort } from '../sim/caravan';
import type { VehicleState } from '../sim/vehicle';
import { drawText, textWidth } from './font';
import { PinnedLru } from './lru';
import {
  makeCanvas,
  paintCity,
  paintEnemy,
  paintMine,
  paintEscort,
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

/** Texture keys for an escort's three tread phases. */
export function ensureEscortTextures(scene: Phaser.Scene, kind: EscortKind, tier: Tier): string[] {
  return PHASES.map((phase) => addOnce(scene, `escort-${kind}-${tier}-${phase}`, () => paintEscort(kind, tier, phase)));
}

/** Tread textures for anything in the caravan, old rigs included. */
export function ensureCaravanTextures(scene: Phaser.Scene, e: Escort): string[] {
  if (e.rig) return ensureRigTextures(scene, { ...e.rig, owned: [], hp: 0, fuel: 0, cargo: 0, repairKits: 0 });
  return ensureEscortTextures(scene, e.kind as EscortKind, e.tier);
}

/** Texture for an enemy combatant by role (pirate, robber or baron clan) and level. */
export function ensureEnemyTexture(scene: Phaser.Scene, role: string, level: number): string {
  return addOnce(scene, `enemy-${role}-${level}`, () => paintEnemy(role, level));
}

export function ensureMineTexture(scene: Phaser.Scene, open: boolean): string {
  return addOnce(scene, open ? 'mine-open' : 'mine-sealed', () => paintMine(open));
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
let chunkScene: Phaser.Scene | null = null;
const chunkCache = new PinnedLru(MAX_CHUNKS, (key) => chunkScene?.textures.remove(key));

/**
 * Ground chunk texture for chunk (cx, cy); the y index wraps with the planet. The texture
 * stays pinned (never evicted) until the caller hands it back with `releaseChunk`.
 */
export function ensureChunk(scene: Phaser.Scene, seed: number, cx: number, cy: number): string {
  chunkScene = scene;
  const key = `chunk-${seed}-${cx}-${wrapChunkY(cy)}`;
  if (chunkCache.has(key) && scene.textures.exists(key)) {
    chunkCache.pin(key);
    chunkCache.touch(key);
    return key;
  }
  addOnce(scene, key, () => paintGroundChunk(seed, cx, cy));
  chunkCache.add(key, true);
  return key;
}

/** The chunk is off screen; its texture may now be evicted when the cache is full. */
export function releaseChunk(key: string): void {
  chunkCache.unpin(key);
}
