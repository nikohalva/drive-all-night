import Phaser from 'phaser';
import { CHUNK } from '../../art/painters';
import { ensureChunk } from '../../art/textures';

const KEEP_RADIUS = 3;

/**
 * Keeps a window of ground chunks around the camera. The inner 3x3 is built at once;
 * the ring beyond it is prefetched one chunk per frame so crossing a chunk never hitches.
 */
export class GroundLayer {
  private readonly images = new Map<string, Phaser.GameObjects.Image>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly seed: number,
  ) {}

  private ensure(cx: number, cy: number): void {
    const key = `${cx},${cy}`;
    if (this.images.has(key)) return;
    const tex = ensureChunk(this.scene, this.seed, cx, cy);
    this.images.set(key, this.scene.add.image(cx * CHUNK, cy * CHUNK, tex).setOrigin(0, 0).setDepth(0));
  }

  /** Build everything needed to draw the first frame at (x, y). */
  prime(x: number, y: number): void {
    const cx0 = Math.floor(x / CHUNK);
    const cy0 = Math.floor(y / CHUNK);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) this.ensure(cx0 + dx, cy0 + dy);
  }

  update(x: number, y: number): void {
    const cx0 = Math.floor(x / CHUNK);
    const cy0 = Math.floor(y / CHUNK);

    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) this.ensure(cx0 + dx, cy0 + dy);

    // Prefetch the outer ring, nearest first, one per frame.
    outer: for (let r = 2; r <= 2; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const key = `${cx0 + dx},${cy0 + dy}`;
          if (this.images.has(key)) continue;
          this.ensure(cx0 + dx, cy0 + dy);
          break outer;
        }
      }
    }

    for (const [key, img] of this.images) {
      const [cx, cy] = key.split(',').map(Number);
      if (Math.max(Math.abs(cx - cx0), Math.abs(cy - cy0)) > KEEP_RADIUS) {
        img.destroy();
        this.images.delete(key);
      }
    }
  }
}
