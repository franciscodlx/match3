import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { GameScreen } from './src/game/GameScreen';
import { LEVELS } from '@match3/levels';
import { colors } from './src/theme';

const newDeal = () => Math.floor(Math.random() * 1e6);

// Straight into the game for now. The level map (and Expo Router) arrive in iteration 3.
export default function App() {
  const [levelIndex, setLevelIndex] = useState(0);
  // Every attempt deals a fresh board: the level (goals, moves, jelly) is fixed, the layout is not.
  // A challenge link (iteration 4) will carry the exact deal instead.
  const [deal, setDeal] = useState(newDeal);
  const level = LEVELS[levelIndex];
  const dealt = { ...level, seed: `${level.seed}#${deal}` };

  return (
    <GestureHandlerRootView style={styles.root}>
      <GameScreen
        // A new key remounts the screen: fresh game from the dealt seed.
        key={`${level.id}-${deal}`}
        level={dealt}
        hasNext={levelIndex < LEVELS.length - 1}
        onRetry={() => setDeal(newDeal())}
        onNext={() => {
          setLevelIndex((i) => Math.min(i + 1, LEVELS.length - 1));
          setDeal(newDeal());
        }}
        onSkip={() => {
          setLevelIndex((i) => (i + 1) % LEVELS.length);
          setDeal(newDeal());
        }}
      />
      <StatusBar style="light" />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
