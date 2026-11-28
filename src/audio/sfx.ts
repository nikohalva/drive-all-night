/** Sound effects as recipes for the synth: a few swept tones or bursts of noise each. */
export interface Voice {
  wave: OscillatorType | 'noise';
  /** Start and end pitch in Hz (the filter cutoff for noise). */
  from: number;
  to: number;
  /** Seconds after the effect starts. */
  at: number;
  length: number;
  gain: number;
}

const v = (wave: Voice['wave'], from: number, to: number, at: number, length: number, gain: number): Voice => ({
  wave,
  from,
  to,
  at,
  length,
  gain,
});

export const SFX = {
  tick: [v('square', 520, 520, 0, 0.03, 0.08)],
  select: [v('square', 440, 880, 0, 0.08, 0.1)],
  coin: [v('square', 988, 988, 0, 0.07, 0.12), v('square', 1319, 1319, 0.07, 0.18, 0.12)],
  deny: [v('sawtooth', 160, 110, 0, 0.18, 0.2)],
  shot: [v('square', 900, 150, 0, 0.12, 0.14), v('noise', 4000, 1000, 0, 0.08, 0.12)],
  hit: [v('noise', 1200, 200, 0, 0.18, 0.35), v('triangle', 140, 60, 0, 0.18, 0.3)],
  boom: [v('noise', 900, 60, 0, 0.9, 0.5), v('sine', 90, 30, 0, 0.8, 0.4)],
  repair: [v('sine', 400, 800, 0, 0.2, 0.18), v('sine', 600, 1200, 0.1, 0.2, 0.14)],
  win: [v('square', 523, 523, 0, 0.12, 0.12), v('square', 659, 659, 0.12, 0.12, 0.12), v('square', 784, 784, 0.24, 0.35, 0.12)],
  lose: [v('sawtooth', 300, 220, 0, 0.25, 0.18), v('sawtooth', 220, 90, 0.25, 0.6, 0.18)],
  sparkle: [v('sine', 1760, 2637, 0, 0.09, 0.05)],
  find: [v('triangle', 660, 660, 0, 0.1, 0.2), v('triangle', 990, 990, 0.1, 0.25, 0.2)],
  alarm: [v('square', 740, 740, 0, 0.14, 0.14), v('square', 554, 554, 0.18, 0.14, 0.14)],
  dock: [v('sine', 220, 440, 0, 0.35, 0.22), v('noise', 600, 200, 0.2, 0.3, 0.15)],
} satisfies Record<string, Voice[]>;

export type SfxName = keyof typeof SFX;
