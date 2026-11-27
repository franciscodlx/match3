// Which local notifications to have pending, given the progress and the time. The app cancels
// everything and schedules this plan each time it goes to the background, so the plan always
// reflects the latest state (claim today → no "your reward is waiting" tonight).
import { MAX_LIVES, type Progress } from './progress.ts';
import { dailyStatus, livesAt, localDay } from './economy.ts';

export type NotificationKind = 'lives-full' | 'daily-reminder' | 'daily-ready' | 'streak-risk';
export type PlannedNotification = { kind: NotificationKind; at: number; title: string; body: string };

const QUIET_FROM = 22; // no notifications from 22:00 …
const QUIET_TO = 9; // … to 09:00 local
const REMINDER_HOUR = 19; // unclaimed reward reminder, same day
const READY_HOUR = 10; // next day's reward is ready
const STREAK_RISK_HOUR = 20; // last call to keep a streak
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** ms epoch of `hour`:00 local time on `day` (YYYY-MM-DD). */
function atLocal(day: string, hour: number, offsetMin: number): number {
  return Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), hour) - offsetMin * 60_000;
}
const nextDay = (day: string) => new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) + DAY).toISOString().slice(0, 10);

/** Moves a moment inside quiet hours to the next 09:00 local. */
export function outOfQuietHours(at: number, offsetMin: number): number {
  const local = new Date(at + offsetMin * 60_000);
  const h = local.getUTCHours();
  if (h >= QUIET_TO && h < QUIET_FROM) return at;
  const day = localDay(at, offsetMin);
  return atLocal(h >= QUIET_FROM ? nextDay(day) : day, QUIET_TO, offsetMin);
}

export function planNotifications(p: Progress, now: number, offsetMin: number): PlannedNotification[] {
  if (!p.settings.notifications) return [];
  const out: PlannedNotification[] = [];
  const today = localDay(now, offsetMin);
  const tomorrow = nextDay(today);

  const lives = livesAt(p, now);
  if (!lives.full && lives.fullIn !== null)
    out.push({
      kind: 'lives-full',
      at: outOfQuietHours(now + lives.fullIn, offsetMin),
      title: '¡Vidas llenas! ♥',
      body: `Tienes tus ${MAX_LIVES} vidas de nuevo. ¿Una partida?`,
    });

  const daily = dailyStatus(p, today);
  if (daily.claimable) {
    // Not claimed today: one reminder this evening, or tomorrow morning if the evening has passed.
    const evening = atLocal(today, REMINDER_HOUR, offsetMin);
    const keepsStreak = daily.streak > 1;
    out.push({
      kind: 'daily-reminder',
      at: evening > now ? evening : atLocal(tomorrow, READY_HOUR, offsetMin),
      title: keepsStreak ? `🔥 Tu racha de ${daily.streak - 1} días te espera` : '🎁 Tu recompensa diaria te espera',
      body: keepsStreak && evening > now ? `Reclama hoy 🪙 ${daily.coins} y llega a ${daily.streak} días.` : `Hoy te tocan 🪙 ${daily.coins}.`,
    });
  } else {
    const next = dailyStatus(p, tomorrow);
    out.push({
      kind: 'daily-ready',
      at: atLocal(tomorrow, READY_HOUR, offsetMin),
      title: '🎁 Nueva recompensa lista',
      body: next.refillsLives ? `Día 7: 🪙 ${next.coins} y vidas llenas.` : `Día ${next.day}: 🪙 ${next.coins}.`,
    });
    if (p.daily.streak >= 2)
      out.push({
        kind: 'streak-risk',
        at: atLocal(tomorrow, STREAK_RISK_HOUR, offsetMin),
        title: `🔥 Tu racha de ${p.daily.streak} días está en riesgo`,
        body: 'Entra antes de medianoche para no perderla.',
      });
  }
  return out.filter((n) => n.at > now).sort((a, b) => a.at - b.at);
}
