/**
 * The music, as data. Each mood is a looping run of chords from which a pad, a bass line and an
 * arpeggio are derived, so there are no audio files.
 */
export type Mood = 'title' | 'story' | 'danger' | 'drive' | 'city' | 'battle';

export interface Note {
  midi: number;
  length: number;
  gain: number;
  wave: OscillatorType;
  /** Seconds to swell in. */
  attack: number;
}

interface MoodDef {
  /** Chords as MIDI notes, root first. */
  chords: readonly (readonly number[])[];
  /** Steps per chord and seconds per step. */
  perChord: number;
  stepSeconds: number;
  /** Every how many steps the bass and arpeggio sound; 0 for never. */
  bassEvery: number;
  arpEvery: number;
  pad: number;
}

const Am = [57, 60, 64];
const F = [53, 57, 60];
const C = [48, 52, 55];
const G = [55, 59, 62];
const Dm = [50, 53, 57];
const E = [52, 56, 59];
const Bb = [46, 50, 53];

const DEFS: Record<Mood, MoodDef> = {
  title: { chords: [Am, F, C, G], perChord: 16, stepSeconds: 0.2, bassEvery: 4, arpEvery: 2, pad: 0.07 },
  story: { chords: [Am, F, Dm, E], perChord: 16, stepSeconds: 0.3, bassEvery: 16, arpEvery: 4, pad: 0.08 },
  danger: { chords: [[45, 46, 52], [44, 50, 51]], perChord: 16, stepSeconds: 0.22, bassEvery: 2, arpEvery: 0, pad: 0.08 },
  drive: { chords: [Am, C, G, F], perChord: 32, stepSeconds: 0.22, bassEvery: 4, arpEvery: 4, pad: 0.05 },
  city: { chords: [F, G, Am, C], perChord: 16, stepSeconds: 0.24, bassEvery: 8, arpEvery: 3, pad: 0.05 },
  battle: { chords: [Am, Bb, Am, E], perChord: 16, stepSeconds: 0.13, bassEvery: 2, arpEvery: 1, pad: 0.04 },
};

export const MOODS = Object.fromEntries(
  Object.entries(DEFS).map(([mood, d]) => [mood, { steps: d.chords.length * d.perChord, stepSeconds: d.stepSeconds }]),
) as Record<Mood, { steps: number; stepSeconds: number }>;

export const noteHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** What starts on this step of a mood's loop. */
export function notesAt(mood: Mood, step: number): Note[] {
  const d = DEFS[mood];
  const total = d.chords.length * d.perChord;
  const at = step % total;
  const chord = d.chords[Math.floor(at / d.perChord)];
  const inChord = at % d.perChord;
  const notes: Note[] = [];
  if (inChord === 0) {
    const length = d.perChord * d.stepSeconds;
    for (const midi of chord) notes.push({ midi, length, gain: d.pad, wave: 'sawtooth', attack: length / 4 });
  }
  if (d.bassEvery && at % d.bassEvery === 0) {
    notes.push({ midi: chord[0] - 12, length: d.bassEvery * d.stepSeconds * 0.8, gain: 0.16, wave: 'triangle', attack: 0.01 });
  }
  if (d.arpEvery && at % d.arpEvery === 0) {
    const i = at / d.arpEvery;
    // up the chord and back over two octaves
    const run = [0, 1, 2, 3, 2, 1];
    const rung = run[i % run.length];
    const midi = chord[rung % 3] + 12 + (rung === 3 ? 12 : 0);
    notes.push({ midi, length: d.stepSeconds * 1.6, gain: 0.05, wave: 'square', attack: 0.01 });
  }
  return notes;
}

/** Which music fits the screens that are up (listed bottom first); null leaves it silent. */
export function moodFor(scenes: readonly string[], slide?: string): Mood | null {
  if (scenes.includes('battle')) return 'battle';
  if (scenes.some((s) => s === 'city' || s === 'arrival' || s === 'baron' || s === 'victory')) return 'city';
  if (scenes.includes('intro')) return slide === 'shadow' || slide === 'pod' ? 'danger' : 'story';
  if (scenes.includes('drive')) return 'drive';
  return scenes.includes('title') ? 'title' : null;
}

export type SoundMode = 'all' | 'effects' | 'off';

export const nextSoundMode = (mode: SoundMode): SoundMode =>
  mode === 'all' ? 'effects' : mode === 'effects' ? 'off' : 'all';
