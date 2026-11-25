/** Pixel portraits painted from a face seed, so every person looks like themselves. */
import type { CrewRole } from '../config/crew';
import { makeRng } from '../sim/rng';
import { PAL } from './palette';
import { makeCanvas } from './painters';

export const PORTRAIT = 24;

export type PortraitRole = CrewRole | 'captain';

const SKIN = ['#ffd0a8', '#e8a878', '#c88458', '#9a5c3c', '#6e4030'];
const HAIR = ['#1c1828', '#6a3a2a', '#d8a040', '#e8e0d0', PAL.pink, PAL.cyan, '#8a4ad0', '#c0382a'];
const JACKET: Record<PortraitRole, string> = {
  captain: PAL.cab.base,
  driver: '#3a6ad0',
  mechanic: '#d89a20',
  gunner: '#6a8a4c',
  comms: '#8a4ad0',
  medic: '#d8d8e8',
};

const cache = new Map<string, HTMLCanvasElement>();

export function portrait(face: number, role: PortraitRole): HTMLCanvasElement {
  const key = `${face}-${role}`;
  let c = cache.get(key);
  if (!c) {
    c = paint(face, role);
    cache.set(key, c);
  }
  return c;
}

function paint(face: number, role: PortraitRole): HTMLCanvasElement {
  const [c, g] = makeCanvas(PORTRAIT, PORTRAIT);
  const rng = makeRng(face);
  const of = <T>(list: readonly T[]): T => list[Math.floor(rng() * list.length)];
  const rect = (x: number, y: number, w: number, h: number, color: string): void => {
    g.fillStyle = color;
    g.fillRect(x, y, w, h);
  };

  const skin = of(SKIN);
  const hair = of(HAIR);
  const style = Math.floor(rng() * 5);
  const eyes = Math.floor(rng() * 4);
  const mouth = Math.floor(rng() * 3);
  const wide = rng() < 0.5 ? 1 : 0;
  const scar = rng() < 0.2;
  const beard = rng() < 0.25;

  // neon backdrop
  rect(0, 0, 24, 24, '#2a1150');
  rect(0, 14, 24, 1, '#6a1f7a');
  rect(0, 17, 24, 1, '#6a1f7a');

  // shoulders and collar
  rect(3, 19, 18, 5, JACKET[role]);
  rect(3, 19, 18, 1, '#ffffff33');
  rect(10, 18, 4, 3, skin);
  rect(11, 21, 2, 3, PAL.ink);

  // head
  const left = 7 - wide;
  const w = 10 + wide * 2;
  rect(left - 1, 5, w + 2, 12, PAL.ink);
  rect(left, 5, w, 12, skin);
  rect(left + 1, 17, w - 2, 1, skin);
  rect(left + w - 1, 6, 1, 11, '#00000033');

  // hair
  if (style !== 4) {
    rect(left, 3, w, 3, hair);
    if (style === 0) rect(left - 1, 4, 2, 4, hair); // swept
    if (style === 1) {
      rect(left - 1, 4, 2, 13, hair); // long
      rect(left + w - 1, 4, 2, 13, hair);
    }
    if (style === 2) rect(10, 1, 4, 4, hair); // mohawk
    if (style === 3) rect(left - 1, 3, w + 2, 2, hair); // thick crop
  } else {
    rect(left + 2, 4, w - 4, 1, skin); // shaved
  }

  // eyes
  if (eyes === 0) {
    rect(left, 8, w, 3, PAL.ink); // visor
    rect(left + 1, 9, w - 2, 1, PAL.cyan);
  } else if (eyes === 1) {
    rect(left + 1, 8, 3, 3, PAL.ink); // goggles
    rect(left + w - 4, 8, 3, 3, PAL.ink);
    rect(left + 2, 9, 1, 1, PAL.amber);
    rect(left + w - 3, 9, 1, 1, PAL.amber);
    rect(left, 9, w, 1, '#00000055');
  } else {
    rect(left + 2, 9, 2, 1, PAL.ink);
    rect(left + w - 4, 9, 2, 1, PAL.ink);
    rect(left + 2, 7, 2, 1, hair);
    rect(left + w - 4, 7, 2, 1, hair);
    if (eyes === 3) rect(left + w - 5, 8, 4, 3, PAL.ink); // eye patch
  }

  rect(12, 10, 1, 3, '#00000044'); // nose
  if (beard) rect(left + 1, 13, w - 2, 4, hair);
  if (mouth === 0) rect(10, 14, 4, 1, '#7e1e30');
  else if (mouth === 1) {
    rect(10, 14, 4, 1, '#7e1e30');
    rect(9, 13, 1, 1, '#7e1e30');
    rect(14, 13, 1, 1, '#7e1e30');
  } else rect(11, 14, 2, 2, '#7e1e30');
  if (scar) {
    rect(left + 2, 11, 1, 4, '#ff6a8a');
    rect(left + 1, 12, 3, 1, '#ff6a8a');
  }

  // role marks
  if (role === 'comms') {
    rect(left - 2, 8, 2, 5, PAL.steel.light);
    rect(left - 1, 13, 4, 1, PAL.steel.light);
  }
  if (role === 'medic') {
    rect(17, 20, 3, 1, PAL.red);
    rect(18, 19, 1, 3, PAL.red);
  }
  if (role === 'captain') {
    rect(left - 1, 3, w + 2, 2, PAL.cab.dark);
    rect(left, 1, w, 2, PAL.cab.base);
    rect(11, 2, 2, 1, PAL.amber);
  }
  return c;
}
