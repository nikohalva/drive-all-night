import Phaser from 'phaser';
import { PAL } from '../art/palette';
import { ensureLabel, ensureRigTextures } from '../art/textures';
import { getState } from '../game/session';

const W = 480;
const H = 270;
/** Ignore keys for a moment so the purchase keypress cannot dismiss it. */
const ARM_MS = 600;

/** Shown once, over the city menu, when the largest hull is bought. */
export class VictoryScene extends Phaser.Scene {
  constructor() {
    super('victory');
  }

  create(): void {
    this.add.rectangle(0, 0, W, H, 0x07020f, 0.88).setOrigin(0, 0);

    const label = (text: string, y: number, color: string, scale: number): void => {
      this.add.image(W / 2, y, ensureLabel(this, text, color, `${color}66`)).setScale(scale).setOrigin(0.5, 0);
    };
    label('YOU MADE IT', 26, PAL.amber, 4);
    label('THE JUGGERNAUT IS YOURS', 62, PAL.pink, 2);

    const rig = this.add
      .image(W / 2, 150, ensureRigTextures(this, getState().vehicle)[0])
      .setRotation(Math.PI / 2)
      .setScale(1.5);
    this.tweens.add({ targets: rig, y: 156, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    label('THE NIGHT NEVER ENDS. KEEP DRIVING.', 214, PAL.cyanPale, 1);
    label('PRESS ANY KEY', 232, PAL.white, 1);

    this.time.delayedCall(ARM_MS, () => {
      this.input.keyboard?.once('keydown', () => {
        this.scene.stop();
        this.scene.get('city').events.emit('victory-done');
      });
    });
  }
}
