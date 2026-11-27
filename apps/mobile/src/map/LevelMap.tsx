// Level map: a winding path from the bottom (level 1) upwards, like the genre's saga maps.
// The path is one Skia canvas behind plain RN buttons, so nodes stay tappable and accessible.
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Canvas, DashPathEffect, Path, Skia } from '@shopify/react-native-skia';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LEVELS } from '@match3/levels';
import { currentLevel, isUnlocked, totalStars } from '@match3/meta';
import { useProgress } from '../store/progress';
import { colors as theme } from '../theme';

const ORDER = LEVELS.map((l) => l.id);
const NODE = 68;
const STEP = 112; // vertical distance between levels
const PAD = 80; // space above the last and below the first level

export function LevelMap() {
  const progress = useProgress();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const current = currentLevel(progress, ORDER);
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
        <Text style={styles.title}>Match3</Text>
        <View style={styles.headerRight}>
          <Text style={styles.stars}>
            ★ {totalStars(progress)} / {ORDER.length * 3}
          </Text>
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
            const play = () => router.push({ pathname: '/level/[id]', params: { id } });
            return (
              <View key={id} style={[styles.nodeWrap, { left: x - NODE / 2, top: y - NODE / 2 }]}>
                {id === current && <Pulse />}
                <Pressable
                  onPress={open ? play : undefined}
                  onLongPress={__DEV__ && !open ? play : undefined} // dev: play locked levels
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
        <Pressable style={styles.playBtn} onPress={() => router.push({ pathname: '/level/[id]', params: { id: current } })}>
          <Text style={styles.playText}>Jugar · Nivel {current}</Text>
        </Pressable>
      </View>
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
  title: { color: theme.text, fontSize: 26, fontWeight: '900' },
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
  playText: { color: '#0F1220', fontSize: 18, fontWeight: '900' },
});
