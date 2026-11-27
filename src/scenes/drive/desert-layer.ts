import Phaser from 'phaser';
import { paintScenery, paintWreck, SCENERY_SIZE } from '../../art/desert';
import { PAL } from '../../art/palette';
import { VIEW } from '../../config/view';
import { allWrecks, sceneryIn } from '../../sim/desert';
import { nearestCopy } from '../../sim/world';

const ensure = (scene: Phaser.Scene, key: string, make: () => HTMLCanvasElement): string => {
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, make());
  return key;
};

/** Scenery and wrecks around the camera, drawn with a small pool of sprites. */
export class DesertLayer {
  private scenery: Phaser.GameObjects.Image[] = [];
  private wrecks: Phaser.GameObjects.Image[] = [];
  /** Above the darkness, so a wreck's beacon shows from afar. */
  private beacons: Phaser.GameObjects.Graphics;

  constructor(
    private scene: Phaser.Scene,
    private seed: number,
  ) {
    this.beacons = scene.add.graphics().setDepth(53).setBlendMode(Phaser.BlendModes.ADD);
  }

  update(scrollX: number, scrollY: number, time: number, searched: readonly string[]): void {
    const pad = SCENERY_SIZE;
    const pieces = sceneryIn(this.seed, scrollX - pad, scrollY - pad, VIEW.W + 2 * pad, VIEW.H + 2 * pad);
    pieces.forEach((p, i) => {
      const key = ensure(this.scene, `scenery-${p.kind}`, () => paintScenery(p.kind));
      this.scenery[i] ??= this.scene.add.image(0, 0, key).setDepth(1);
      this.scenery[i].setTexture(key).setPosition(p.x, p.y).setFlipX(p.flip).setVisible(true);
    });
    for (let i = pieces.length; i < this.scenery.length; i++) this.scenery[i].setVisible(false);

    this.beacons.clear();
    const midY = scrollY + VIEW.H / 2;
    const key = ensure(this.scene, 'wreck', paintWreck);
    let used = 0;
    for (const w of allWrecks(this.seed)) {
      const y = nearestCopy(w.y, midY);
      if (w.x < scrollX - pad || w.x > scrollX + VIEW.W + pad || y < scrollY - pad || y > scrollY + VIEW.H + pad) continue;
      this.wrecks[used] ??= this.scene.add.image(0, 0, key).setDepth(2);
      const done = searched.includes(w.id);
      const img = this.wrecks[used++].setPosition(w.x, y).setVisible(true);
      if (done) img.setTint(0x6a6080);
      else img.clearTint();
      if (done) continue;
      const pulse = 0.5 + 0.5 * Math.sin(time / 280 + w.x);
      const amber = parseInt(PAL.amber.slice(1), 16);
      this.beacons.fillStyle(amber, 0.12 + 0.18 * pulse).fillCircle(w.x, y - 14, 6 + 3 * pulse);
      this.beacons.fillStyle(amber, 0.9).fillRect(w.x - 1, y - 15, 3, 3);
    }
    for (let i = used; i < this.wrecks.length; i++) this.wrecks[i].setVisible(false);
  }
}
