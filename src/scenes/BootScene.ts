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
    this.add
      .text(240, 135, 'DRIVE ALL NIGHT', { fontFamily: 'monospace', fontSize: '16px', color: '#ff2bd6' })
      .setOrigin(0.5);
  }
}
