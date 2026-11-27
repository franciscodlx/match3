import { useState } from 'react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { LEVELS } from '@match3/levels';
import { CONTINUE_COST, addCoins, canPlay, isUnlocked, livesAt, loseLife, recordGame, spendCoins, winCoins } from '@match3/meta';
import { GameScreen } from '../../game/GameScreen';
import { now } from '../../store/clock';
import { playlog } from '../../game/playlog';
import { getProgress, setProgress, useProgress } from '../../store/progress';

const ORDER = LEVELS.map((l) => l.id);
const newDeal = () => Math.floor(Math.random() * 1e6);

export default function LevelRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Every attempt deals a fresh board: goals, moves and jelly are fixed, the layout is not.
  // A challenge link (iteration 4) will carry the exact deal instead.
  const [deal, setDeal] = useState(newDeal);
  const progress = useProgress();
  const index = LEVELS.findIndex((l) => l.id === id);
  // Entering a level needs a life, checked once at mount (losing this attempt must not redirect).
  const [allowed] = useState(() => index >= 0 && canPlay(getProgress(), now()) && (__DEV__ || isUnlocked(getProgress(), ORDER, id)));
  if (!allowed) return <Redirect href={{ pathname: '/', params: { nolives: index >= 0 ? '1' : undefined } }} />;

  const level = LEVELS[index];
  const next = LEVELS[index + 1];
  return (
    <GameScreen
      key={`${level.id}-${deal}`}
      level={{ ...level, seed: `${level.seed}#${deal}` }}
      hasNext={!!next}
      onWin={(r) => setProgress((p) => addCoins(recordGame(p, level.id, r), winCoins(r.stars)))}
      onLoss={(r, quit) => {
        setProgress((p) => loseLife(recordGame(p, level.id, r), now()));
        playlog({ type: 'session', event: 'life-lost', level: level.id, quit, lives: livesAt(getProgress(), now()).count });
      }}
      coins={progress.coins}
      continueCost={CONTINUE_COST}
      onContinue={() => {
        const paid = spendCoins(getProgress(), CONTINUE_COST);
        if (paid) setProgress(() => paid);
        if (paid) playlog({ type: 'session', event: 'continue', level: level.id, coinsLeft: paid.coins });
        return !!paid;
      }}
      onRetry={() => {
        // The loss already cost a life; with none left, back to the map's wait screen.
        if (canPlay(getProgress(), now())) setDeal(newDeal());
        else router.replace({ pathname: '/', params: { nolives: '1' } });
      }}
      onNext={() => next && router.replace({ pathname: '/level/[id]', params: { id: next.id } })}
      onExit={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    />
  );
}
