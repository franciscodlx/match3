import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIZE, findMatches, findValidSwaps, hasValidSwap } from './board.ts';
import { goalProgress, jellyLayers, newGame, playSwap, replay, runPoints, starsFor, type GameState, type Level } from './game.ts';

const level = ({ targetScore = 5000, ...over }: Partial<Level> & { targetScore?: number } = {}): Level => ({
  id: 't',
  seed: 'test',
  moves: 20,
  goals: [{ type: 'score', target: targetScore }],
  ...over,
});

/** Plays the first valid swap each turn until the game ends. */
function autoplay(state: GameState, maxTurns = 1000): GameState {
  for (let i = 0; i < maxTurns && state.status === 'playing'; i++) {
    const [a, b] = findValidSwaps(state.board)[0];
    const turn = playSwap(state, a, b);
    assert.ok(turn.valid);
    state = turn.state;
  }
  return state;
}

test('newGame is deterministic and playable', () => {
  const a = newGame(level());
  const b = newGame(level());
  assert.deepEqual(a, b);
  assert.equal(findMatches(a.board).length, 0);
  assert.ok(hasValidSwap(a.board));
  assert.notDeepEqual(newGame(level({ seed: 'other' })).board, a.board);
});

test('a swap that makes no match is rejected without spending a move', () => {
  const g = newGame(level());
  const valid = new Set(findValidSwaps(g.board).map(([a, b]) => `${a.r},${a.c}-${b.r},${b.c}`));
  let tried = 0;
  for (let r = 0; r < SIZE && !tried; r++) {
    for (let c = 0; c + 1 < SIZE && !tried; c++) {
      if (valid.has(`${r},${c}-${r},${c + 1}`)) continue;
      const turn = playSwap(g, { r, c }, { r, c: c + 1 });
      assert.equal(turn.valid, false);
      assert.equal(turn.state, g);
      tried++;
    }
  }
  assert.equal(tried, 1);
  assert.equal(playSwap(g, { r: 0, c: 0 }, { r: 2, c: 0 }).valid, false, 'not adjacent');
  assert.equal(playSwap(g, { r: 0, c: 0 }, { r: -1, c: 0 }).valid, false, 'out of bounds');
});

test('a valid swap spends a move, scores, and leaves a settled playable board', () => {
  const g = newGame(level());
  const [a, b] = findValidSwaps(g.board)[0];
  const turn = playSwap(g, a, b);
  assert.ok(turn.valid);
  assert.equal(turn.state.movesLeft, g.movesLeft - 1);
  assert.ok(turn.steps.length >= 1);
  assert.equal(turn.steps[0].combo, 1);
  assert.equal(turn.points, turn.steps.reduce((s, x) => s + x.points, 0));
  assert.equal(turn.state.score, turn.points);
  assert.equal(findMatches(turn.state.board).length, 0);
  assert.ok(hasValidSwap(turn.state.board));
  assert.equal(new Set(turn.state.board.grid.flat()).size, SIZE * SIZE);
  assert.deepEqual(turn.state.swaps, [[a, b]]);
});

test('cascade steps are numbered and multiplied by their combo', () => {
  // Search seeds until a turn produces a cascade.
  for (let s = 0; s < 500; s++) {
    let g = newGame(level({ seed: s }));
    for (let t = 0; t < 10 && g.status === 'playing'; t++) {
      const [a, b] = findValidSwaps(g.board)[0];
      const turn = playSwap(g, a, b);
      if (turn.steps.length >= 2) {
        turn.steps.forEach((step, i) => {
          assert.equal(step.combo, i + 1);
          assert.equal(step.points, step.runs.reduce((sum, r) => sum + runPoints(r), 0) * step.combo);
        });
        return;
      }
      g = turn.state;
    }
  }
  assert.fail('no cascade found in 500 seeds');
});

test('run points: 3 = 30, 4 = 60, 5 = 100', () => {
  const run = (n: number) => ({ cells: Array.from({ length: n }, (_, c) => ({ r: 0, c })), dir: 'h' as const, color: 0 });
  assert.equal(runPoints(run(3)), 30);
  assert.equal(runPoints(run(4)), 60);
  assert.equal(runPoints(run(5)), 100);
});

test('the game is lost when moves run out below the target', () => {
  const end = autoplay(newGame(level({ moves: 3, targetScore: 1_000_000 })));
  assert.equal(end.status, 'lost');
  assert.equal(end.movesLeft, 0);
  const [a, b] = findValidSwaps(end.board)[0];
  assert.equal(playSwap(end, a, b).valid, false, 'no swaps after the end');
});

test('the game is won as soon as the target is reached', () => {
  const end = autoplay(newGame(level({ moves: 50, targetScore: 200 })));
  assert.equal(end.status, 'won');
  assert.ok(end.score >= 200);
  assert.ok(end.movesLeft > 0);
});

test('replay of the swap log reproduces the exact final state', () => {
  const lvl = level({ seed: 'replay', moves: 25 });
  const end = autoplay(newGame(lvl));
  const { state, invalidAt } = replay(lvl, end.swaps);
  assert.equal(invalidAt, null);
  assert.deepEqual(state, end);
});

test('replay flags a tampered log', () => {
  const lvl = level({ seed: 'tamper' });
  const end = autoplay(newGame({ ...lvl, moves: 5 }));
  const forged = [...end.swaps];
  forged.splice(2, 0, [{ r: 0, c: 0 }, { r: 0, c: 0 }]);
  assert.equal(replay({ ...lvl, moves: 5 }, forged).invalidAt, 2);
});

test('invariants hold over 200 full games', () => {
  for (let s = 0; s < 200; s++) {
    let g = newGame(level({ seed: s, moves: 30, targetScore: 3000 }));
    while (g.status === 'playing') {
      const swaps = findValidSwaps(g.board);
      const [a, b] = swaps[(s * 7 + g.movesLeft) % swaps.length];
      const turn = playSwap(g, a, b);
      assert.ok(turn.valid);
      assert.ok(turn.points > 0);
      g = turn.state;
      assert.equal(findMatches(g.board).length, 0);
      assert.ok(hasValidSwap(g.board));
      assert.equal(new Set(g.board.grid.flat()).size, SIZE * SIZE);
    }
    assert.ok(g.status === 'won' || g.movesLeft === 0);
  }
});

test('collect goal counts cleared pieces of its color and wins when reached', () => {
  const lvl: Level = { id: 'c', seed: 'collect', moves: 60, goals: [{ type: 'collect', color: 2, count: 15 }] };
  let g = newGame(lvl);
  let seen = 0;
  while (g.status === 'playing') {
    const [a, b] = findValidSwaps(g.board)[0];
    const turn = playSwap(g, a, b);
    for (const step of turn.steps) assert.ok(step.cleared.length > 0);
    seen = turn.state.collected[2];
    g = turn.state;
  }
  assert.equal(g.status, 'won');
  assert.ok(seen >= 15);
  assert.deepEqual(goalProgress(g).map((p) => p.done), [true]);
});

test('collected totals equal the cleared pieces, by color', () => {
  let g = newGame(level({ seed: 'tally', moves: 15, targetScore: 1e9 }));
  let total = 0;
  while (g.status === 'playing') {
    const [a, b] = findValidSwaps(g.board)[0];
    const turn = playSwap(g, a, b);
    total += turn.steps.reduce((n, s) => n + s.cleared.length, 0);
    g = turn.state;
  }
  // every cleared cell counts once, except color bombs (no color)
  const counted = g.collected.reduce((a, b) => a + b, 0);
  assert.ok(counted <= total && counted >= total - 5, `${counted} vs ${total}`);
});

test('jelly layers drop under cleared cells and stay put', () => {
  const full = Array.from({ length: SIZE }, () => '2'.repeat(SIZE));
  const lvl: Level = { id: 'j', seed: 'jelly', moves: 5, goals: [{ type: 'jelly' }], jelly: full };
  const g = newGame(lvl);
  assert.equal(jellyLayers(lvl).reduce((a, b) => a + b, 0), 128);
  const [a, b] = findValidSwaps(g.board)[0];
  const turn = playSwap(g, a, b);
  const first = turn.steps[0];
  for (const { r, c } of first.cleared) assert.equal(first.jelly[r * SIZE + c] < 2, true);
  const left = turn.state.jelly.reduce((x, y) => x + y, 0);
  assert.ok(left < 128);
  const [p] = goalProgress(turn.state);
  assert.equal(p.target, 128);
  assert.equal(p.current, 128 - left);
});

test('jelly goal is won only when every layer is gone', () => {
  const lvl: Level = {
    id: 'j2',
    seed: 'jelly-small',
    moves: 80,
    goals: [{ type: 'jelly' }],
    jelly: ['........', '........', '........', '........', '........', '........', '11111111', '11111111'],
  };
  let g = newGame(lvl);
  while (g.status === 'playing') {
    const swaps = findValidSwaps(g.board);
    // prefer swaps on the jelly rows so the bot finishes well within the move budget
    const pick = swaps.find(([x, y]) => x.r >= 5 || y.r >= 5) ?? swaps[0];
    g = playSwap(g, pick[0], pick[1]).state;
  }
  assert.equal(g.status, 'won');
  assert.equal(g.jelly.reduce((a, b) => a + b, 0), 0);
});

test('a level with fewer colors only ever shows those colors', () => {
  let g = newGame(level({ seed: 'four', colors: 4, moves: 20, targetScore: 1e9 }));
  const check = () => g.board.grid.flat().forEach((id) => assert.ok(g.board.colors[id] < 4));
  check();
  while (g.status === 'playing') {
    const [a, b] = findValidSwaps(g.board)[0];
    g = playSwap(g, a, b).state;
    check();
  }
});

test('stars: 0 when lost, 1..3 by score thresholds when won', () => {
  const lvl = level({ seed: 'stars', moves: 40, targetScore: 300, stars: [300, 600, 1e9] });
  const won = autoplay(newGame(lvl));
  assert.equal(won.status, 'won');
  assert.equal(starsFor(won), won.score >= 600 ? 2 : 1);
  const lost = autoplay(newGame(level({ moves: 2, targetScore: 1e9 })));
  assert.equal(starsFor(lost), 0);
});

test('winning early adds a bonus per move left', () => {
  const end = autoplay(newGame(level({ moves: 50, targetScore: 200 })));
  assert.equal(end.status, 'won');
  assert.equal(end.moveBonus, end.movesLeft * 50);
  const lost = autoplay(newGame(level({ moves: 2, targetScore: 1e9 })));
  assert.equal(lost.moveBonus, 0);
});
