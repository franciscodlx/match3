// Local notifications (no push). The plan comes from @match3/meta; here we only talk to the OS:
// ask permission at a moment that makes sense, and re-schedule the whole plan whenever the app
// leaves the foreground.
import { Alert, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import { planNotifications } from '@match3/meta';
import { devClock, now } from './clock';
import { getProgress } from './progress';

// While the app is open the map already shows lives and rewards: stay quiet, except dev tests.
Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const show = n.request.content.data?.test === true;
    return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false };
  },
});

async function granted() {
  const p = await Notifications.getPermissionsAsync();
  return p.granted;
}

/** Asks once, when the player just did something a reminder helps with (e.g. first daily claim). */
export async function askPermissionOnce() {
  const p = await Notifications.getPermissionsAsync();
  if (p.granted || !p.canAskAgain) return p.granted;
  const r = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
  return r.granted;
}

/** From the settings switch: ask, or explain how to enable it if iOS won't ask again. */
export async function enableFromSettings() {
  if (await askPermissionOnce()) return true;
  Alert.alert('Notificaciones desactivadas', 'Actívalas en Ajustes de iOS para recibir avisos de vidas y recompensas.', [
    { text: 'Ahora no', style: 'cancel' },
    { text: 'Abrir Ajustes', onPress: () => Linking.openSettings() },
  ]);
  return false;
}

/** Replaces every pending notification with the current plan. */
export async function syncNotifications() {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!(await granted())) return;
    // The plan is in app time; the OS schedules in real time (they differ only under the dev clock).
    const shift = devClock.offset();
    for (const n of planNotifications(getProgress(), now(), -new Date(now()).getTimezoneOffset())) {
      const at = n.at - shift;
      if (at <= Date.now() + 1000) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: n.kind,
        content: { title: n.title, body: n.body, data: { kind: n.kind } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
      });
    }
  } catch {
    // Notifications are a nicety: never let them break the game.
  }
}

// ── Dev tools (Ajustes) ──
export async function devTestNotification() {
  if (!(await askPermissionOnce())) return Alert.alert('Sin permiso de notificaciones');
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Prueba de Match3', body: 'Las notificaciones locales funcionan ✓', data: { test: true } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5 },
  });
}

export async function devListPending() {
  await syncNotifications();
  const list = await Notifications.getAllScheduledNotificationsAsync();
  const fmt = (ms: number) => new Date(ms).toLocaleString('es-MX', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  const lines = await Promise.all(
    list.map(async (r) => `${fmt((await Notifications.getNextTriggerDateAsync(r.trigger as never)) ?? 0)} — ${r.content.title}`),
  );
  Alert.alert(`Pendientes (${list.length})`, lines.join('\n') || 'Ninguna (¿sin permiso?)');
}
