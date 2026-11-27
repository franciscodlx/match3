import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { GameScreen } from './src/game/GameScreen';
import { LEVELS } from '@match3/levels';
import { colors } from './src/theme';

// Straight into the game for now. The level map (and Expo Router) arrive in iteration 3.
export default function App() {
  const [levelIndex, setLevelIndex] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const level = LEVELS[levelIndex];

  return (
    <GestureHandlerRootView style={styles.root}>
      <GameScreen
        // A new key remounts the screen: fresh game from the level's seed.
        key={`${level.id}-${attempt}`}
        level={level}
        hasNext={levelIndex < LEVELS.length - 1}
        onRetry={() => setAttempt((n) => n + 1)}
        onNext={() => {
          setLevelIndex((i) => Math.min(i + 1, LEVELS.length - 1));
          setAttempt(0);
        }}
        onSkip={() => {
          setLevelIndex((i) => (i + 1) % LEVELS.length);
          setAttempt(0);
        }}
      />
      <StatusBar style="light" />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
