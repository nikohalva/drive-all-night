export type Rng = () => number;

/** mulberry32: small, fast, deterministic PRNG. Values are in [0, 1). */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic hash of integer coordinates, in [0, 1). */
export function hash2(seed: number, x: number, y: number): number {
  let h = Math.imul(seed | 0, 0x9e3779b1);
  h ^= Math.imul(x | 0, 374761393);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h ^= Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** A fresh uint32 seed for a new world. */
export function randomSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0];
}
