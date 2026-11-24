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
    // The title screen arrives in a later task; for now a new game starts straight away.
    this.scene.start('drive');
  }
}
