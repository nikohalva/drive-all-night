/**
 * The synth: plays the score and the effects with WebAudio. Everything is made in code. The
 * browser only lets it start after a key or click, and without WebAudio the game is simply quiet.
 */
import { MOODS, nextSoundMode, noteHz, notesAt, type Mood, type Note, type SoundMode } from './score';
import { SFX, type SfxName, type Voice } from './sfx';

const STORE_KEY = 'drive-all-night/sound';
/** How far ahead music is scheduled, seconds. */
const AHEAD = 0.3;

/** One note of music on any audio context, offline ones included. */
export function playNote(ctx: BaseAudioContext, out: AudioNode, n: Note, when: number): void {
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  osc.type = n.wave;
  osc.frequency.value = noteHz(n.midi);
  filter.type = 'lowpass';
  filter.frequency.value = n.wave === 'sawtooth' ? 900 : 2400;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.linearRampToValueAtTime(n.gain, when + n.attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + n.length);
  osc.connect(filter).connect(gain).connect(out);
  osc.start(when);
  osc.stop(when + n.length + 0.05);
}

let noiseBuffer: AudioBuffer | null = null;

function noise(ctx: BaseAudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuffer;
}

export function playVoice(ctx: BaseAudioContext, out: AudioNode, v: Voice, start: number): void {
  const when = start + v.at;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(v.gain, when);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + v.length);
  gain.connect(out);
  if (v.wave === 'noise') {
    const source = ctx.createBufferSource();
    source.buffer = noise(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(v.from, when);
    filter.frequency.exponentialRampToValueAtTime(v.to, when + v.length);
    source.connect(filter).connect(gain);
    source.start(when);
    source.stop(when + v.length);
    return;
  }
  const osc = ctx.createOscillator();
  osc.type = v.wave;
  osc.frequency.setValueAtTime(v.from, when);
  osc.frequency.exponentialRampToValueAtTime(v.to, when + v.length);
  osc.connect(gain);
  osc.start(when);
  osc.stop(when + v.length);
}

function stored(): SoundMode {
  try {
    const value = localStorage.getItem(STORE_KEY);
    return value === 'effects' || value === 'off' ? value : 'all';
  } catch {
    return 'all';
  }
}

class Sound {
  mode: SoundMode = stored();
  private ctx: AudioContext | null = null;
  private music!: GainNode;
  private effects!: GainNode;
  private motor!: { osc: OscillatorNode; filter: BiquadFilterNode; gain: GainNode };
  private mood: Mood | null = null;
  private step = 0;
  private nextAt = 0;
  private lastPlayed = new Map<SfxName, number>();

  /** Call from a key or click: browsers keep audio silent until then. */
  unlock(): void {
    try {
      if (!this.ctx) this.build(new AudioContext());
      if (this.ctx?.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  private build(ctx: AudioContext): void {
    this.ctx = ctx;
    this.music = ctx.createGain();
    this.effects = ctx.createGain();
    this.music.connect(ctx.destination);
    this.effects.connect(ctx.destination);

    // the rig's engine: one low tone that rises with speed
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 40;
    filter.type = 'lowpass';
    filter.frequency.value = 200;
    gain.gain.value = 0;
    osc.connect(filter).connect(gain).connect(this.effects);
    osc.start();
    this.motor = { osc, filter, gain };
    this.applyMode();
  }

  private applyMode(): void {
    if (!this.ctx) return;
    this.music.gain.value = this.mode === 'all' ? 0.55 : 0;
    this.effects.gain.value = this.mode === 'off' ? 0 : 0.8;
  }

  cycleMode(): SoundMode {
    this.mode = nextSoundMode(this.mode);
    try {
      localStorage.setItem(STORE_KEY, this.mode);
    } catch {
      // a convenience only: the choice just lasts until reload
    }
    this.applyMode();
    return this.mode;
  }

  /** Play an effect; `gap` keeps a repeating one from machine-gunning. */
  play(name: SfxName, gap = 0): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.mode === 'off') return;
    if (ctx.currentTime - (this.lastPlayed.get(name) ?? -1e9) < gap) return;
    this.lastPlayed.set(name, ctx.currentTime);
    for (const voice of SFX[name]) playVoice(ctx, this.effects, voice, ctx.currentTime);
  }

  /** 0 is stopped, 1 is top speed. */
  engine(level: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const l = Math.max(0, Math.min(1, level));
    this.motor.osc.frequency.setTargetAtTime(38 + 62 * l, ctx.currentTime, 0.12);
    this.motor.filter.frequency.setTargetAtTime(160 + 420 * l, ctx.currentTime, 0.12);
    this.motor.gain.gain.setTargetAtTime(l > 0.02 ? 0.05 + 0.07 * l : 0, ctx.currentTime, 0.1);
  }

  /** Call every frame: switches the music with the mood and keeps it scheduled. */
  update(mood: Mood | null): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (mood !== this.mood) {
      this.mood = mood;
      this.step = 0;
      this.nextAt = ctx.currentTime + 0.05;
    }
    if (!mood || this.mode !== 'all') {
      this.nextAt = ctx.currentTime + 0.05;
      return;
    }
    // after a stall (a hidden tab) carry on from now instead of catching up
    if (this.nextAt < ctx.currentTime) this.nextAt = ctx.currentTime + 0.05;
    while (this.nextAt < ctx.currentTime + AHEAD) {
      for (const note of notesAt(mood, this.step)) playNote(ctx, this.music, note, this.nextAt);
      this.nextAt += MOODS[mood].stepSeconds;
      this.step++;
    }
  }
}

export const sound = new Sound();
