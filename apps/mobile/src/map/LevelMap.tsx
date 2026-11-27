// Level map: a winding path from the bottom (level 1) upwards, like the genre's saga maps.
// The path is one Skia canvas behind plain RN buttons, so nodes stay tappable and accessible.
import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Canvas, DashPathEffect, Path, Skia } from '@shopify/react-native-skia';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { LEVELS } from '@match3/levels';
import { canPlay, claimDaily, currentLevel, dailyStatus, isUnlocked, livesAt, totalStars } from '@match3/meta';
import { feedback } from '../game/feedback';
import { formatWait, now, today, useNow } from '../store/clock';
import { getProgress, setProgress, useProgress } from '../store/progress';
import { DailyRewardModal, LivesModal } from './Modals';
import { askPermissionOnce } from '../store/notifications';
import { playlog } from '../game/playlog';
import { colors as theme } from '../theme';

const ORDER = LEVELS.map((l) => l.id);
const NODE = 68;
const STEP = 112; // vertical distance between levels
const PAD = 80; // space above the last and below the first level
const dailyClaimable = () => dailyStatus(getProgress(), today()).claimable;

export function LevelMap() {
  const progress = useProgress();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const current = currentLevel(progress, ORDER);
  const t = useNow();
  const lives = livesAt(progress, t);
  const daily = dailyStatus(progress, today());
  const [dailyOpen, setDailyOpen] = useState(false);
  const { nolives } = useLocalSearchParams<{ nolives?: string }>();
  const [noLivesOpen, setNoLivesOpen] = useState(nolives === '1');

  // Offer the daily reward whenever the map is shown or the app comes back to the foreground.
  const offerDaily = useCallback(() => {
    if (dailyClaimable()) setDailyOpen(true);
  }, [setDailyOpen]);
  useFocusEffect(offerDaily);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => st === 'active' && offerDaily());
    return () => sub.remove();
  }, [offerDaily]);

  const play = (id: string) => {
    if (!canPlay(progress, now())) {
      playlog({ type: 'session', event: 'no-lives', nextInMin: Math.ceil((lives.nextIn ?? 0) / 60000) });
      return setNoLivesOpen(true);
    }
    router.push({ pathname: '/level/[id]', params: { id } });
  };
  const contentH = PAD * 2 + STEP * (ORDER.length - 1);
  // Level i (0-based) sits at the bottom for i=0; x swings left and right around the center.
  const pos = (i: number) => ({ x: width / 2 + Math.sin(i * 1.1) * width * 0.26, y: contentH - PAD - i * STEP });

  const path = Skia.PathBuilder.Make();
  ORDER.forEach((_, i) => {
    const { x, y } = pos(i);
    if (i === 0) path.moveTo(x, y);
    else {
      const prev = pos(i - 1);
      path.cubicTo(prev.x, prev.y - STEP / 2, x, y + STEP / 2, x, y);
    }
  });
  const trail = path.detach();

  const curIndex = ORDER.indexOf(current);
  // Open the map with the current level a bit below the middle of the screen.
  const startY = Math.max(0, Math.min(contentH - height, pos(curIndex).y - height * 0.6));

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.pills}>
          <Pressable style={styles.pill} onPress={() => setNoLivesOpen(true)}>
            <Text style={styles.pillHeart}>♥</Text>
            <Text style={styles.pillText}>
              {lives.count}
              {!lives.full && <Text style={styles.pillDim}> · {formatWait(lives.nextIn ?? 0)}</Text>}
            </Text>
          </Pressable>
          <View style={styles.pill}>
            <Text style={styles.pillText}>🪙 {progress.coins}</Text>
          </View>
          <Pressable style={[styles.pill, daily.claimable && styles.pillHot]} onPress={() => setDailyOpen(true)}>
            <Text style={styles.pillText}>{daily.claimable ? '🎁' : `🔥 ${progress.daily.streak}`}</Text>
          </Pressable>
          <View style={styles.pill}>
            <Text style={styles.stars}>
              ★ {totalStars(progress)}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Pressable onPress={() => router.push('/settings')} hitSlop={10} accessibilityLabel="Ajustes">
            <Text style={styles.gear}>⚙︎</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentOffset={{ x: 0, y: startY }} showsVerticalScrollIndicator={false}>
        <View style={{ height: contentH }}>
          <Canvas style={StyleSheet.absoluteFill}>
            <Path path={trail} style="stroke" strokeWidth={10} strokeCap="round" color={theme.surfaceHi}>
              <DashPathEffect intervals={[2, 22]} />
            </Path>
          </Canvas>
          {ORDER.map((id, i) => {
            const { x, y } = pos(i);
            const open = isUnlocked(progress, ORDER, id);
            const stars = progress.levels[id]?.stars ?? 0;
            return (
              <View key={id} style={[styles.nodeWrap, { left: x - NODE / 2, top: y - NODE / 2 }]}>
                {id === current && <Pulse />}
                <Pressable
                  onPress={open ? () => play(id) : undefined}
                  onLongPress={__DEV__ && !open ? () => play(id) : undefined} // dev: play locked levels
                  accessibilityLabel={`Nivel ${id}${open ? '' : ', bloqueado'}`}
                  style={[styles.node, !open && styles.nodeLocked, id === current && styles.nodeCurrent]}
                >
                  <Text style={[styles.nodeText, !open && styles.nodeTextLocked]}>{open ? id : '🔒'}</Text>
                </Pressable>
                <Text style={styles.nodeStars}>
                  {[1, 2, 3].map((n) => (
                    <Text key={n} style={n <= stars ? styles.starOn : styles.starOff}>
                      ★
                    </Text>
                  ))}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable style={[styles.playBtn, lives.count === 0 && styles.playBtnOff]} onPress={() => play(current)}>
          <Text style={styles.playText}>
            {lives.count > 0 ? `Jugar · Nivel ${current}` : `Sin vidas · ${formatWait(lives.nextIn ?? 0)}`}
          </Text>
        </Pressable>
      </View>

      <DailyRewardModal
        visible={dailyOpen}
        daily={daily}
        onClose={() => setDailyOpen(false)}
        onClaim={() => {
          setProgress((p) => claimDaily(p, today()) ?? p);
          playlog({ type: 'session', event: 'daily', day: daily.day, streak: daily.streak, coins: daily.coins });
          feedback.win();
          setDailyOpen(false);
          // The moment a reminder makes sense: "we'll tell you when tomorrow's reward is ready".
          // Asked after the overlay has faded out, so the system alert never overlaps it.
          setTimeout(() => askPermissionOnce(), 400);
        }}
      />
      <LivesModal visible={noLivesOpen} lives={lives} onClose={() => setNoLivesOpen(false)} />
    </View>
  );
}

function Pulse() {
  const s = useSharedValue(1);
  useEffect(() => {
    s.value = withRepeat(withTiming(1.35, { duration: 900 }), -1, false);
  }, [s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }], opacity: 1.35 - s.value }));
  return <Animated.View pointerEvents="none" style={[styles.pulse, style]} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 10,
    backgroundColor: theme.bg,
    zIndex: 1,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  pills: { flexDirection: 'row', gap: 6, flexShrink: 1, flexWrap: 'wrap' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.surface,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillHot: { backgroundColor: theme.accent },
  pillHeart: { color: theme.bad, fontSize: 16, fontWeight: '900' },
  pillText: { color: theme.text, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  pillDim: { color: theme.textDim, fontWeight: '600' },
  stars: { color: '#FFB400', fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  gear: { color: theme.textDim, fontSize: 26 },
  nodeWrap: { position: 'absolute', width: NODE, alignItems: 'center' },
  node: {
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    backgroundColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  nodeCurrent: { backgroundColor: theme.good, borderColor: '#FFFFFF' },
  nodeLocked: { backgroundColor: theme.surface, borderColor: theme.surfaceHi },
  nodeText: { color: '#FFFFFF', fontSize: 24, fontWeight: '900' },
  nodeTextLocked: { fontSize: 20 },
  nodeStars: { marginTop: 2, fontSize: 15, letterSpacing: 1 },
  starOn: { color: '#FFB400' },
  starOff: { color: theme.surfaceHi },
  pulse: {
    position: 'absolute',
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    borderWidth: 3,
    borderColor: theme.good,
  },
  footer: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: theme.bg },
  playBtn: { backgroundColor: theme.good, borderRadius: 28, paddingVertical: 16, alignItems: 'center' },
  playBtnOff: { backgroundColor: theme.surfaceHi },
  playText: { color: '#0F1220', fontSize: 18, fontWeight: '900' },
});
