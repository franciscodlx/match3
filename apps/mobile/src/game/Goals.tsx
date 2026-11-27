import { StyleSheet, Text, View } from 'react-native';
import type { GoalProgress } from '@match3/game-core';
import { PIECE_COLORS, colors as theme } from '../theme';

const fmt = (n: number) => n.toLocaleString('es-MX');

/** The level's goals as compact chips: icon + current/target, green check when done. */
export function Goals({ goals }: { goals: GoalProgress[] }) {
  return (
    <View style={styles.row}>
      {goals.map((p, i) => (
        <View key={i} style={[styles.chip, p.done && styles.chipDone]}>
          {p.goal.type === 'collect' && <View style={[styles.swatch, { backgroundColor: PIECE_COLORS[p.goal.color] }]} />}
          {p.goal.type === 'jelly' && <View style={[styles.swatch, styles.jelly]} />}
          {p.goal.type === 'score' && <Text style={styles.icon}>★</Text>}
          <Text style={[styles.text, p.done && styles.textDone]}>
            {p.done
              ? '✓'
              : p.goal.type === 'jelly'
                ? `${p.target - p.current}`
                : `${fmt(p.current)}/${fmt(p.target)}`}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.surfaceHi, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  chipDone: { backgroundColor: 'rgba(61,220,151,0.18)' },
  swatch: { width: 16, height: 16, borderRadius: 4 },
  jelly: { backgroundColor: 'rgba(255,122,198,0.55)', borderWidth: 1, borderColor: '#FF7AC6' },
  icon: { color: '#FFB400', fontSize: 15, fontWeight: '900' },
  text: { color: theme.text, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  textDone: { color: theme.good },
});
