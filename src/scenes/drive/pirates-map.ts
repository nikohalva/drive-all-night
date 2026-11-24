import Phaser from 'phaser';
import { PAL } from '../../art/palette';
import { ensureLabel, ensurePirateTexture } from '../../art/textures';
import {
  inContact,
  isWarning,
  maybeSpawnGroup,
  shouldGiveUp,
  stepGroup,
  type FleetContext,
  type PirateGroup,
} from '../../sim/pirate-fleet';
import type { Rng } from '../../sim/rng';

/** Sideways spacing between pirates in one group, in pixels. */
const SPACING = 30;

interface Entry {
  group: PirateGroup;
  sprites: Phaser.GameObjects.Image[];
  shadows: Phaser.GameObjects.Image[];
  warn: Phaser.GameObjects.Image;
}

/** Pirate groups flying over the map: spawning, chasing, and the sprites that show them. */
export class PiratesMap {
  private entries: Entry[] = [];
  private rollTimer = 0;
  private nextId = 1;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly rng: Rng,
  ) {}

  get count(): number {
    return this.entries.length;
  }

  add(group: PirateGroup): void {
    const tex = ensurePirateTexture(this.scene, group.level);
    const sprites: Phaser.GameObjects.Image[] = [];
    const shadows: Phaser.GameObjects.Image[] = [];
    for (let i = 0; i < group.pirates.length; i++) {
      shadows.push(this.scene.add.image(0, 0, tex).setTintFill(0x05010c).setAlpha(0.5).setDepth(8));
      sprites.push(this.scene.add.image(0, 0, tex).setDepth(12));
    }
    const warn = this.scene.add
      .image(0, 0, ensureLabel(this.scene, '!', PAL.pirate, `${PAL.pirate}55`))
      .setScale(3)
      .setDepth(13)
      .setVisible(false);
    this.entries.push({ group, sprites, shadows, warn });
  }

  /**
   * Advance every group by `dt` world seconds. Returns the group that just reached the
   * player (already removed from the map), if any.
   */
  update(
    dt: number,
    timeMs: number,
    player: { x: number; y: number },
    ctx: FleetContext,
  ): PirateGroup | null {
    this.rollTimer += dt;
    while (this.rollTimer >= 1) {
      this.rollTimer -= 1;
      const spawned = maybeSpawnGroup(this.rng, this.entries.map((e) => e.group), player, ctx, this.nextId);
      if (spawned) {
        this.nextId++;
        this.add(spawned);
      }
    }

    let contact: PirateGroup | null = null;
    for (const entry of [...this.entries]) {
      entry.group = stepGroup(entry.group, player, dt);
      if (shouldGiveUp(entry.group, player)) {
        this.remove(entry);
      } else if (!contact && inContact(entry.group, player)) {
        contact = entry.group;
        this.remove(entry);
      } else {
        this.draw(entry, player, timeMs);
      }
    }
    return contact;
  }

  clear(): void {
    for (const entry of [...this.entries]) this.remove(entry);
  }

  private remove(entry: Entry): void {
    entry.sprites.forEach((s) => s.destroy());
    entry.shadows.forEach((s) => s.destroy());
    entry.warn.destroy();
    this.entries = this.entries.filter((e) => e !== entry);
  }

  private draw(entry: Entry, player: { x: number; y: number }, timeMs: number): void {
    const { group } = entry;
    // sprites are drawn nose-down, so rotate by the heading minus a quarter turn
    const rotation = Math.atan2(player.y - group.y, player.x - group.x) - Math.PI / 2;
    const n = group.pirates.length;
    entry.sprites.forEach((sprite, i) => {
      const x = group.x + (i - (n - 1) / 2) * SPACING;
      sprite.setPosition(x, group.y).setRotation(rotation);
      entry.shadows[i].setPosition(x + 6, group.y + 10).setRotation(rotation);
    });
    entry.warn.setPosition(group.x, group.y - 28).setVisible(isWarning(group, player) && Math.floor(timeMs / 300) % 2 === 0);
  }
}
