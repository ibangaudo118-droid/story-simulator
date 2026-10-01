/**
 * Keyed, counter-free randomness.
 *
 * Every random draw is derived from (seed, ...key) — e.g. (seed, day, "event", "data-leak-rumor").
 * Nothing shares a global stream, so a change in one character's decisions can never shift
 * the dice that some other system rolls. That is what makes divergence tests meaningful:
 * if two runs differ, it is because STATE differed, not because an RNG stream desynced.
 */
export function hashSeed(...parts: (string | number)[]): number {
  let h = 2166136261 >>> 0;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

export interface Rng {
  next(): number;
  int(n: number): number;
  chance(p: number): boolean;
  noise(amp: number): number;
}

export function makeRng(...parts: (string | number)[]): Rng {
  let a = hashSeed(...parts);
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n) => Math.floor(next() * n),
    chance: (p) => next() < p,
    noise: (amp) => (next() * 2 - 1) * amp,
  };
}
