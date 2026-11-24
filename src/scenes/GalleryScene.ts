import Phaser from 'phaser';
import { HULLS, PARTS, SLOT_TYPES, type HullId } from '../config/catalog';
import { PAL } from '../art/palette';
import { CHUNK } from '../art/painters';
import {
  ensureChunk,
  ensureCityTexture,
  ensureLabel,
  ensurePirateTexture,
  ensureRigTextures,
} from '../art/textures';
import { starterVehicle, type VehicleState } from '../sim/vehicle';

const PAGES = 4;
const SEED = 12345;

/** A vehicle of `hullId` with starter parts, or with the best (Mk3) part in every slot. */
function vehicleFor(hullId: HullId, mk3: boolean): VehicleState {
  const v = starterVehicle();
  const fitted = { ...v.fitted };
  for (const slot of SLOT_TYPES) {
    const count = HULLS[hullId].slots[slot];
    const part = mk3 ? `${slot}-3` : v.fitted[slot][0];
    fitted[slot] = Array.from({ length: count }, (_, i) => (i === 0 || mk3 ? part : null));
  }
  return { ...v, hullId, fitted };
}

/** Development gallery for checking the pixel art. Open the game with ?gallery=1..4. */
export class GalleryScene extends Phaser.Scene {
  private page = 1;

  constructor() {
    super('gallery');
  }

  init(data: { page?: number }): void {
    this.page = Math.min(PAGES, Math.max(1, data.page ?? 1));
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1b0a33');
    if (this.page === 3) this.label(`${this.page}/${PAGES}`, 450, 4, PAL.cyan);
    else this.label(`GALLERY ${this.page}/${PAGES}   LEFT/RIGHT: PAGE`, 6, 4, PAL.cyan);
    [this.page1, this.page2, this.page3, this.page4][this.page - 1].call(this);

    const go = (delta: number): void => {
      const next = ((this.page - 1 + delta + PAGES) % PAGES) + 1;
      history.replaceState(null, '', `?gallery=${next}`);
      this.scene.restart({ page: next });
    };
    this.input.keyboard?.on('keydown-LEFT', () => go(-1));
    this.input.keyboard?.on('keydown-RIGHT', () => go(1));
  }

  private label(text: string, x: number, y: number, color: string, scale = 1, centered = false): void {
    const img = this.add.image(x, y, ensureLabel(this, text, color)).setOrigin(centered ? 0.5 : 0, 0);
    img.setScale(scale);
  }

  private rig(v: VehicleState, x: number, bottom: number, phase = 0, scale = 2): void {
    const key = ensureRigTextures(this, v)[phase];
    this.add.image(x, bottom, key).setOrigin(0.5, 1).setScale(scale);
  }

  private page1(): void {
    const base = 214;
    this.rig(vehicleFor('scout', false), 90, base);
    this.rig(vehicleFor('hauler', false), 240, base);
    this.rig(vehicleFor('juggernaut', false), 390, base);
    this.label('SCOUT', 90, base + 14, PAL.amber, 2, true);
    this.label('HAULER', 240, base + 14, PAL.amber, 2, true);
    this.label('JUGGERNAUT', 390, base + 14, PAL.amber, 2, true);
  }

  private page2(): void {
    const base = 214;
    this.rig(vehicleFor('hauler', true), 70, base);
    this.rig(vehicleFor('juggernaut', true), 190, base);
    this.label('HAULER MK3', 70, base + 14, PAL.amber, 1, true);
    this.label('JUGGERNAUT MK3', 190, base + 14, PAL.amber, 1, true);

    [1, 5, 10].forEach((level, i) => {
      const x = 320 + i * 50;
      this.add.image(x, 70, ensurePirateTexture(this, level)).setOrigin(0.5).setScale(2);
      this.label(`L${level}`, x, 98, PAL.pirate, 1, true);
    });
    const hauler = vehicleFor('hauler', false);
    [0, 1, 2].forEach((phase) => {
      const x = 330 + phase * 50;
      this.rig(hauler, x, 214, phase, 1);
      this.label(`TREAD ${phase}`, x, 218, PAL.cyanPale, 1, true);
    });
  }

  private page3(): void {
    this.add.image(8, 5, ensureCityTexture(this)).setOrigin(0, 0);
    this.add.image(170, 7, ensureChunk(this, SEED, 6, 10)).setOrigin(0, 0);
    this.label('CITY', 8, 262, PAL.amber);
    this.label('GROUND CHUNK 256', 170, 265, PAL.amber);
  }

  private page4(): void {
    this.add.image(8, 7, ensureChunk(this, SEED, 1, 300)).setOrigin(0, 0);
    this.label('GROUND CHUNK 256', 8, CHUNK + 10, PAL.amber);
    this.label('ABCDEFGHIJKLM', 276, 20, PAL.white, 2);
    this.label('NOPQRSTUVWXYZ', 276, 36, PAL.white, 2);
    this.label('0123456789', 276, 56, PAL.cyan, 2);
    this.label(': . , / - + > < ! ? % ( )', 276, 76, PAL.pink, 2);
    this.label('FUEL 12/40  CR 1250', 276, 100, PAL.amber, 2);
    this.label('DAWN IN 3D 04H', 276, 118, PAL.dawn, 2);
    const part = PARTS['weapon-3'];
    this.label(`${part.name.toUpperCase()} DMG ${part.stats.damage}`, 276, 140, PAL.pirate, 2);
  }
}
