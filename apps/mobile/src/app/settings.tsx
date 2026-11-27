import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { addCoins, livesAt, refillLives, totalStars, updateSettings } from '@match3/meta';
import { devClock, now, today, useNow } from '../store/clock';
import { resetProgress, setProgress, useProgress } from '../store/progress';
import { colors as theme } from '../theme';

export default function Settings() {
  const progress = useProgress();
  const { sound, haptics } = progress.settings;
  const beaten = Object.values(progress.levels).filter((l) => l.wins > 0).length;
  useNow(); // keep the dev clock readout fresh

  const confirmReset = () =>
    Alert.alert('¿Borrar tu progreso?', 'Perderás tus estrellas y los niveles desbloqueados.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: resetProgress },
    ]);

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <Text style={styles.title}>Ajustes</Text>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.done}>Listo</Text>
        </Pressable>
      </View>

      <View style={styles.group}>
        <Row label="Sonido" value={sound} onChange={(v) => setProgress((p) => updateSettings(p, { sound: v }))} />
        <View style={styles.sep} />
        <Row label="Vibración" value={haptics} onChange={(v) => setProgress((p) => updateSettings(p, { haptics: v }))} />
      </View>

      <View style={styles.group}>
        <Text style={styles.info}>
          {beaten} niveles superados · ★ {totalStars(progress)} · 🪙 {progress.coins} · 🔥 {progress.daily.streak}
        </Text>
      </View>

      <Pressable style={[styles.group, styles.danger]} onPress={confirmReset}>
        <Text style={styles.dangerText}>Borrar progreso</Text>
      </Pressable>

      {__DEV__ && (
        <View style={[styles.group, styles.dev]}>
          <Text style={styles.devTitle}>Reloj de prueba (solo desarrollo)</Text>
          <Text style={styles.info}>
            Hoy: {today()} · desfase {Math.round(devClock.offset() / 60000)} min · vidas {livesAt(progress, now()).count}
          </Text>
          <View style={styles.devRow}>
            {[
              ['+30 min', () => devClock.advance(30 * 60_000)],
              ['+1 día', () => devClock.advance(24 * 3600_000)],
              ['Reloj real', () => devClock.reset()],
              ['Vidas llenas', () => setProgress(refillLives)],
              ['+500 🪙', () => setProgress((p) => addCoins(p, 500))],
            ].map(([label, fn]) => (
              <Pressable key={label as string} style={styles.devBtn} onPress={fn as () => void}>
                <Text style={styles.devBtnText}>{label as string}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <Text style={styles.version}>Versión {Constants.expoConfig?.version ?? '—'}</Text>
    </View>
  );
}

function Row({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: theme.accent }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg, padding: 20, gap: 16 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  title: { color: theme.text, fontSize: 28, fontWeight: '900' },
  done: { color: theme.accent, fontSize: 17, fontWeight: '700' },
  group: { backgroundColor: theme.surface, borderRadius: 16, paddingHorizontal: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: theme.surfaceHi },
  label: { color: theme.text, fontSize: 17 },
  info: { color: theme.textDim, fontSize: 15, paddingVertical: 14 },
  danger: { paddingVertical: 14, alignItems: 'center' },
  dangerText: { color: theme.bad, fontSize: 17, fontWeight: '600' },
  dev: { paddingVertical: 12, gap: 6 },
  devTitle: { color: theme.textDim, fontSize: 13, fontWeight: '700' },
  devRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  devBtn: { backgroundColor: theme.surfaceHi, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  devBtnText: { color: theme.text, fontSize: 14, fontWeight: '600' },
  version: { color: theme.textDim, fontSize: 12, textAlign: 'center' },
});
