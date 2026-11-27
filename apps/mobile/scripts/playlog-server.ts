// Dev-only playtest logger. The app (in __DEV__, with EXPO_PUBLIC_PLAYLOG_URL set) POSTs one JSON
// line per finished game and per "how did it feel" answer; this appends them to playtest/<date>.jsonl
// at the repo root so the session can be analyzed against the bot simulator.
// Run: node --experimental-strip-types scripts/playlog-server.ts   (listens on :8787)
import { appendFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';

const PORT = Number(process.env.PORT ?? 8787);
const DIR = join(import.meta.dirname, '..', '..', '..', 'playtest');
mkdirSync(DIR, { recursive: true });
const file = join(DIR, `${new Date().toISOString().slice(0, 10)}.jsonl`);

createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(404).end();
    return;
  }
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    try {
      const entry = { ...JSON.parse(body), receivedAt: new Date().toISOString() };
      appendFileSync(file, JSON.stringify(entry) + '\n');
      if (entry.type === 'game')
        console.log(
          `nivel ${entry.level}  ${entry.status === 'won' ? 'GANÓ ' : 'perdió'}  ${entry.movesUsed}/${entry.moves} movs  ` +
            `${entry.score} pts  ${entry.stars}★  ${entry.seconds}s  combo máx ${entry.maxCombo}`,
        );
      else console.log(`nivel ${entry.level}  se sintió: ${entry.feel}`);
      res.writeHead(204).end();
    } catch {
      res.writeHead(400).end();
    }
  });
}).listen(PORT, '0.0.0.0', () => console.log(`playlog → ${file} (puerto ${PORT})`));
