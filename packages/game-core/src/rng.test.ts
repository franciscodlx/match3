import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rngFrom, seedState } from './rng.ts';

test('same seed gives the same sequence', () => {
  const a = rngFrom(seedState('nivel-1'));
  const b = rngFrom(seedState('nivel-1'));
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
});

test('state can be persisted and resumed mid-sequence', () => {
  const a = rngFrom(42);
  for (let i = 0; i < 10; i++) a.next();
  const resumed = rngFrom(a.state);
  for (let i = 0; i < 10; i++) assert.equal(resumed.next(), a.next());
});

test('values are in [0, 1) and roughly uniform', () => {
  const r = rngFrom(seedState(7));
  const buckets = new Array(6).fill(0);
  for (let i = 0; i < 60000; i++) {
    const v = r.next();
    assert.ok(v >= 0 && v < 1);
    buckets[Math.floor(v * 6)]++;
  }
  for (const n of buckets) assert.ok(Math.abs(n - 10000) < 500, `bucket ${n}`);
});
