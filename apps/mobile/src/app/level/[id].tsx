import { useState } from 'react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { LEVELS } from '@match3/levels';
import { isUnlocked, recordGame } from '@match3/meta';
import { GameScreen } from '../../game/GameScreen';
import { getProgress, setProgress } from '../../store/progress';

const ORDER = LEVELS.map((l) => l.id);
const newDeal = () => Math.floor(Math.random() * 1e6);

export default function LevelRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Every attempt deals a fresh board: goals, moves and jelly are fixed, the layout is not.
  // A challenge link (iteration 4) will carry the exact deal instead.
  const [deal, setDeal] = useState(newDeal);
  const index = LEVELS.findIndex((l) => l.id === id);
  if (index < 0 || (!__DEV__ && !isUnlocked(getProgress(), ORDER, id))) return <Redirect href="/" />;

  const level = LEVELS[index];
  const next = LEVELS[index + 1];
  return (
    <GameScreen
      key={`${level.id}-${deal}`}
      level={{ ...level, seed: `${level.seed}#${deal}` }}
      hasNext={!!next}
      onFinish={(r) => setProgress((p) => recordGame(p, level.id, r))}
      onRetry={() => setDeal(newDeal())}
      onNext={() => next && router.replace({ pathname: '/level/[id]', params: { id: next.id } })}
      onExit={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    />
  );
}
