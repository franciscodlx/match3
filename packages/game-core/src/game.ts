// Game rules on top of the board: turns, cascades, scoring, limited moves and win/lose.
// Everything is a pure function of (state, input): same level + same swaps = same game,
// which is what lets the server re-simulate a run to validate its score.
import {
  SIZE,
  areAdjacent,
  collapse,
  createBoard,
  findRuns,
  hasValidSwap,
  isSpecialSwap,
  reshuffle,
  swap,
  type Board,
  type Cell,
  type Kind,
  type Move,
  type Run,
} from './board.ts';
import { rngFrom, seedState, type Rng } from './rng.ts';
import { expandTriggers, planCreations, swapCombo, type Creation } from './specials.ts';

export type Level = {
  id: string;
  seed: number | string;
  moves: number;
  targetScore: number;
};

export type GameStatus = 'playing' | 'won' | 'lost';
export type Swap = [Cell, Cell];

export type GameState = {
  level: Level;
  board: Board;
  score: number;
  movesLeft: number;
  status: GameStatus;
  rngState: number;
  swaps: Swap[]; // accepted swaps, in order: the replay log
};

/** One wave of a turn: what matched, what it scored, and how pieces fell afterwards. */
export type CascadeStep = {
  combo: number; // 1 for the swap's own matches, 2+ for cascades
  runs: Run[]; // empty on a special-swap step
  cleared: Cell[]; // includes everything special pieces blew up
  created: (Creation & { id: number })[]; // specials left behind by this step's matches
  fired: { cell: Cell; kind: Kind }[]; // specials that went off this step
  points: number;
  moves: Move[]; // falls + spawns, as produced by collapse()
  board: Board; // board after this step's collapse
};

export type TurnResult = {
  state: GameState;
  valid: boolean; // false = swap rejected, state unchanged, no move spent
  swapped: Board | null; // board right after the swap, before clearing
  steps: CascadeStep[];
  reshuffled: Board | null; // set when no valid swap was left and colors were reshuffled
  points: number;
};

export const POINTS_PER_PIECE = 10;
const MAX_CASCADES = 100; // safety net; a real board settles in a handful of steps
const cellOf = (k: number): Cell => ({ r: Math.floor(k / SIZE), c: k % SIZE });

/** Base points for one run, before the combo multiplier. Longer runs pay a bonus. */
export function runPoints(run: Run): number {
  const n = run.cells.length;
  const bonus = n >= 5 ? 50 : n === 4 ? 20 : 0;
  return n * POINTS_PER_PIECE + bonus;
}

export function newGame(level: Level): GameState {
  const rng = rngFrom(seedState(level.seed));
  let board = createBoard(rng.next);
  if (!hasValidSwap(board)) board = reshuffle(board, rng.next);
  return {
    level,
    board,
    score: 0,
    movesLeft: level.moves,
    status: 'playing',
    rngState: rng.state,
    swaps: [],
  };
}

const inBounds = ({ r, c }: Cell) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

export function playSwap(state: GameState, a: Cell, b: Cell): TurnResult {
  const rejected: TurnResult = { state, valid: false, swapped: null, steps: [], reshuffled: null, points: 0 };
  if (state.status !== 'playing' || !inBounds(a) || !inBounds(b) || !areAdjacent(a, b)) return rejected;

  const swapped = swap(state.board, a, b);
  const special = isSpecialSwap(state.board, a, b);
  if (!special && findRuns(swapped).length === 0) return rejected;

  const rng = rngFrom(state.rngState);
  const steps: CascadeStep[] = [];
  let board = swapped;
  let combo = 1;
  if (special) {
    // The moved piece landed on b; blasts are centered there.
    const plan = swapCombo(swapped, a, b);
    const clear = expandTriggers(plan.board, plan.clear, new Set(), plan.consumed);
    const step = resolveStep(plan.board, combo, [], [], clear, plan.consumed, rng.next);
    steps.push(step);
    board = step.board;
    combo++;
  }
  for (; combo <= MAX_CASCADES; combo++) {
    const runs = findRuns(board);
    if (runs.length === 0) break;
    // On the swap's own step, a new special appears where the player moved.
    const creations = planCreations(board, runs, steps.length === 0 ? [b, a] : []);
    const protect = new Set(creations.map(({ cell }) => cell.r * SIZE + cell.c));
    const matched = new Set(runs.flatMap((run) => run.cells.map(({ r, c }) => r * SIZE + c)));
    const clear = expandTriggers(board, matched, protect);
    const step = resolveStep(board, combo, runs, creations, clear, new Set(), rng.next);
    steps.push(step);
    board = step.board;
  }

  let reshuffled: Board | null = null;
  if (!hasValidSwap(board)) {
    board = reshuffle(board, rng.next);
    reshuffled = board;
  }

  const points = steps.reduce((sum, s) => sum + s.points, 0);
  const score = state.score + points;
  const movesLeft = state.movesLeft - 1;
  const status: GameStatus =
    score >= state.level.targetScore ? 'won' : movesLeft <= 0 ? 'lost' : 'playing';

  return {
    state: {
      ...state,
      board,
      score,
      movesLeft,
      status,
      rngState: rng.state,
      swaps: [...state.swaps, [a, b]],
    },
    valid: true,
    swapped,
    steps,
    reshuffled,
    points,
  };
}

/** Applies one step: fires, creates specials, clears, collapses, scores. */
function resolveStep(
  board: Board,
  combo: number,
  runs: Run[],
  creations: Creation[],
  clear: Set<number>,
  consumed: Set<number>,
  rng: Rng,
): CascadeStep {
  const inRuns = new Set(runs.flatMap((run) => run.cells.map(({ r, c }) => r * SIZE + c)));
  const fired = [...clear]
    .filter((k) => !consumed.has(k))
    .map((k) => {
      const cell = cellOf(k);
      return { cell, kind: board.kinds[board.grid[cell.r][cell.c]] };
    })
    .filter(({ kind }) => kind !== 'normal');
  const extra = [...clear].filter((k) => !inRuns.has(k)).length;
  const points = (runs.reduce((sum, run) => sum + runPoints(run), 0) + extra * POINTS_PER_PIECE) * combo;

  const colors = [...board.colors];
  const kinds = [...board.kinds];
  const created = creations.map((cr) => {
    const id = board.grid[cr.cell.r][cr.cell.c];
    colors[id] = cr.color;
    kinds[id] = cr.kind;
    return { ...cr, id };
  });
  const cleared = [...clear].map(cellOf);
  const next = collapse({ grid: board.grid, colors, kinds }, cleared, rng);
  return { combo, runs, cleared, created, fired, points, moves: next.moves, board: next.board };
}

/**
 * Re-plays a swap log from the level's seed. `invalidAt` is the index of the first
 * swap the rules reject (a tampered or corrupted log), or null if all were legal.
 */
export function replay(level: Level, swaps: Swap[]): { state: GameState; invalidAt: number | null } {
  let state = newGame(level);
  for (let i = 0; i < swaps.length; i++) {
    const turn = playSwap(state, swaps[i][0], swaps[i][1]);
    if (!turn.valid) return { state, invalidAt: i };
    state = turn.state;
  }
  return { state, invalidAt: null };
}
