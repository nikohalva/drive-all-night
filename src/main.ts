import { sound } from './audio/engine';
import { moodFor } from './audio/score';
import { INTRO } from './config/intro';
import { ui } from './game/session';
import Phaser from 'phaser';
import { VIEW } from './config/view';
import { BootScene } from './scenes/BootScene';
import { ArrivalScene } from './scenes/ArrivalScene';
import { BaronScene } from './scenes/BaronScene';
import { BattleScene } from './scenes/BattleScene';
import { CityScene } from './scenes/CityScene';
import { CrewScene } from './scenes/CrewScene';
import { DriveScene } from './scenes/DriveScene';
import { GalleryScene } from './scenes/GalleryScene';
import { HudScene } from './scenes/HudScene';
import { IntroScene } from './scenes/IntroScene';
import { MapScene } from './scenes/MapScene';
import { ShelterScene } from './scenes/ShelterScene';
import { TitleScene } from './scenes/TitleScene';
import { VictoryScene } from './scenes/VictoryScene';

export const GAME_W = VIEW.W;
export const GAME_H = VIEW.H;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#07020f',
  scale: { mode: Phaser.Scale.NONE, zoom: 1 },
  scene: [BootScene, TitleScene, IntroScene, GalleryScene, DriveScene, HudScene, BattleScene, CityScene, VictoryScene, MapScene, BaronScene, ShelterScene, ArrivalScene, CrewScene],
});

const MENUS = ['title', 'intro', 'city', 'arrival', 'crew', 'map', 'baron', 'shelter', 'battle'];
const SOUND_LABEL = { all: 'SOUND ON', effects: 'MUSIC OFF', off: 'SOUND OFF' } as const;

const activeScenes = (): string[] => game.scene.getScenes(true).map((s) => s.scene.key);

game.events.on('poststep', () => {
  const scenes = activeScenes();
  const intro = scenes.includes('intro') ? (game.scene.getScene('intro') as IntroScene) : null;
  sound.update(moodFor(scenes, intro ? INTRO[intro.page]?.art : undefined));
  // the motor is only heard while the road is moving
  const menuUp = scenes.some((s) => MENUS.includes(s));
  if (!scenes.includes('drive') || menuUp) sound.engine(0);
});

window.addEventListener('keydown', (e) => {
  sound.unlock();
  if (e.repeat) return;
  if (e.code === 'KeyN' || e.key === 'n') {
    ui.toast = SOUND_LABEL[sound.cycleMode()];
    ui.toastUntil = game.loop.time + 2000;
    return;
  }
  if (!activeScenes().some((s) => MENUS.includes(s))) return;
  if (e.key.startsWith('Arrow')) sound.play('tick');
  else if (e.key === 'Enter' || e.key === ' ') sound.play('select');
});
window.addEventListener('pointerdown', () => sound.unlock());

// Handy for poking at the game from the browser console while developing.
if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;

/** Whole-number zoom only, so pixels stay crisp. */
function fitZoom(): void {
  const zoom = Math.max(1, Math.floor(Math.min(window.innerWidth / GAME_W, window.innerHeight / GAME_H)));
  game.scale.setZoom(zoom);
}
fitZoom();
window.addEventListener('resize', fitZoom);
