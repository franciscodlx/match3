// The player's saved progress, outside any single game: results per level and settings.
// Pure and serializable: the app stores it as one JSON string; tests need no device.

export type LevelRecord = { stars: number; best: number; plays: number; wins: number };
export type Settings = { sound: boolean; haptics: boolean };
/** Lives regenerate over time; `since` is when the regen clock started (ms epoch), 0 = full. */
export type Lives = { count: number; since: number };
/** Daily reward: `streak` consecutive days claimed, `last` the local day of the last claim. */
export type Daily = { streak: number; last: string | null };
export type Progress = {
  version: 1;
  levels: Record<string, LevelRecord>;
  settings: Settings;
  lives: Lives;
  coins: number;
  daily: Daily;
};
export type GameResult = { won: boolean; stars: number; score: number };

const DEFAULT_SETTINGS: Settings = { sound: true, haptics: true };
export const MAX_LIVES = 5;

export function emptyProgress(): Progress {
  return {
    version: 1,
    levels: {},
    settings: { ...DEFAULT_SETTINGS },
    lives: { count: MAX_LIVES, since: 0 },
    coins: 0,
    daily: { streak: 0, last: null },
  };
}

/** Folds one finished game into the progress. Stars and best score only ever go up. */
export function recordGame(p: Progress, levelId: string, r: GameResult): Progress {
  const was = p.levels[levelId] ?? { stars: 0, best: 0, plays: 0, wins: 0 };
  const now: LevelRecord = {
    stars: Math.max(was.stars, r.won ? r.stars : 0),
    best: Math.max(was.best, r.won ? r.score : 0),
    plays: was.plays + 1,
    wins: was.wins + (r.won ? 1 : 0),
  };
  return { ...p, levels: { ...p.levels, [levelId]: now } };
}

const beaten = (p: Progress, id: string) => (p.levels[id]?.wins ?? 0) > 0;

/** A level opens once the one before it has been beaten. The first is always open. */
export function isUnlocked(p: Progress, order: string[], id: string): boolean {
  const i = order.indexOf(id);
  return i === 0 || (i > 0 && beaten(p, order[i - 1]));
}

/** Where "play" should take the player: the first open level not yet beaten (or the last one). */
export function currentLevel(p: Progress, order: string[]): string {
  return order.find((id) => !beaten(p, id)) ?? order[order.length - 1];
}

export function totalStars(p: Progress): number {
  return Object.values(p.levels).reduce((s, l) => s + l.stars, 0);
}

export function updateSettings(p: Progress, next: Partial<Settings>): Progress {
  return { ...p, settings: { ...p.settings, ...next } };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isNat = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;

/**
 * Reads stored progress. Anything unreadable falls back to defaults field by field, so a corrupt
 * or older save never crashes the app or wipes what is still valid.
 */
export function parseProgress(raw: string | null | undefined): Progress {
  const out = emptyProgress();
  if (!raw) return out;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return out;
  }
  if (!data || typeof data !== 'object') return out;
  const d = data as { levels?: unknown; settings?: unknown };
  if (d.levels && typeof d.levels === 'object') {
    for (const [id, rec] of Object.entries(d.levels as Record<string, unknown>)) {
      const r = rec as Partial<LevelRecord> | null;
      if (r && isNat(r.stars) && r.stars <= 3 && isNat(r.best) && isNat(r.plays) && isNat(r.wins))
        out.levels[id] = { stars: r.stars, best: r.best, plays: r.plays, wins: r.wins };
    }
  }
  if (d.settings && typeof d.settings === 'object') {
    const s = d.settings as Partial<Settings>;
    if (typeof s.sound === 'boolean') out.settings.sound = s.sound;
    if (typeof s.haptics === 'boolean') out.settings.haptics = s.haptics;
  }
  // Fields added in 3.2: a 3.1 save simply lacks them and gets the defaults.
  const x = data as { lives?: Partial<Lives>; coins?: unknown; daily?: Partial<Daily> };
  if (x.lives && isNat(x.lives.count) && x.lives.count <= MAX_LIVES && isNat(x.lives.since))
    out.lives = { count: x.lives.count, since: x.lives.since };
  if (isNat(x.coins)) out.coins = x.coins;
  if (x.daily && isNat(x.daily.streak) && (x.daily.last === null || (typeof x.daily.last === 'string' && DAY.test(x.daily.last))))
    out.daily = { streak: x.daily.streak, last: x.daily.last };
  return out;
}
