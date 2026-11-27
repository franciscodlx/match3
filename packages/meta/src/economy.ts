// Lives, coins and the daily reward: the session loop around the levels.
// Every function takes the time explicitly (`now` in ms, `today` as a local YYYY-MM-DD), so the
// rules are testable without a device and the app decides what "now" is (dev builds can fake it).
import { MAX_LIVES, type Progress } from './progress.ts';

export const LIFE_REGEN_MS = 30 * 60 * 1000;
export const CONTINUE_COST = 150; // coins for +5 moves after losing
/** Coins per daily-reward day of the 7-day cycle; day 7 also refills lives. */
export const DAILY_COINS = [50, 75, 100, 125, 150, 200, 300];

export type LivesView = { count: number; full: boolean; nextIn: number | null; fullIn: number | null };

/** Lives right now, counting what regenerated since `since`. Clock set backwards never grants lives. */
export function livesAt(p: Progress, now: number): LivesView {
  const { count, since } = p.lives;
  if (count >= MAX_LIVES) return { count: MAX_LIVES, full: true, nextIn: null, fullIn: null };
  const elapsed = Math.max(0, now - since);
  const gained = Math.floor(elapsed / LIFE_REGEN_MS);
  const lives = Math.min(MAX_LIVES, count + gained);
  if (lives >= MAX_LIVES) return { count: MAX_LIVES, full: true, nextIn: null, fullIn: null };
  const nextIn = LIFE_REGEN_MS - (elapsed % LIFE_REGEN_MS);
  return { count: lives, full: false, nextIn, fullIn: nextIn + (MAX_LIVES - lives - 1) * LIFE_REGEN_MS };
}

/** Folds regenerated lives into the stored count, keeping the partial progress towards the next one. */
function settleLives(p: Progress, now: number): Progress {
  const { count, since } = p.lives;
  if (count >= MAX_LIVES) return p;
  if (now < since) return { ...p, lives: { count, since: now } }; // clock went back: restart the wait
  const gained = Math.floor((now - since) / LIFE_REGEN_MS);
  const lives = Math.min(MAX_LIVES, count + gained);
  return { ...p, lives: lives >= MAX_LIVES ? { count: MAX_LIVES, since: 0 } : { count: lives, since: since + gained * LIFE_REGEN_MS } };
}

export const canPlay = (p: Progress, now: number) => livesAt(p, now).count > 0;

/** Losing a level (or quitting one mid-game) costs a life. Losing from full starts the regen clock. */
export function loseLife(p: Progress, now: number): Progress {
  const s = settleLives(p, now);
  if (s.lives.count <= 0) return s;
  const since = s.lives.count >= MAX_LIVES ? now : s.lives.since;
  return { ...s, lives: { count: s.lives.count - 1, since } };
}

export const refillLives = (p: Progress): Progress => ({ ...p, lives: { count: MAX_LIVES, since: 0 } });

/** Coins for a win: more stars, more coins. */
export const winCoins = (stars: number) => 10 + 10 * stars;
export const addCoins = (p: Progress, n: number): Progress => ({ ...p, coins: p.coins + Math.max(0, n) });

/** Pays for something. Returns null when the player can't afford it. */
export function spendCoins(p: Progress, n: number): Progress | null {
  return p.coins >= n ? { ...p, coins: p.coins - n } : null;
}

// ── Daily reward and streak ──

const dayNumber = (day: string) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / 86_400_000;

/** The local calendar day of a moment, as YYYY-MM-DD. `offsetMin` = minutes east of UTC. */
export function localDay(now: number, offsetMin: number): string {
  return new Date(now + offsetMin * 60_000).toISOString().slice(0, 10);
}

export type DailyView = { claimable: boolean; streak: number; day: number; coins: number; refillsLives: boolean };

/**
 * What today's reward is. Claiming on consecutive days grows the streak; missing a day restarts it
 * at day 1. `day` is the position in the 7-day cycle (1..7) of today's (or, if claimed, the last) claim.
 */
export function dailyStatus(p: Progress, today: string): DailyView {
  const { streak, last } = p.daily;
  const gap = last === null ? Infinity : dayNumber(today) - dayNumber(last);
  const claimable = gap >= 1; // gap < 0 = clock moved back: wait for the stored day
  const nextStreak = !claimable ? streak : gap === 1 ? streak + 1 : 1;
  const day = ((Math.max(1, nextStreak) - 1) % DAILY_COINS.length) + 1;
  return { claimable, streak: nextStreak, day, coins: DAILY_COINS[day - 1], refillsLives: day === DAILY_COINS.length };
}

export function claimDaily(p: Progress, today: string): Progress | null {
  const d = dailyStatus(p, today);
  if (!d.claimable) return null;
  const paid = addCoins({ ...p, daily: { streak: d.streak, last: today } }, d.coins);
  return d.refillsLives ? refillLives(paid) : paid;
}
