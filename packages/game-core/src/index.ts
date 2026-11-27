// Pure match-3 logic (no UI). Board cells hold piece ids; colors are looked up per piece,
// so the renderer can keep one animated view per piece and just move it around.

export const SIZE = 8;
export const COLORS = 6;

export type Cell = { r: number; c: number };
export type Grid = number[][]; // grid[r][c] = pieceId
export type Rng = () => number;

export type Board = { grid: Grid; colors: number[] }; // colors[pieceId]

const randColor = (rng: Rng) => Math.floor(rng() * COLORS);

export function createBoard(rng: Rng = Math.random): Board {
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

/** Cells that belong to a horizontal or vertical run of 3+. */
export function findMatches(b: Board): Cell[] {
  const hit = new Set<number>();
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; ) {
      let end = c + 1;
      while (end < SIZE && colorAt(b, r, end) === colorAt(b, r, c)) end++;
      if (end - c >= 3) for (let k = c; k < end; k++) hit.add(r * SIZE + k);
      c = end;
    }
  }
  for (let c = 0; c < SIZE; c++) {
    for (let r = 0; r < SIZE; ) {
      let end = r + 1;
      while (end < SIZE && colorAt(b, end, c) === colorAt(b, r, c)) end++;
      if (end - r >= 3) for (let k = r; k < end; k++) hit.add(k * SIZE + c);
      r = end;
    }
  }
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
export function collapse(b: Board, cleared: Cell[], rng: Rng = Math.random): { board: Board; moves: Move[] } {
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
