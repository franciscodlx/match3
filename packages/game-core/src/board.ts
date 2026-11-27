// Pure match-3 board logic (no UI). Board cells hold piece ids; colors are looked up per piece,
// so the renderer can keep one animated view per piece and just move it around.
// Every random choice takes an explicit Rng so results are reproducible from a seed.
import type { Rng } from './rng.ts';

export const SIZE = 8;
export const COLORS = 6;

export type Cell = { r: number; c: number };
export type Grid = number[][]; // grid[r][c] = pieceId

export type Board = { grid: Grid; colors: number[] }; // colors[pieceId]

const randColor = (rng: Rng) => Math.floor(rng() * COLORS);

export function createBoard(rng: Rng): Board {
  const grid: Grid = [];
  const colors: number[] = [];
  for (let r = 0; r < SIZE; r++) {
    grid.push([]);
    for (let c = 0; c < SIZE; c++) {
      let color: number;
      do {
        color = randColor(rng);
      } while (
        (c >= 2 && colors[grid[r][c - 1]] === color && colors[grid[r][c - 2]] === color) ||
        (r >= 2 && colors[grid[r - 1][c]] === color && colors[grid[r - 2][c]] === color)
      );
      const id = r * SIZE + c;
      colors[id] = color;
      grid[r].push(id);
    }
  }
  return { grid, colors };
}

export const colorAt = (b: Board, r: number, c: number) => b.colors[b.grid[r][c]];

/** A straight horizontal or vertical line of 3+ same-colored pieces. */
export type Run = { cells: Cell[]; dir: 'h' | 'v'; color: number };

/** Every maximal run of 3+ (a cell can be in one horizontal and one vertical run). */
export function findRuns(b: Board): Run[] {
  const runs: Run[] = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; ) {
      let end = c + 1;
      while (end < SIZE && colorAt(b, r, end) === colorAt(b, r, c)) end++;
      if (end - c >= 3) {
        const cells = [];
        for (let k = c; k < end; k++) cells.push({ r, c: k });
        runs.push({ cells, dir: 'h', color: colorAt(b, r, c) });
      }
      c = end;
    }
  }
  for (let c = 0; c < SIZE; c++) {
    for (let r = 0; r < SIZE; ) {
      let end = r + 1;
      while (end < SIZE && colorAt(b, end, c) === colorAt(b, r, c)) end++;
      if (end - r >= 3) {
        const cells = [];
        for (let k = r; k < end; k++) cells.push({ r: k, c });
        runs.push({ cells, dir: 'v', color: colorAt(b, r, c) });
      }
      r = end;
    }
  }
  return runs;
}

/** Cells that belong to a horizontal or vertical run of 3+ (deduplicated). */
export function findMatches(b: Board): Cell[] {
  const hit = new Set<number>();
  for (const run of findRuns(b)) for (const { r, c } of run.cells) hit.add(r * SIZE + c);
  return [...hit].map((i) => ({ r: Math.floor(i / SIZE), c: i % SIZE }));
}

export const areAdjacent = (a: Cell, b: Cell) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;

export function swap(b: Board, a: Cell, c: Cell): Board {
  const grid = b.grid.map((row) => [...row]);
  [grid[a.r][a.c], grid[c.r][c.c]] = [grid[c.r][c.c], grid[a.r][a.c]];
  return { grid, colors: b.colors };
}

export type Move = { id: number; col: number; fromRow: number; toRow: number; spawned: boolean };

/**
 * Removes the matched cells, drops survivors down and refills from the top.
 * Cleared piece ids are recycled as the new pieces (spawned above the board,
 * fromRow < 0), so the piece count stays constant at SIZE*SIZE.
 */
export function collapse(b: Board, cleared: Cell[], rng: Rng): { board: Board; moves: Move[] } {
  const grid = b.grid.map((row) => [...row]);
  const colors = [...b.colors];
  const clearedSet = new Set(cleared.map(({ r, c }) => r * SIZE + c));
  const moves: Move[] = [];

  for (let c = 0; c < SIZE; c++) {
    const survivors: { id: number; row: number }[] = [];
    const recycled: number[] = [];
    for (let r = SIZE - 1; r >= 0; r--) {
      if (clearedSet.has(r * SIZE + c)) recycled.push(grid[r][c]);
      else survivors.push({ id: grid[r][c], row: r });
    }
    let target = SIZE - 1;
    for (const s of survivors) {
      grid[target][c] = s.id;
      if (s.row !== target) moves.push({ id: s.id, col: c, fromRow: s.row, toRow: target, spawned: false });
      target--;
    }
    // target is now the lowest empty row; fill upwards with recycled ids.
    recycled.forEach((id, i) => {
      const toRow = target - i;
      colors[id] = randColor(rng);
      grid[toRow][c] = id;
      moves.push({ id, col: c, fromRow: -1 - i, toRow, spawned: true });
    });
  }
  return { board: { grid, colors }, moves };
}

/** True if some adjacent swap would produce a match (stops at the first one). */
export function hasValidSwap(b: Board): boolean {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (c + 1 < SIZE && findMatches(swap(b, { r, c }, { r, c: c + 1 })).length) return true;
      if (r + 1 < SIZE && findMatches(swap(b, { r, c }, { r: r + 1, c })).length) return true;
    }
  }
  return false;
}

/**
 * New colors for the same piece ids (positions unchanged), until the board has no
 * matches and at least one valid swap. Used at game start and when the player is stuck.
 */
export function reshuffle(b: Board, rng: Rng): Board {
  for (;;) {
    const fresh = createBoard(rng);
    const colors = [...b.colors];
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) colors[b.grid[r][c]] = colorAt(fresh, r, c);
    const next = { grid: b.grid, colors };
    if (hasValidSwap(next)) return next;
  }
}

/** All adjacent swaps that would produce at least one match. */
export function findValidSwaps(b: Board): [Cell, Cell][] {
  const out: [Cell, Cell][] = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const a = { r, c };
      for (const n of [{ r, c: c + 1 }, { r: r + 1, c }]) {
        if (n.r >= SIZE || n.c >= SIZE) continue;
        if (findMatches(swap(b, a, n)).length) out.push([a, n]);
      }
    }
  }
  return out;
}
