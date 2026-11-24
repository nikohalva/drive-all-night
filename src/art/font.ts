/** Tiny 3x5 pixel font, one row per number (3 bits, left pixel = 4). */
const GLYPHS: Record<string, number[]> = {
  A: [2, 5, 7, 5, 5],
  B: [6, 5, 6, 5, 6],
  C: [3, 4, 4, 4, 3],
  D: [6, 5, 5, 5, 6],
  E: [7, 4, 6, 4, 7],
  F: [7, 4, 6, 4, 4],
  G: [3, 4, 5, 5, 3],
  H: [5, 5, 7, 5, 5],
  I: [7, 2, 2, 2, 7],
  J: [1, 1, 1, 5, 2],
  K: [5, 5, 6, 5, 5],
  L: [4, 4, 4, 4, 7],
  M: [5, 7, 7, 5, 5],
  N: [6, 5, 5, 5, 5],
  O: [2, 5, 5, 5, 2],
  P: [6, 5, 6, 4, 4],
  Q: [2, 5, 5, 7, 3],
  R: [6, 5, 6, 5, 5],
  S: [3, 4, 2, 1, 6],
  T: [7, 2, 2, 2, 2],
  U: [5, 5, 5, 5, 7],
  V: [5, 5, 5, 5, 2],
  W: [5, 5, 7, 7, 5],
  X: [5, 5, 2, 5, 5],
  Y: [5, 5, 2, 2, 2],
  Z: [7, 1, 2, 4, 7],
  '0': [7, 5, 5, 5, 7],
  '1': [2, 6, 2, 2, 7],
  '2': [6, 1, 2, 4, 7],
  '3': [6, 1, 2, 1, 6],
  '4': [5, 5, 7, 1, 1],
  '5': [7, 4, 6, 1, 6],
  '6': [3, 4, 7, 5, 7],
  '7': [7, 1, 2, 2, 2],
  '8': [7, 5, 7, 5, 7],
  '9': [7, 5, 7, 1, 6],
  ':': [0, 2, 0, 2, 0],
  '.': [0, 0, 0, 0, 2],
  ',': [0, 0, 0, 2, 4],
  '/': [1, 1, 2, 4, 4],
  '-': [0, 0, 7, 0, 0],
  '+': [0, 2, 7, 2, 0],
  '>': [4, 2, 1, 2, 4],
  '<': [1, 2, 4, 2, 1],
  '!': [2, 2, 2, 0, 2],
  '?': [6, 1, 2, 0, 2],
  '%': [5, 1, 2, 4, 5],
  "'": [2, 2, 0, 0, 0],
  '(': [1, 2, 2, 2, 1],
  ')': [4, 2, 2, 2, 4],
  '*': [5, 2, 7, 2, 5],
  ' ': [0, 0, 0, 0, 0],
};

export const GLYPH_W = 3;
export const GLYPH_H = 5;
export const ADVANCE = 4;

export function hasGlyph(ch: string): boolean {
  return ch.toUpperCase() in GLYPHS;
}

export function textWidth(s: string): number {
  return s.length === 0 ? 0 : s.length * ADVANCE - 1;
}

/** Draw `s` with its top-left pixel at (x, y). `glow` is a (usually translucent) halo colour. */
export function drawText(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  color: string,
  glow?: string,
): void {
  let cx = Math.floor(x);
  const cy = Math.floor(y);
  for (const raw of s) {
    const rows = GLYPHS[raw.toUpperCase()] ?? GLYPHS['?'];
    for (let j = 0; j < GLYPH_H; j++) {
      for (let i = 0; i < GLYPH_W; i++) {
        if (!(rows[j] & (4 >> i))) continue;
        if (glow) {
          ctx.fillStyle = glow;
          ctx.fillRect(cx + i - 1, cy + j - 1, 3, 3);
        }
      }
    }
    for (let j = 0; j < GLYPH_H; j++) {
      for (let i = 0; i < GLYPH_W; i++) {
        if (!(rows[j] & (4 >> i))) continue;
        ctx.fillStyle = color;
        ctx.fillRect(cx + i, cy + j, 1, 1);
      }
    }
    cx += ADVANCE;
  }
}
