import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    this.add
      .text(240, 135, 'DRIVE ALL NIGHT', { fontFamily: 'monospace', fontSize: '16px', color: '#ff2bd6' })
      .setOrigin(0.5);
  }
}
