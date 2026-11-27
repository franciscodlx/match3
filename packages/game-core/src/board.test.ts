import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SIZE,
  collapse,
  createBoard,
  findMatches,
  findRuns,
  findValidSwaps,
  hasValidSwap,
  reshuffle,
  swap,
  type Board,
} from './board.ts';
import { rngFrom } from './rng.ts';

const seeded = (seed: number) => rngFrom(seed).next;

test('createBoard starts with no matches and unique ids', () => {
  for (let s = 1; s < 50; s++) {
    const b = createBoard(seeded(s));
    assert.equal(findMatches(b).length, 0);
    assert.equal(new Set(b.grid.flat()).size, SIZE * SIZE);
  }
});

test('findMatches detects a horizontal run of 3', () => {
  const b = createBoard(seeded(7));
  const colors = [...b.colors];
  for (const c of [0, 1, 2]) colors[b.grid[5][c]] = 9;
  const hits = findMatches({ grid: b.grid, colors });
  for (const c of [0, 1, 2]) assert.ok(hits.some((h) => h.r === 5 && h.c === c));
});

test('collapse keeps every id exactly once and fills spawned pieces from the top', () => {
  const b = createBoard(seeded(3));
  const cleared = [{ r: 7, c: 2 }, { r: 6, c: 2 }, { r: 5, c: 2 }, { r: 0, c: 4 }];
  const { board, moves } = collapse(b, cleared, seeded(9));
  assert.equal(new Set(board.grid.flat()).size, SIZE * SIZE);
  const spawned = moves.filter((m) => m.spawned);
  assert.equal(spawned.length, cleared.length);
  assert.deepEqual(spawned.filter((m) => m.col === 2).map((m) => m.toRow).sort(), [0, 1, 2]);
  // the piece above the 3 cleared cells in column 2 falls 3 rows
  const fell = moves.find((m) => m.id === b.grid[4][2])!;
  assert.equal(fell.toRow - fell.fromRow, 3);
});

test('every valid swap really creates a match', () => {
  const b: Board = createBoard(seeded(11));
  const swaps = findValidSwaps(b);
  assert.ok(swaps.length > 0);
  for (const [a, c] of swaps) assert.ok(findMatches(swap(b, a, c)).length > 0);
});

test('findRuns reports length and direction of each run', () => {
  const b = createBoard(seeded(21));
  const colors = [...b.colors];
  for (const c of [1, 2, 3, 4]) colors[b.grid[2][c]] = 9; // horizontal run of 4
  for (const r of [4, 5, 6]) colors[b.grid[r][7]] = 8; // vertical run of 3
  const runs = findRuns({ grid: b.grid, colors });
  assert.equal(runs.length, 2);
  assert.deepEqual(runs.map((r) => [r.dir, r.cells.length]).sort(), [['h', 4], ['v', 3]]);
});

test('hasValidSwap agrees with findValidSwaps', () => {
  for (let s = 1; s < 30; s++) {
    const b = createBoard(seeded(s));
    assert.equal(hasValidSwap(b), findValidSwaps(b).length > 0);
  }
});

test('reshuffle keeps piece ids in place and leaves a playable board', () => {
  const b = createBoard(seeded(5));
  const next = reshuffle(b, seeded(6));
  assert.deepEqual(next.grid, b.grid);
  assert.equal(findMatches(next).length, 0);
  assert.ok(hasValidSwap(next));
});
