import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIZE, findRuns, findValidSwaps, isSpecialSwap, type Board, type Cell, type Kind } from './board.ts';
import { effectCells, expandTriggers, planCreations, swapCombo } from './specials.ts';
import { newGame, playSwap, type GameState } from './game.ts';

// Background with no runs anywhere: neighbors in a row differ by 1, in a column by 2.
const bg = (r: number, c: number) => (r * 2 + c) % 6;
const k = (r: number, c: number) => r * SIZE + c;

/** Board with piece id = r*8+c, background colors, and per-cell overrides. */
function board(over: { cell: Cell; color?: number; kind?: Kind }[] = []): Board {
  const grid = Array.from({ length: SIZE }, (_, r) => Array.from({ length: SIZE }, (_, c) => k(r, c)));
  const colors = grid.flat().map((id) => bg(Math.floor(id / SIZE), id % SIZE));
  const kinds = new Array<Kind>(SIZE * SIZE).fill('normal');
  for (const { cell, color, kind } of over) {
    if (color !== undefined) colors[k(cell.r, cell.c)] = color;
    if (kind) kinds[k(cell.r, cell.c)] = kind;
  }
  return { grid, colors, kinds };
}

const stateOf = (b: Board): GameState => ({
  ...newGame({ id: 't', seed: 1, moves: 10, goals: [{ type: 'score', target: 1e9 }] }),
  board: b,
});

test('background helper has no runs', () => {
  assert.equal(findRuns(board()).length, 0);
});

test('effectCells: row, column, 3x3 clipped at the corner', () => {
  const b = board();
  assert.equal(effectCells(b, { r: 2, c: 3 }, 'lineH').every((c) => c.r === 2), true);
  assert.equal(effectCells(b, { r: 2, c: 3 }, 'lineH').length, SIZE);
  assert.equal(effectCells(b, { r: 2, c: 3 }, 'lineV').every((c) => c.c === 3), true);
  assert.equal(effectCells(b, { r: 0, c: 0 }, 'bomb').length, 4);
  assert.equal(effectCells(b, { r: 4, c: 4 }, 'bomb').length, 9);
});

test('a color bomb never matches by color', () => {
  const b = board([
    { cell: { r: 0, c: 0 }, color: 5 },
    { cell: { r: 0, c: 1 }, color: 5, kind: 'colorBomb' },
    { cell: { r: 0, c: 2 }, color: 5 },
  ]);
  assert.equal(findRuns(b).filter((r) => r.cells.some((c) => c.r === 0 && c.c === 1)).length, 0);
});

test('blasts chain: a row blast that hits a column special fires it too', () => {
  const b = board([
    { cell: { r: 0, c: 0 }, kind: 'lineH' },
    { cell: { r: 0, c: 5 }, kind: 'lineV' },
  ]);
  const out = expandTriggers(b, new Set([k(0, 0)]));
  assert.equal(out.size, SIZE + SIZE - 1); // row 0 + column 5, sharing (0,5)
  for (let r = 0; r < SIZE; r++) assert.ok(out.has(k(r, 5)));
});

test('planCreations: 3 → nothing, 4 → line, L → bomb at the corner, 5 → color bomb', () => {
  const run = (cells: Cell[], dir: 'h' | 'v') => ({ cells, dir, color: 0 });
  const b = board();
  const h = (r: number, c0: number, n: number) => Array.from({ length: n }, (_, i) => ({ r, c: c0 + i }));
  const v = (c: number, r0: number, n: number) => Array.from({ length: n }, (_, i) => ({ r: r0 + i, c }));
  assert.deepEqual(planCreations(b, [run(h(1, 0, 3), 'h')]), []);
  assert.deepEqual(planCreations(b, [run(h(1, 0, 4), 'h')]).map((x) => x.kind), ['lineH']);
  assert.deepEqual(planCreations(b, [run(v(6, 2, 4), 'v')]).map((x) => x.kind), ['lineV']);
  const lShape = planCreations(b, [run(h(5, 2, 3), 'h'), run(v(2, 3, 3), 'v')]);
  assert.deepEqual(lShape.map((x) => [x.kind, x.cell]), [['bomb', { r: 5, c: 2 }]]);
  assert.deepEqual(planCreations(b, [run(h(7, 1, 5), 'h')]).map((x) => x.kind), ['colorBomb']);
  // the player's swapped cell wins when it is part of the group
  assert.deepEqual(planCreations(b, [run(h(1, 0, 4), 'h')], [{ r: 1, c: 3 }])[0].cell, { r: 1, c: 3 });
});

test('swapping into a line of 4 leaves a line special where the piece landed', () => {
  // Row 3: X X . X with an X above the gap; X = 5.
  const b = board([
    { cell: { r: 3, c: 0 }, color: 5 },
    { cell: { r: 3, c: 1 }, color: 5 },
    { cell: { r: 3, c: 3 }, color: 5 },
    { cell: { r: 2, c: 2 }, color: 5 },
  ]);
  assert.equal(findRuns(b).length, 0);
  const turn = playSwap(stateOf(b), { r: 2, c: 2 }, { r: 3, c: 2 });
  assert.ok(turn.valid);
  const first = turn.steps[0];
  assert.deepEqual(first.created.map((x) => [x.kind, x.cell]), [['lineH', { r: 3, c: 2 }]]);
  assert.equal(first.cleared.length, 3);
  assert.equal(first.board.kinds[first.created[0].id], 'lineH');
});

test('special swaps are legal without a color match', () => {
  const b = board([
    { cell: { r: 4, c: 4 }, kind: 'colorBomb' },
    { cell: { r: 0, c: 0 }, kind: 'lineH' },
    { cell: { r: 0, c: 1 }, kind: 'bomb' },
  ]);
  assert.ok(isSpecialSwap(b, { r: 4, c: 4 }, { r: 4, c: 5 }));
  assert.ok(isSpecialSwap(b, { r: 0, c: 0 }, { r: 0, c: 1 }));
  assert.ok(!isSpecialSwap(b, { r: 0, c: 0 }, { r: 1, c: 0 }), 'special + normal needs a match');
  assert.ok(findValidSwaps(b).some(([a, c]) => a.r === 4 && a.c === 4 && c.r === 4 && c.c === 5));
});

test('swap combos: color bomb + piece, line + line, bomb + bomb, color bomb + color bomb', () => {
  const cb = board([{ cell: { r: 4, c: 4 }, kind: 'colorBomb' }]);
  const color = bg(4, 5);
  const plain = swapCombo(cb, { r: 4, c: 4 }, { r: 4, c: 5 });
  const expected = 64 / 6; // background spreads colors almost evenly
  assert.ok(plain.clear.size >= Math.floor(expected) && plain.clear.size <= Math.ceil(expected) + 2);
  for (const key of plain.clear) {
    const r = Math.floor(key / SIZE), c = key % SIZE;
    if (!(r === 4 && c === 4) && !(r === 4 && c === 5)) assert.equal(cb.colors[cb.grid[r][c]], color);
  }

  const lines = board([{ cell: { r: 2, c: 2 }, kind: 'lineH' }, { cell: { r: 2, c: 3 }, kind: 'lineV' }]);
  assert.equal(swapCombo(lines, { r: 2, c: 2 }, { r: 2, c: 3 }).clear.size, 15);

  const bombs = board([{ cell: { r: 4, c: 4 }, kind: 'bomb' }, { cell: { r: 4, c: 3 }, kind: 'bomb' }]);
  assert.equal(swapCombo(bombs, { r: 4, c: 4 }, { r: 4, c: 3 }).clear.size, 25);

  const two = board([{ cell: { r: 0, c: 0 }, kind: 'colorBomb' }, { cell: { r: 0, c: 1 }, kind: 'colorBomb' }]);
  assert.equal(swapCombo(two, { r: 0, c: 0 }, { r: 0, c: 1 }).clear.size, 64);
});

test('color bomb + line turns that color into lines and fires them all', () => {
  const b = board([{ cell: { r: 4, c: 4 }, kind: 'colorBomb' }, { cell: { r: 4, c: 5 }, kind: 'lineH' }]);
  const turn = playSwap(stateOf(b), { r: 4, c: 4 }, { r: 4, c: 5 });
  assert.ok(turn.valid);
  const first = turn.steps[0];
  assert.ok(first.fired.length >= 8, `fired ${first.fired.length}`);
  assert.ok(first.cleared.length > 40, `cleared ${first.cleared.length}`);
  assert.equal(new Set(first.board.grid.flat()).size, SIZE * SIZE);
});

test('specials appear and fire during ordinary play', () => {
  let created = 0;
  let fired = 0;
  for (let s = 0; s < 100; s++) {
    let g = newGame({ id: 'p', seed: `sp-${s}`, moves: 30, goals: [{ type: 'score', target: 1e9 }] });
    while (g.status === 'playing') {
      const swaps = findValidSwaps(g.board);
      const [a, b] = swaps[(s * 13 + g.movesLeft) % swaps.length];
      const turn = playSwap(g, a, b);
      for (const step of turn.steps) {
        created += step.created.length;
        fired += step.fired.length;
      }
      g = turn.state;
    }
  }
  assert.ok(created > 50, `created ${created}`);
  assert.ok(fired > 20, `fired ${fired}`);
});
