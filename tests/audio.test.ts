import { MOODS, moodFor, nextSoundMode, notesAt, noteHz, type Mood } from '../src/audio/score';
import { SFX } from '../src/audio/sfx';

test('A4 is 440 Hz and an octave doubles it', () => {
  expect(noteHz(69)).toBeCloseTo(440);
  expect(noteHz(81)).toBeCloseTo(880);
});

test('every mood plays notes, loops and stays quiet', () => {
  for (const mood of Object.keys(MOODS) as Mood[]) {
    const { steps, stepSeconds } = MOODS[mood];
    expect(stepSeconds).toBeGreaterThan(0.05);
    const bar = Array.from({ length: steps }, (_, i) => notesAt(mood, i));
    expect(bar.flat().length).toBeGreaterThan(0);
    expect(notesAt(mood, steps + 3)).toEqual(notesAt(mood, 3));
    for (const n of bar.flat()) {
      expect(n.gain).toBeLessThanOrEqual(0.3);
      expect(n.length).toBeGreaterThan(0);
    }
  }
});

test('the music follows the screen, with the topmost one deciding', () => {
  expect(moodFor(['title'])).toBe('title');
  expect(moodFor(['drive', 'hud'])).toBe('drive');
  expect(moodFor(['drive', 'hud', 'battle'])).toBe('battle');
  expect(moodFor(['drive', 'hud', 'arrival'])).toBe('city');
  expect(moodFor(['drive', 'hud', 'city', 'crew'])).toBe('city');
  expect(moodFor(['drive', 'hud', 'map'])).toBe('drive');
  expect(moodFor(['intro'], 'ship')).toBe('story');
  expect(moodFor(['intro'], 'shadow')).toBe('danger');
  expect(moodFor(['boot'])).toBeNull();
});

test('sound goes from everything to no music to silence and back', () => {
  expect(nextSoundMode('all')).toBe('effects');
  expect(nextSoundMode('effects')).toBe('off');
  expect(nextSoundMode('off')).toBe('all');
});

test('every effect is short and modest', () => {
  for (const voices of Object.values(SFX)) {
    expect(voices.length).toBeGreaterThan(0);
    for (const v of voices) {
      expect(v.at + v.length).toBeLessThanOrEqual(1.5);
      expect(v.gain).toBeLessThanOrEqual(0.5);
    }
  }
});
