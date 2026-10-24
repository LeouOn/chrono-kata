/** A small seeded generator (mulberry32): the same seed always gives the same data. */
export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(list: readonly T[]): T;
  chance(p: number): boolean;
}

export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (list) => list[Math.floor(next() * list.length)]!,
    chance: (p) => next() < p,
  };
}

/** A stable 32-bit hash of a string (to decorrelate fields that cycle through enum values). */
export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
