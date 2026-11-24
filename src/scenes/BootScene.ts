import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    const params = new URLSearchParams(window.location.search);
    if (params.has('gallery')) {
      this.scene.start('gallery', { page: Number(params.get('gallery')) || 1 });
      return;
    }
    this.scene.start('title');
  }
}
