import { BALANCE, NIGHT_LEN } from '../config/balance';
import { nearestCopy, sunsetY } from './world';

export type MapZoom = 'local' | 'night';

export interface MapArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The stretch of track a map shows: from topY (toward the sunset) to bottomY (toward dawn). */
export interface MapWindow {
  topY: number;
  bottomY: number;
  area: MapArea;
}

/** Track length shown by the local zoom. */
export const LOCAL_SPAN = 12000;
/** In the local zoom the player sits this far down the map, so more of the road ahead shows. */
const LOCAL_PLAYER_AT = 0.62;

export function mapWindow(zoom: MapZoom, player: { x: number; y: number }, t: number, area: MapArea): MapWindow {
  if (zoom === 'local') {
    const topY = player.y - LOCAL_PLAYER_AT * LOCAL_SPAN;
    return { topY, bottomY: topY + LOCAL_SPAN, area };
  }
  const topY = nearestCopy(sunsetY(t), player.y);
  return { topY, bottomY: topY + NIGHT_LEN, area };
}

/** Where world point (x, y) lands on the map (y goes through the copy nearest the window). */
export function toMap(x: number, y: number, win: MapWindow): { x: number; y: number } {
  const yy = nearestCopy(y, (win.topY + win.bottomY) / 2);
  return {
    x: win.area.x + (x / BALANCE.WORLD_WIDTH) * win.area.w,
    y: win.area.y + ((yy - win.topY) / (win.bottomY - win.topY)) * win.area.h,
  };
}

/** "3.6K AHEAD" / "12.0K BEHIND" / "HERE", measured along the track. */
export function placeLabel(playerY: number, placeY: number): string {
  const d = nearestCopy(placeY, playerY) - playerY;
  if (Math.abs(d) < 500) return 'HERE';
  return `${(Math.abs(d) / 1000).toFixed(1)}K ${d < 0 ? 'AHEAD' : 'BEHIND'}`;
}
