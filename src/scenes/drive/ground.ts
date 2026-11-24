import Phaser from 'phaser';
import { CHUNK } from '../../art/painters';
import { ensureChunk, releaseChunk } from '../../art/textures';
import { VIEW_H, VIEW_W } from './particles-layer';

interface ChunkRange {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Chunks overlapping the view whose top-left corner is (scrollX, scrollY), grown by `pad` chunks. */
function rangeFor(scrollX: number, scrollY: number, pad: number): ChunkRange {
  return {
    x0: Math.floor(scrollX / CHUNK) - pad,
    x1: Math.floor((scrollX + VIEW_W) / CHUNK) + pad,
    y0: Math.floor(scrollY / CHUNK) - pad,
    y1: Math.floor((scrollY + VIEW_H) / CHUNK) + pad,
  };
}

const inside = (r: ChunkRange, cx: number, cy: number): boolean =>
  cx >= r.x0 && cx <= r.x1 && cy >= r.y0 && cy <= r.y1;

/**
 * Keeps ground chunks under the camera. Chunks in view are built at once; the ring
 * just outside is prefetched one chunk per frame, so crossing a chunk never hitches.
 */
export class GroundLayer {
  private readonly images = new Map<string, { image: Phaser.GameObjects.Image; texture: string }>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly seed: number,
  ) {}

  private ensure(cx: number, cy: number): void {
    const key = `${cx},${cy}`;
    if (this.images.has(key)) return;
    const tex = ensureChunk(this.scene, this.seed, cx, cy);
    this.images.set(key, {
      image: this.scene.add.image(cx * CHUNK, cy * CHUNK, tex).setOrigin(0, 0).setDepth(0),
      texture: tex,
    });
  }

  /** Build everything needed to draw a frame with the camera at (scrollX, scrollY). */
  prime(scrollX: number, scrollY: number): void {
    const view = rangeFor(scrollX, scrollY, 0);
    for (let cy = view.y0; cy <= view.y1; cy++) for (let cx = view.x0; cx <= view.x1; cx++) this.ensure(cx, cy);
  }

  update(scrollX: number, scrollY: number): void {
    this.prime(scrollX, scrollY);

    // prefetch the ring just outside the view, one chunk per frame
    const ring = rangeFor(scrollX, scrollY, 1);
    outer: for (let cy = ring.y0; cy <= ring.y1; cy++) {
      for (let cx = ring.x0; cx <= ring.x1; cx++) {
        if (!this.images.has(`${cx},${cy}`)) {
          this.ensure(cx, cy);
          break outer;
        }
      }
    }

    const keep = rangeFor(scrollX, scrollY, 2);
    for (const [key, entry] of this.images) {
      const [cx, cy] = key.split(',').map(Number);
      if (!inside(keep, cx, cy)) {
        entry.image.destroy();
        releaseChunk(entry.texture);
        this.images.delete(key);
      }
    }
  }
}
