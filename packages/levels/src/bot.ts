import { findValidSwaps, goalProgress, newGame, playSwap, rngFrom, seedState, type GameState, type Level } from '@match3/game-core';

export type BotResult = { won: boolean; score: number; movesLeft: number; state: GameState };

/** How much a turn moved the level forward: goal progress (weighted by how unfinished it is) plus points. */
function value(before: GameState, after: GameState): number {
  const was = goalProgress(before);
  const now = goalProgress(after);
  let v = (after.score - before.score) / 10;
  now.forEach((p, i) => {
    if (p.goal.type === 'score') return; // already counted through points
    const gained = p.current - was[i].current;
    v += gained * (p.done ? 1 : 6);
  });
  return v;
}

/**
 * A greedy player with a human-ish blind spot: it scores every legal swap one turn ahead and
 * picks among the best `topK` at random. topK=1 is a strong player; 3 is closer to a casual one.
 */
export function playBot(level: Level, run: number, topK = 3): BotResult {
  const rng = rngFrom(seedState(`bot-${level.id}-${run}`));
  // Same layout every run would test one board only: vary the seed per run.
  let g = newGame({ ...level, seed: `${level.seed}#${run}` });
  while (g.status === 'playing') {
    const options = findValidSwaps(g.board)
      .map(([a, b]) => {
        const turn = playSwap(g, a, b);
        return { turn, v: value(g, turn.state) };
      })
      .sort((x, y) => y.v - x.v);
    const pick = options[Math.floor(rng.next() * Math.min(topK, options.length))];
    g = pick.turn.state;
  }
  return { won: g.status === 'won', score: g.score, movesLeft: g.movesLeft, state: g };
}
