import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SIZE, COLORS } from '@match3/game-core';

// Iteration 1.1: shell only. The game screen lands in 1.3.
export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <View style={styles.center}>
        <Text style={styles.title}>Match3</Text>
        <Text style={styles.sub}>
          Iteración 1 · tablero {SIZE}x{SIZE}, {COLORS} tipos de pieza
        </Text>
      </View>
      <StatusBar style="light" />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F1220' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { color: '#fff', fontSize: 34, fontWeight: '800' },
  sub: { color: '#9AA3C0', fontSize: 15 },
});
