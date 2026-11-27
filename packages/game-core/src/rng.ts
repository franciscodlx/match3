// Deterministic PRNG (mulberry32). The whole game state is plain data, including the RNG
// state, so a game can be saved, replayed from its seed, or re-simulated on the server.

export type Rng = () => number;

/** Hashes any integer or string seed into a 32-bit RNG state. */
export function seedState(seed: number | string): number {
  const s = String(seed);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A stateful RNG view over `state`; read `.state` back after use to persist it. */
export function rngFrom(state: number): { next: Rng; readonly state: number } {
  let s = state >>> 0;
  return {
    next: () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    get state() {
      return s;
    },
  };
}
