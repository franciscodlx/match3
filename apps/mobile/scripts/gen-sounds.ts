// Synthesizes the game's sound effects as 16-bit mono WAVs in assets/sfx.
// Everything is generated from code (no third-party samples), so the sounds are ours and reproducible.
// Run: node --experimental-strip-types scripts/gen-sounds.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RATE = 44100;
const OUT = join(import.meta.dirname, '..', 'assets', 'sfx');

type Voice = (t: number) => number; // t in seconds → sample in -1..1

function render(seconds: number, voice: Voice, gain = 0.8): Float32Array {
  const n = Math.round(seconds * RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = voice(i / RATE) * gain;
  // 4 ms fade in/out so no sound clicks at its edges.
  const fade = Math.round(0.004 * RATE);
  for (let i = 0; i < fade && i < n; i++) {
    out[i] *= i / fade;
    out[n - 1 - i] *= i / fade;
  }
  return out;
}

function wav(samples: Float32Array): Buffer {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), 44 + i * 2));
  return buf;
}

// ── Building blocks ──
const TAU = Math.PI * 2;
const env = (t: number, attack: number, decay: number) => (t < attack ? t / attack : Math.exp(-(t - attack) / decay));
let seed = 7;
const noise = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return (seed / 0x7fffffff) * 2 - 1;
};
/** Sine whose frequency glides from f0 to f1 over `glide` seconds (phase is integrated, so no clicks). */
function glide(f0: number, f1: number, glideSec: number): Voice {
  let phase = 0;
  let last = 0;
  return (t) => {
    const f = t >= glideSec ? f1 : f0 + (f1 - f0) * (t / glideSec);
    phase += TAU * f * (t - last);
    last = t;
    return Math.sin(phase);
  };
}
/** One-pole low-pass over noise: soft "whoosh" material. */
function softNoise(cut: number): Voice {
  let y = 0;
  return () => (y += cut * (noise() - y));
}
const note = (semitonesFromA4: number) => 440 * 2 ** (semitonesFromA4 / 12);
const mix =
  (...vs: [Voice, number][]): Voice =>
  (t) =>
    vs.reduce((s, [v, g]) => s + v(t) * g, 0);
/** A short bell-ish tone: sine + a quieter octave, plucked envelope. */
function pluck(freq: number, decay = 0.12): Voice {
  return (t) => (Math.sin(TAU * freq * t) + 0.35 * Math.sin(TAU * freq * 2 * t)) * env(t, 0.004, decay);
}
function sequence(notes: { at: number; v: Voice }[]): Voice {
  return (t) => notes.reduce((s, n) => (t >= n.at ? s + n.v(t - n.at) : s), 0);
}

// ── The sounds ──
const sounds: Record<string, Float32Array> = {};

// Swap: quick airy whoosh.
{
  const n = softNoise(0.18);
  sounds.swap = render(0.11, (t) => n(t) * Math.sin((Math.PI * t) / 0.11), 0.55);
}
// Invalid swap: two low dull blips.
{
  const a = glide(220, 180, 0.07);
  const b = glide(200, 150, 0.08);
  sounds.invalid = render(0.24, (t) => (t < 0.1 ? a(t) * env(t, 0.003, 0.03) : b(t - 0.12) * env(t - 0.12, 0.003, 0.035)), 0.5);
}
// Match pops: a bubbly upward chirp; pitch climbs with the combo (major pentatonic from C5).
[3, 5, 7, 10, 12, 15].forEach((st, i) => {
  const f = note(st);
  const g = glide(f * 0.7, f, 0.04);
  sounds[`pop${i + 1}`] = render(0.18, (t) => (g(t) + 0.25 * Math.sin(TAU * f * 2 * t)) * env(t, 0.003, 0.05), 0.6);
});
// Special created: rising three-note shimmer.
sounds.create = render(
  0.36,
  sequence([note(15), note(19), note(22)].map((f, i) => ({ at: i * 0.06, v: pluck(f, 0.1) }))),
  0.4,
);
// Line blast: a laser zap sweeping down.
{
  const g = glide(1800, 220, 0.22);
  const n = softNoise(0.5);
  sounds.line = render(0.26, (t) => (Math.sign(g(t)) * 0.5 + 0.5 * n(t) * 0.3) * env(t, 0.002, 0.08), 0.35);
}
// Bomb: low thump plus a burst of noise.
{
  const body = glide(140, 45, 0.25);
  const n = softNoise(0.25);
  sounds.bomb = render(0.5, mix([(t) => body(t) * env(t, 0.003, 0.14), 1], [(t) => n(t) * env(t, 0.002, 0.07), 0.9]), 0.8);
}
// Color bomb: sparkly sweep up.
{
  const g = glide(400, 2400, 0.35);
  sounds.colorBomb = render(
    0.55,
    mix([(t) => g(t) * env(t, 0.02, 0.2), 0.6], [sequence([0, 0.08, 0.16, 0.24].map((at, i) => ({ at, v: pluck(note(24 + i * 4), 0.08) }))), 0.5]),
    0.5,
  );
}
// Win: bright arpeggio C-E-G-C.
sounds.win = render(1.0, sequence([3, 7, 10, 15].map((st, i) => ({ at: i * 0.11, v: pluck(note(st), i === 3 ? 0.4 : 0.15) }))), 0.45);
// Lose: soft descending minor.
sounds.lose = render(0.9, sequence([10, 6, 3, -2].map((st, i) => ({ at: i * 0.14, v: pluck(note(st), i === 3 ? 0.35 : 0.14) }))), 0.4);

mkdirSync(OUT, { recursive: true });
for (const [name, samples] of Object.entries(sounds)) {
  writeFileSync(join(OUT, `${name}.wav`), wav(samples));
  console.log(`${name}.wav  ${(samples.length / RATE).toFixed(2)} s`);
}
