// Plays every level with the bot and prints win rate and score spread.
// Usage: pnpm sim [runs=40] [topK=3] [--write-stars]
// --write-stars sets each level's stars from the wins: 2 stars at p40, 3 stars at p80.
import { readFileSync, writeFileSync } from 'node:fs';
import { validateLevels } from '../src/validate.ts';
import { playBot } from '../src/bot.ts';

const runs = Number(process.argv[2] ?? 40);
const topK = Number(process.argv[3] ?? 3);
const file = new URL('../src/levels.json', import.meta.url);
const levels = validateLevels(JSON.parse(readFileSync(file, 'utf8')));
const writeStars = process.argv.includes('--write-stars');
const round50 = (n: number) => Math.round(n / 50) * 50;
const q = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];

console.log(`bot topK=${topK}, ${runs} runs per level`);
console.log('level  win%   score p25/p50/p75   moves left p50 (wins)');
for (const level of levels) {
  const t0 = Date.now();
  const results = Array.from({ length: runs }, (_, i) => playBot(level, i, topK));
  const wins = results.filter((r) => r.won);
  const scores = results.map((r) => r.score).sort((a, b) => a - b);
  const left = wins.map((r) => r.movesLeft).sort((a, b) => a - b);
  if (writeStars && wins.length >= 5) {
    const ws = wins.map((r) => r.score).sort((a, b) => a - b);
    level.stars = [ws[0], round50(q(ws, 0.4)), round50(q(ws, 0.8))];
  }
  console.log(
    `${level.id.padStart(5)}  ${String(Math.round((100 * wins.length) / runs)).padStart(3)}%   ` +
      `${q(scores, 0.25)}/${q(scores, 0.5)}/${q(scores, 0.75)}`.padEnd(20) +
      `${left.length ? q(left, 0.5) : '-'}   (${Date.now() - t0} ms)`,
  );
}

if (writeStars) {
  writeFileSync(file, '[\n  ' + levels.map((l) => JSON.stringify(l)).join(',\n  ') + '\n]\n');
  console.log('stars written to levels.json');
}
