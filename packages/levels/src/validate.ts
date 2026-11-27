import { COLORS, SIZE, type Goal, type Level } from '@match3/game-core';

/** Checks raw level data (from JSON, a CDN, anywhere) and returns it typed. Throws with the level id on error. */
export function validateLevels(raw: unknown): Level[] {
  if (!Array.isArray(raw)) throw new Error('levels: expected an array');
  const ids = new Set<string>();
  return raw.map((l: any, i) => {
    const where = `level ${l?.id ?? `#${i}`}`;
    const fail = (msg: string): never => {
      throw new Error(`${where}: ${msg}`);
    };
    if (typeof l?.id !== 'string' || !l.id) fail('id must be a non-empty string');
    if (ids.has(l.id)) fail('duplicate id');
    ids.add(l.id);
    if (typeof l.seed !== 'string' && typeof l.seed !== 'number') fail('seed must be a string or number');
    if (!Number.isInteger(l.moves) || l.moves < 1) fail('moves must be a positive integer');
    const colors = l.colors ?? COLORS;
    if (!Number.isInteger(colors) || colors < 3 || colors > COLORS) fail(`colors must be 3..${COLORS}`);
    if (!Array.isArray(l.goals) || l.goals.length === 0) fail('needs at least one goal');
    for (const g of l.goals as Goal[]) {
      if (g.type === 'score') {
        if (!(g.target > 0)) fail('score goal needs target > 0');
      } else if (g.type === 'collect') {
        if (!Number.isInteger(g.color) || g.color < 0 || g.color >= colors) fail(`collect color must be 0..${colors - 1}`);
        if (!(g.count > 0)) fail('collect goal needs count > 0');
      } else if (g.type === 'jelly') {
        if (!l.jelly) fail('jelly goal without a jelly map');
      } else fail(`unknown goal type ${(g as any).type}`);
    }
    if (l.jelly !== undefined) {
      if (!Array.isArray(l.jelly) || l.jelly.length !== SIZE) fail(`jelly must be ${SIZE} rows`);
      for (const row of l.jelly) if (typeof row !== 'string' || !new RegExp(`^[.12]{${SIZE}}$`).test(row)) fail(`bad jelly row "${row}"`);
    }
    if (l.stars !== undefined) {
      const s = l.stars;
      if (!Array.isArray(s) || s.length !== 3 || !(s[0] <= s[1] && s[1] <= s[2])) fail('stars must be 3 ascending scores');
    }
    return l as Level;
  });
}
