import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateLevels } from './validate.ts';
import { playBot } from './bot.ts';

const raw = JSON.parse(readFileSync(new URL('./levels.json', import.meta.url), 'utf8'));

test('launch set: 15 valid levels with stars', () => {
  const levels = validateLevels(raw);
  assert.equal(levels.length, 15);
  levels.forEach((l, i) => {
    assert.equal(l.id, String(i + 1));
    assert.ok(l.stars, `level ${l.id} has stars`);
  });
});

test('validator rejects broken data with the level id', () => {
  const base = { id: 'x', seed: 1, moves: 10, goals: [{ type: 'score', target: 100 }] };
  assert.throws(() => validateLevels([{ ...base, moves: 0 }]), /level x: moves/);
  assert.throws(() => validateLevels([{ ...base, goals: [{ type: 'jelly' }] }]), /level x: jelly goal/);
  assert.throws(() => validateLevels([{ ...base, colors: 4, goals: [{ type: 'collect', color: 5, count: 3 }] }]), /collect color/);
  assert.throws(() => validateLevels([{ ...base, jelly: ['........'] }]), /8 rows/);
  assert.throws(() => validateLevels([base, base]), /duplicate id/);
});

test('every level can be won by a strong player', () => {
  for (const level of validateLevels(raw)) {
    const wins = Array.from({ length: 10 }, (_, i) => playBot(level, i, 1)).filter((r) => r.won).length;
    assert.ok(wins >= 3, `level ${level.id}: strong bot won ${wins}/10`);
  }
});
