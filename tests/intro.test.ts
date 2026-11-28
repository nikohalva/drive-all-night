import { hasGlyph, textWidth } from '../src/art/font';
import { INTRO } from '../src/config/intro';
import { VIEW } from '../src/config/view';

test('there are six slides, each with a line or two of story', () => {
  expect(INTRO).toHaveLength(6);
  expect(new Set(INTRO.map((s) => s.art)).size).toBe(6);
  for (const s of INTRO) {
    expect(s.lines.length).toBeGreaterThanOrEqual(1);
    expect(s.lines.length).toBeLessThanOrEqual(2);
  }
});

test('every caption can be drawn with the pixel font and fits at double size', () => {
  for (const line of INTRO.flatMap((s) => s.lines)) {
    const missing = [...line].filter((ch) => !hasGlyph(ch));
    expect(missing).toEqual([]);
    expect(textWidth(line) * 2).toBeLessThanOrEqual(VIEW.W - 20);
  }
});
