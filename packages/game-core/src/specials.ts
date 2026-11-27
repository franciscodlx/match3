// Special pieces: how they are created from a match, what they clear when they fire,
// and what two of them do when swapped together. Pure and deterministic like the rest.
import { SIZE, colorAt, kindAt, type Board, type Cell, type Kind, type Run } from './board.ts';

const key = ({ r, c }: Cell) => r * SIZE + c;
const cellOf = (k: number): Cell => ({ r: Math.floor(k / SIZE), c: k % SIZE });
const inBoard = (r: number, c: number) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

function area(center: Cell, radius: number): Cell[] {
  const out: Cell[] = [];
  for (let r = center.r - radius; r <= center.r + radius; r++)
    for (let c = center.c - radius; c <= center.c + radius; c++) if (inBoard(r, c)) out.push({ r, c });
  return out;
}
const row = (r: number): Cell[] => Array.from({ length: SIZE }, (_, c) => ({ r, c }));
const col = (c: number): Cell[] => Array.from({ length: SIZE }, (_, r) => ({ r, c }));
const allCells = (): Cell[] => Array.from({ length: SIZE * SIZE }, (_, k) => cellOf(k));

/** Cells holding a non-bomb piece of `color`. */
function cellsOfColor(b: Board, color: number): Cell[] {
  return allCells().filter(({ r, c }) => kindAt(b, r, c) !== 'colorBomb' && colorAt(b, r, c) === color);
}

/** The most common color on the board (lowest index on ties): what a color bomb hit by a blast clears. */
function dominantColor(b: Board): number {
  const counts = new Map<number, number>();
  for (const { r, c } of allCells()) {
    if (kindAt(b, r, c) === 'colorBomb') continue;
    const color = colorAt(b, r, c);
    counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  let best = -1;
  let bestCount = -1;
  for (const [color, n] of counts) if (n > bestCount || (n === bestCount && color < best)) [best, bestCount] = [color, n];
  return best;
}

/** What a special clears when it fires on its own (hit by a match or by another blast). */
export function effectCells(b: Board, at: Cell, kind: Kind): Cell[] {
  switch (kind) {
    case 'lineH':
      return row(at.r);
    case 'lineV':
      return col(at.c);
    case 'bomb':
      return area(at, 1);
    case 'colorBomb':
      return [at, ...cellsOfColor(b, dominantColor(b))];
    default:
      return [at];
  }
}

/**
 * Fires every special inside `clear`, then every special those blasts reach, until nothing new
 * is hit. `protect` cells are never cleared (pieces being created this step); `consumed` cells
 * are cleared but do not fire (the two pieces of a special swap already spent their effect).
 */
export function expandTriggers(b: Board, clear: Set<number>, protect = new Set<number>(), consumed = new Set<number>()) {
  const out = new Set([...clear].filter((k) => !protect.has(k)));
  const fired = new Set<number>(consumed);
  const queue = [...out];
  while (queue.length) {
    const k = queue.shift()!;
    if (fired.has(k)) continue;
    const at = cellOf(k);
    const kind = kindAt(b, at.r, at.c);
    if (kind === 'normal') continue;
    fired.add(k);
    for (const cell of effectCells(b, at, kind)) {
      const ck = key(cell);
      if (protect.has(ck) || out.has(ck)) continue;
      out.add(ck);
      queue.push(ck);
    }
  }
  return out;
}

export type Creation = { cell: Cell; kind: Kind; color: number };

/**
 * Groups the step's runs (runs sharing a cell form one L/T group) and decides which special,
 * if any, each group leaves behind and where. `preferred` = the swapped cells on the swap's
 * own step, so the special appears where the player moved.
 */
export function planCreations(b: Board, runs: Run[], preferred: Cell[] = []): Creation[] {
  // Union-find over runs by shared cells.
  const parent = runs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const owner = new Map<number, number>();
  runs.forEach((run, i) =>
    run.cells.forEach((cell) => {
      const k = key(cell);
      if (owner.has(k)) parent[find(i)] = find(owner.get(k)!);
      else owner.set(k, i);
    }),
  );
  const groups = new Map<number, Run[]>();
  runs.forEach((run, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), run]));

  const creations: Creation[] = [];
  for (const group of groups.values()) {
    const longest = group.reduce((a, r) => (r.cells.length > a.cells.length ? r : a));
    const hasH = group.some((r) => r.dir === 'h');
    const hasV = group.some((r) => r.dir === 'v');
    let kind: Kind | null = null;
    if (longest.cells.length >= 5) kind = 'colorBomb';
    else if (hasH && hasV) kind = 'bomb';
    else if (longest.cells.length === 4) kind = longest.dir === 'h' ? 'lineH' : 'lineV';
    if (!kind) continue;

    const cells = new Map<number, Cell>();
    for (const r of group) for (const cell of r.cells) cells.set(key(cell), cell);
    // Where: the player's swapped cell if it is in the group, else the L/T corner, else the middle.
    const counts = new Map<number, number>();
    for (const r of group) for (const cell of r.cells) counts.set(key(cell), (counts.get(key(cell)) ?? 0) + 1);
    const corner = [...counts].find(([, n]) => n > 1)?.[0];
    const middle = key(longest.cells[Math.floor(longest.cells.length / 2)]);
    const candidates = [...preferred.map(key), ...(corner !== undefined ? [corner] : []), middle, ...cells.keys()];
    const spot = candidates.find((k) => cells.has(k) && kindAt(b, cellOf(k).r, cellOf(k).c) === 'normal');
    if (spot === undefined) continue; // every cell already special: they just fire
    creations.push({ cell: cellOf(spot), kind, color: longest.color });
  }
  return creations;
}

export type SwapCombo = {
  board: Board; // may have converted pieces (color bomb + special)
  clear: Set<number>;
  consumed: Set<number>;
};

/**
 * Effect of a special swap (see isSpecialSwap). `a` is where the player started, `to` where the
 * moved piece landed; blasts are centered on `to`. Board is the one *after* the swap.
 */
export function swapCombo(b: Board, a: Cell, to: Cell): SwapCombo {
  const ka = kindAt(b, a.r, a.c);
  const kt = kindAt(b, to.r, to.c);
  const both = new Set([key(a), key(to)]);
  const keys = (cells: Cell[]) => new Set([...cells.map(key), ...both]);

  if (ka === 'colorBomb' && kt === 'colorBomb') return { board: b, clear: keys(allCells()), consumed: both };
  if (ka === 'colorBomb' || kt === 'colorBomb') {
    const bombAt = ka === 'colorBomb' ? a : to;
    const other = ka === 'colorBomb' ? to : a;
    const otherKind = kindAt(b, other.r, other.c);
    const targets = cellsOfColor(b, colorAt(b, other.r, other.c));
    if (otherKind === 'normal') return { board: b, clear: keys(targets), consumed: new Set([key(bombAt)]) };
    // Color bomb + special: every piece of that color becomes that special, then they all fire.
    const kinds = [...b.kinds];
    targets.forEach(({ r, c }, i) => {
      const k = otherKind === 'lineH' || otherKind === 'lineV' ? (i % 2 ? 'lineV' : 'lineH') : otherKind;
      kinds[b.grid[r][c]] = k;
    });
    return { board: { ...b, kinds }, clear: keys(targets), consumed: new Set([key(bombAt)]) };
  }

  const isLine = (k: Kind) => k === 'lineH' || k === 'lineV';
  let cells: Cell[];
  if (isLine(ka) && isLine(kt)) cells = [...row(to.r), ...col(to.c)];
  else if (ka === 'bomb' && kt === 'bomb') cells = area(to, 2);
  else cells = [-1, 0, 1].flatMap((d) => [...(inBoard(to.r + d, 0) ? row(to.r + d) : []), ...(inBoard(0, to.c + d) ? col(to.c + d) : [])]);
  return { board: b, clear: keys(cells), consumed: both };
}
