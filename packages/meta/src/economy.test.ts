import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTINUE_COST,
  LIFE_REGEN_MS,
  canPlay,
  claimDaily,
  dailyStatus,
  livesAt,
  localDay,
  loseLife,
  spendCoins,
  winCoins,
  addCoins,
} from './economy.ts';
import { MAX_LIVES, emptyProgress, parseProgress } from './progress.ts';

const T0 = Date.UTC(2026, 10, 27, 12, 0, 0);
const MIN = 60_000;

test('a new player has full lives', () => {
  assert.deepEqual(livesAt(emptyProgress(), T0), { count: 5, full: true, nextIn: null, fullIn: null });
});

test('losing costs a life and starts a 30-minute regen clock', () => {
  const p = loseLife(emptyProgress(), T0);
  assert.equal(livesAt(p, T0).count, 4);
  assert.equal(livesAt(p, T0).nextIn, LIFE_REGEN_MS);
  assert.equal(livesAt(p, T0 + 29 * MIN).count, 4);
  assert.equal(livesAt(p, T0 + 30 * MIN).count, 5);
});

test('lives regenerate one at a time and keep partial progress across losses', () => {
  let p = emptyProgress();
  for (let i = 0; i < 3; i++) p = loseLife(p, T0); // 2 left, clock started at T0
  p = loseLife(p, T0 + 40 * MIN); // +1 regenerated at 30', then lost: 2, next one at 60'
  const v = livesAt(p, T0 + 40 * MIN);
  assert.equal(v.count, 2);
  assert.equal(v.nextIn, 20 * MIN);
  assert.equal(v.fullIn, 20 * MIN + 2 * LIFE_REGEN_MS);
  assert.equal(livesAt(p, T0 + 120 * MIN).count, 5);
});

test('with no lives left you cannot play, and lives never go negative', () => {
  let p = emptyProgress();
  for (let i = 0; i < 7; i++) p = loseLife(p, T0);
  assert.equal(p.lives.count, 0);
  assert.equal(canPlay(p, T0), false);
  assert.equal(canPlay(p, T0 + LIFE_REGEN_MS), true);
});

test('moving the clock back never grants lives', () => {
  const p = loseLife(emptyProgress(), T0);
  assert.equal(livesAt(p, T0 - 10 * 60 * MIN).count, 4);
  const q = loseLife(p, T0 - 60 * MIN); // played with the clock an hour behind
  assert.equal(q.lives.count, 3);
  assert.equal(livesAt(q, T0 - 60 * MIN + LIFE_REGEN_MS).count, 4);
});

test('coins: wins pay by stars, continues cost coins', () => {
  assert.deepEqual([1, 2, 3].map(winCoins), [20, 30, 40]);
  const p = addCoins(emptyProgress(), 100);
  assert.equal(spendCoins(p, CONTINUE_COST), null);
  assert.equal(spendCoins(addCoins(p, 50), CONTINUE_COST)!.coins, 0);
});

test('daily reward: once per day, streak grows on consecutive days', () => {
  let p = emptyProgress();
  assert.deepEqual(dailyStatus(p, '2026-11-27'), { claimable: true, streak: 1, day: 1, coins: 50, refillsLives: false });
  p = claimDaily(p, '2026-11-27')!;
  assert.equal(p.coins, 50);
  assert.equal(claimDaily(p, '2026-11-27'), null);
  assert.equal(dailyStatus(p, '2026-11-27').claimable, false);
  p = claimDaily(p, '2026-11-28')!;
  assert.equal(p.daily.streak, 2);
  assert.equal(p.coins, 125);
});

test('daily reward: missing a day restarts the streak', () => {
  let p = claimDaily(claimDaily(emptyProgress(), '2026-11-27')!, '2026-11-28')!;
  p = claimDaily(p, '2026-11-30')!;
  assert.equal(p.daily.streak, 1);
});

test('daily reward: day 7 refills lives, then the cycle restarts while the streak keeps counting', () => {
  let p = loseLife(loseLife(emptyProgress(), T0), T0);
  for (let d = 1; d <= 7; d++) p = claimDaily(p, `2026-12-0${d}`)!;
  assert.equal(p.lives.count, MAX_LIVES);
  assert.equal(p.coins, 50 + 75 + 100 + 125 + 150 + 200 + 300);
  assert.deepEqual(dailyStatus(p, '2026-12-08'), { claimable: true, streak: 8, day: 1, coins: 50, refillsLives: false });
});

test('daily reward: across month/year boundaries, and a clock set back waits', () => {
  const p = claimDaily(emptyProgress(), '2026-12-31')!;
  assert.equal(dailyStatus(p, '2027-01-01').streak, 2);
  assert.equal(dailyStatus(p, '2026-12-30').claimable, false);
});

test('local day follows the player time zone', () => {
  const lateUtc = Date.UTC(2026, 10, 28, 3, 0); // 03:00 UTC = 21:00 the day before in Mexico City
  assert.equal(localDay(lateUtc, -360), '2026-11-27');
  assert.equal(localDay(lateUtc, 0), '2026-11-28');
});

test('a 3.1 save (no lives/coins/daily) loads with defaults; a 3.2 save round-trips', () => {
  const old = parseProgress(JSON.stringify({ version: 1, levels: { '1': { stars: 2, best: 10, plays: 1, wins: 1 } }, settings: { sound: false, haptics: true } }));
  assert.equal(old.levels['1'].stars, 2);
  assert.deepEqual(old.lives, { count: 5, since: 0 });
  assert.equal(old.coins, 0);
  const p = claimDaily(loseLife(emptyProgress(), T0), '2026-11-27')!;
  assert.deepEqual(parseProgress(JSON.stringify(p)), p);
  assert.deepEqual(parseProgress(JSON.stringify({ ...p, lives: { count: 99, since: 0 }, coins: -5 })).lives, { count: 5, since: 0 });
});
