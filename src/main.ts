import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { BattleScene } from './scenes/BattleScene';
import { CityScene } from './scenes/CityScene';
import { DriveScene } from './scenes/DriveScene';
import { GalleryScene } from './scenes/GalleryScene';
import { HudScene } from './scenes/HudScene';
import { VictoryScene } from './scenes/VictoryScene';

export const GAME_W = 480;
export const GAME_H = 270;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#07020f',
  scale: { mode: Phaser.Scale.NONE, zoom: 1 },
  scene: [BootScene, GalleryScene, DriveScene, HudScene, BattleScene, CityScene, VictoryScene],
});

// Handy for poking at the game from the browser console while developing.
if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;

/** Whole-number zoom only, so pixels stay crisp. */
function fitZoom(): void {
  const zoom = Math.max(1, Math.floor(Math.min(window.innerWidth / GAME_W, window.innerHeight / GAME_H)));
  game.scale.setZoom(zoom);
}
fitZoom();
window.addEventListener('resize', fitZoom);
