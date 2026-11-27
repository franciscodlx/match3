// Map overlays: the daily reward and the lives wait.
// Plain in-tree overlays, not RN <Modal>: a native modal presented while another screen (the
// settings sheet) or a system alert (notification permission) is animating can fail to appear yet
// stay "open", leaving an invisible layer that eats every touch on the map.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { DAILY_COINS, MAX_LIVES, type DailyView, type LivesView } from '@match3/meta';
import { formatWait } from '../store/clock';
import { colors as theme } from '../theme';

function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  if (!visible) return null;
  return (
    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(140)} style={styles.layer}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Inner Pressable swallows taps so only the backdrop closes. */}
        <Pressable style={styles.card} onPress={() => {}}>
          {children}
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

export function DailyRewardModal({
  visible,
  daily,
  onClaim,
  onClose,
}: {
  visible: boolean;
  daily: DailyView;
  onClaim: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>Recompensa diaria</Text>
      <Text style={styles.dim}>
        {daily.claimable
          ? daily.streak > 1
            ? `🔥 Racha de ${daily.streak} días. ¡No la pierdas!`
            : 'Entra cada día para hacer crecer tu racha.'
          : `🔥 Racha de ${daily.streak} ${daily.streak === 1 ? 'día' : 'días'}. Vuelve mañana.`}
      </Text>
      <View style={styles.days}>
        {DAILY_COINS.map((coins, i) => {
          const day = i + 1;
          const done = daily.claimable ? day < daily.day : day <= daily.day;
          const today = daily.claimable && day === daily.day;
          return (
            <View key={day} style={[styles.day, done && styles.dayDone, today && styles.dayToday, day === 7 && styles.dayBig]}>
              <Text style={styles.dayLabel}>Día {day}</Text>
              <Text style={styles.dayCoins}>{done ? '✓' : `🪙${coins}`}</Text>
              {day === 7 && !done && <Text style={styles.dayLabel}>+ vidas</Text>}
            </View>
          );
        })}
      </View>
      {daily.claimable ? (
        <Pressable style={styles.btn} onPress={onClaim}>
          <Text style={styles.btnText}>
            Reclamar 🪙 {daily.coins}
            {daily.refillsLives ? ' + vidas llenas' : ''}
          </Text>
        </Pressable>
      ) : (
        <Pressable style={[styles.btn, styles.btnGhost]} onPress={onClose}>
          <Text style={styles.btnTextLight}>Cerrar</Text>
        </Pressable>
      )}
    </Sheet>
  );
}

export function LivesModal({ visible, lives, onClose }: { visible: boolean; lives: LivesView; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>{lives.count > 0 ? 'Vidas' : 'Sin vidas'}</Text>
      <Text style={styles.hearts}>{'♥'.repeat(lives.count) + '♡'.repeat(MAX_LIVES - lives.count)}</Text>
      <Text style={styles.dim}>
        {lives.full
          ? 'Tus vidas están llenas.'
          : `Siguiente vida en ${formatWait(lives.nextIn ?? 0)}; llenas en ${formatWait(lives.fullIn ?? 0)}. Se recupera una cada 30 minutos.`}
      </Text>
      <Text style={styles.dim}>Pierdes una vida al perder un nivel o al salir a media partida.</Text>
      <Text style={styles.dim}>La recompensa del día 7 llena tus vidas.</Text>
      <Pressable style={[styles.btn, styles.btnGhost]} onPress={onClose}>
        <Text style={styles.btnTextLight}>Entendido</Text>
      </Pressable>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, zIndex: 10 },
  backdrop: { flex: 1, backgroundColor: 'rgba(8,10,20,0.78)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: theme.surface, borderRadius: 20, padding: 22, gap: 12 },
  title: { color: theme.text, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  dim: { color: theme.textDim, fontSize: 15, textAlign: 'center' },
  hearts: { color: theme.bad, fontSize: 30, textAlign: 'center', letterSpacing: 4 },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginVertical: 4 },
  day: {
    width: 72,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: theme.surfaceHi,
    alignItems: 'center',
    gap: 2,
  },
  dayBig: { width: 152 },
  dayDone: { opacity: 0.45 },
  dayToday: { backgroundColor: theme.accent, borderWidth: 2, borderColor: '#FFFFFF' },
  dayLabel: { color: theme.text, fontSize: 12, fontWeight: '600' },
  dayCoins: { color: '#FFD45C', fontSize: 15, fontWeight: '800' },
  btn: { backgroundColor: theme.good, borderRadius: 24, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  btnGhost: { backgroundColor: theme.surfaceHi },
  btnText: { color: '#0F1220', fontSize: 16, fontWeight: '900' },
  btnTextLight: { color: theme.text, fontSize: 16, fontWeight: '700' },
});
