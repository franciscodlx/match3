import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claimDaily, loseLife } from './economy.ts';
import { planNotifications, outOfQuietHours } from './notifications.ts';
import { emptyProgress, updateSettings } from './progress.ts';

const MX = -360; // Mexico City, UTC-6
/** ms epoch of a local wall-clock time in Mexico City. */
const mx = (day: string, h: number, m = 0) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), h, m) + 6 * 3_600_000;
const kinds = (ns: { kind: string }[]) => ns.map((n) => n.kind);

test('new player in the afternoon: only tonight’s reward reminder', () => {
  const plan = planNotifications(emptyProgress(), mx('2026-11-27', 15), MX);
  assert.deepEqual(kinds(plan), ['daily-reminder']);
  assert.equal(plan[0].at, mx('2026-11-27', 19));
});

test('reward still unclaimed after 19:00: remind tomorrow morning instead', () => {
  const plan = planNotifications(emptyProgress(), mx('2026-11-27', 21), MX);
  assert.equal(plan[0].at, mx('2026-11-28', 10));
});

test('claimed today: tomorrow’s reward at 10:00, and a streak warning at 20:00 once the streak is 2+', () => {
  let p = claimDaily(emptyProgress(), '2026-11-26')!;
  p = claimDaily(p, '2026-11-27')!;
  const plan = planNotifications(p, mx('2026-11-27', 15), MX);
  assert.deepEqual(kinds(plan), ['daily-ready', 'streak-risk']);
  assert.equal(plan[0].at, mx('2026-11-28', 10));
  assert.equal(plan[1].at, mx('2026-11-28', 20));
  assert.match(plan[1].title, /racha de 2 días/);
  // A streak of 1 is not worth a warning.
  assert.deepEqual(kinds(planNotifications(claimDaily(emptyProgress(), '2026-11-27')!, mx('2026-11-27', 15), MX)), ['daily-ready']);
});

test('lives: notify when they are full again, never during quiet hours', () => {
  const t = mx('2026-11-27', 15);
  const p = claimDaily(loseLife(loseLife(emptyProgress(), t), t), '2026-11-27')!;
  const lives = planNotifications(p, t, MX).find((n) => n.kind === 'lives-full')!;
  assert.equal(lives.at, t + 60 * 60_000);
  const late = mx('2026-11-27', 21, 50); // full at 22:50 → moved to 09:00 next day
  const q = claimDaily(loseLife(loseLife(emptyProgress(), late), late), '2026-11-27')!;
  assert.equal(planNotifications(q, late, MX).find((n) => n.kind === 'lives-full')!.at, mx('2026-11-28', 9));
});

test('quiet hours: after midnight moves to 09:00 the same day', () => {
  assert.equal(outOfQuietHours(mx('2026-11-28', 3), MX), mx('2026-11-28', 9));
  assert.equal(outOfQuietHours(mx('2026-11-28', 12), MX), mx('2026-11-28', 12));
});

test('notifications off: nothing planned', () => {
  const p = updateSettings(loseLife(emptyProgress(), mx('2026-11-27', 15)), { notifications: false });
  assert.deepEqual(planNotifications(p, mx('2026-11-27', 15), MX), []);
});
