import Phaser from 'phaser';
import { paintSlide, PICTURE_H } from '../art/intro';
import { PAL } from '../art/palette';
import { ensureLabel } from '../art/textures';
import { INTRO } from '../config/intro';
import { VIEW } from '../config/view';

const W = VIEW.W;
const H = VIEW.H;

/** The opening story. Starts the road ('drive') for a new game, or goes back to the title. */
export class IntroScene extends Phaser.Scene {
  private page = 0;
  private next: 'drive' | 'title' = 'drive';
  private shown: Phaser.GameObjects.Image[] = [];

  constructor() {
    super('intro');
  }

  init(data: { next?: 'drive' | 'title' }): void {
    this.next = data.next ?? 'drive';
  }

  create(): void {
    this.page = 0;
    this.shown = [];
    this.cameras.main.setBackgroundColor('#07030c');

    const kb = this.input.keyboard;
    kb?.removeAllListeners();
    // a held key (the Enter that started the game) must not flick through the story
    for (const key of ['ENTER', 'SPACE', 'RIGHT', 'D']) kb?.on(`keydown-${key}`, (e: KeyboardEvent) => !e.repeat && this.turn(1));
    for (const key of ['LEFT', 'A']) kb?.on(`keydown-${key}`, () => this.turn(-1));
    kb?.on('keydown-ESC', () => this.finish());
    this.events.once('shutdown', () => kb?.removeAllListeners());

    this.render();
  }

  private turn(step: number): void {
    const to = this.page + step;
    if (to >= INTRO.length) {
      this.finish();
      return;
    }
    if (to < 0) return;
    this.page = to;
    this.render();
  }

  private finish(): void {
    this.scene.start(this.next);
  }

  private render(): void {
    for (const img of this.shown) img.destroy();
    const slide = INTRO[this.page];
    const key = `intro-${slide.art}`;
    if (!this.textures.exists(key)) this.textures.addCanvas(key, paintSlide(slide.art));
    const label = (text: string, y: number, color: string, scale: number): Phaser.GameObjects.Image =>
      this.add.image(W / 2, y, ensureLabel(this, text, color)).setOrigin(0.5, 0).setScale(scale);

    this.shown = [
      this.add.image(0, 0, key).setOrigin(0, 0),
      ...slide.lines.map((line, i) => label(line, PICTURE_H + 18 + i * 18, PAL.white, 2)),
      label(`${this.page + 1}/${INTRO.length}   ENTER: NEXT   LEFT: BACK   ESC: SKIP`, H - 12, '#6a5a8a', 1),
    ];
    this.cameras.main.fadeIn(250, 7, 3, 12);
  }
}
