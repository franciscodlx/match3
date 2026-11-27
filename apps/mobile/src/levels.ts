import type { Level } from '@match3/game-core';

// Iteration 1 placeholder levels. Targets come from simulating 300 random-play games
// of 20 moves (p10 960, median 1410, p90 1980). Iteration 2 moves levels to JSON.
export const LEVELS: Level[] = [
  { id: '1', seed: 'nivel-1', moves: 20, targetScore: 1200 },
  { id: '2', seed: 'nivel-2', moves: 18, targetScore: 1500 },
  { id: '3', seed: 'nivel-3', moves: 15, targetScore: 1500 },
];
