import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initFeedback } from '../game/feedback';
import { syncNotifications } from '../store/notifications';
import * as Notifications from 'expo-notifications';
import { playlog } from '../game/playlog';
import { now } from '../store/clock';
import { getProgress } from '../store/progress';
import { livesAt } from '@match3/meta';
import { colors } from '../theme';

export default function RootLayout() {
  useEffect(() => initFeedback(), []);
  // Leaving the app is when reminders matter: schedule them from the latest progress.
  useEffect(() => {
    // Playtest: when sessions start and end, and whether a notification brought the player back.
    let openedAt = Date.now();
    const lives = () => livesAt(getProgress(), now()).count;
    const cold = Notifications.getLastNotificationResponse();
    playlog({ type: 'session', event: 'open', cold: true, via: cold?.notification.request.identifier, lives: lives() });
    let state = AppState.currentState;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && state !== 'active') {
        openedAt = Date.now();
        playlog({ type: 'session', event: 'open', cold: false, lives: lives() });
      } else if (next === 'background' && state !== 'background') {
        playlog({ type: 'session', event: 'close', seconds: Math.round((Date.now() - openedAt) / 1000), lives: lives() });
        syncNotifications();
      }
      state = next;
    });
    const tap = Notifications.addNotificationResponseReceivedListener((r) =>
      playlog({ type: 'session', event: 'notification', kind: r.notification.request.identifier }),
    );
    return () => {
      sub.remove();
      tap.remove();
    };
  }, []);
  return (
    <GestureHandlerRootView style={styles.root}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="index" />
        {/* No swipe-back mid-game: leaving a level is a deliberate tap (it will cost a life). */}
        <Stack.Screen name="level/[id]" options={{ gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
      </Stack>
      <StatusBar style="light" />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.bg } });
