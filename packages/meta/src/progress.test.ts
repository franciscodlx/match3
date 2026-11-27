import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentLevel, emptyProgress, isUnlocked, parseProgress, recordGame, totalStars, updateSettings } from './progress.ts';

const order = ['1', '2', '3'];

test('a fresh player has only the first level open', () => {
  const p = emptyProgress();
  assert.deepEqual(order.map((id) => isUnlocked(p, order, id)), [true, false, false]);
  assert.equal(currentLevel(p, order), '1');
  assert.equal(isUnlocked(p, order, 'nope'), false);
});

test('losing does not open the next level; winning does', () => {
  let p = recordGame(emptyProgress(), '1', { won: false, stars: 0, score: 900 });
  assert.equal(isUnlocked(p, order, '2'), false);
  assert.deepEqual(p.levels['1'], { stars: 0, best: 0, plays: 1, wins: 0 });
  p = recordGame(p, '1', { won: true, stars: 2, score: 1500 });
  assert.equal(isUnlocked(p, order, '2'), true);
  assert.equal(currentLevel(p, order), '2');
});

test('stars and best score only go up', () => {
  let p = recordGame(emptyProgress(), '1', { won: true, stars: 3, score: 2500 });
  p = recordGame(p, '1', { won: true, stars: 1, score: 1100 });
  p = recordGame(p, '1', { won: false, stars: 0, score: 3000 });
  assert.deepEqual(p.levels['1'], { stars: 3, best: 2500, plays: 3, wins: 2 });
  assert.equal(totalStars(p), 3);
});

test('after the last level, current stays on the last', () => {
  let p = emptyProgress();
  for (const id of order) p = recordGame(p, id, { won: true, stars: 1, score: 1 });
  assert.equal(currentLevel(p, order), '3');
});

test('progress survives a save/load round trip', () => {
  let p = recordGame(emptyProgress(), '1', { won: true, stars: 2, score: 1700 });
  p = updateSettings(p, { sound: false });
  assert.deepEqual(parseProgress(JSON.stringify(p)), p);
});

test('a corrupt save falls back field by field instead of crashing', () => {
  assert.deepEqual(parseProgress(null), emptyProgress());
  assert.deepEqual(parseProgress('{not json'), emptyProgress());
  const p = parseProgress(
    JSON.stringify({
      levels: { '1': { stars: 2, best: 1500, plays: 3, wins: 1 }, '2': { stars: 9, best: 1, plays: 1, wins: 1 }, '3': 'x' },
      settings: { sound: 'loud', haptics: false },
    }),
  );
  assert.deepEqual(Object.keys(p.levels), ['1']);
  assert.deepEqual(p.settings, { sound: true, haptics: false, notifications: true });
});
