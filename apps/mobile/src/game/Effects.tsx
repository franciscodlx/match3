// Board "juice" drawn inside the board's Skia canvas, over the pieces:
// particle bursts where pieces clear, and a beam/ring where a special goes off.
// Each effect is a slot with a fixed set of Skia nodes; firing one just refills its data and
// restarts its progress, so nothing mounts or unmounts during play and the UI thread draws it all.
import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Circle, Group, Path, Rect, Skia } from '@shopify/react-native-skia';
import { Easing, makeMutable, useDerivedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import type { Kind } from '@match3/game-core';
import { PIECE_COLORS } from '../theme';

export type EffectsHandle = {
  /** Particles from each cell, in that cell's piece color (index into PIECE_COLORS, or -1 for white). */
  burst: (cells: { r: number; c: number; color: number }[]) => void;
  /** Beam (lines) or shockwave ring (bombs) for a special that fired at (r, c). */
  blast: (r: number, c: number, kind: Kind) => void;
};

const PARTICLE_SLOTS = 4; // a burst lasts ~2 cascade steps, so 4 slots never visibly recycle
const BLAST_SLOTS = 6;
const PER_CELL = 5;
const LIFE = 560;
const BLAST_LIFE = 380;
const PALETTE = [...PIECE_COLORS, '#FFFFFF'];
const WHITE = PALETTE.length - 1;

type Props = { cell: number; size: number; ref?: Ref<EffectsHandle> };

export function Effects({ cell, size, ref }: Props) {
  const [particles] = useState(() => makeSlots(PARTICLE_SLOTS));
  const [blasts] = useState(() => makeSlots(BLAST_SLOTS));
  const next = useRef({ particle: 0, blast: 0 }); // round-robin over slots, kept across re-renders

  useImperativeHandle(ref, () => ({
    burst(cells) {
      const slot = particles[next.current.particle++ % PARTICLE_SLOTS];
      // Flat array: x, y, vx, vy, palette index, radius (px, px/s, px/s, -, px).
      const data: number[] = [];
      for (const { r, c, color } of cells) {
        for (let i = 0; i < PER_CELL; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = cell * (2.2 + Math.random() * 3.2);
          data.push(
            (c + 0.5) * cell,
            (r + 0.5) * cell,
            Math.cos(angle) * speed,
            Math.sin(angle) * speed - cell * 2.5, // a little upward kick
            color < 0 ? WHITE : color,
            cell * (0.07 + Math.random() * 0.06),
          );
        }
      }
      slot.data.value = data;
      slot.progress.value = 0;
      slot.progress.value = withTiming(1, { duration: LIFE, easing: Easing.linear });
    },
    blast(r, c, kind) {
      const code = kind === 'lineH' ? 1 : kind === 'lineV' ? 2 : kind === 'bomb' ? 3 : kind === 'colorBomb' ? 4 : 0;
      if (!code) return;
      const slot = blasts[next.current.blast++ % BLAST_SLOTS];
      slot.data.value = [code, r, c];
      slot.progress.value = 0;
      slot.progress.value = withTiming(1, { duration: BLAST_LIFE, easing: Easing.out(Easing.quad) });
    },
  }));

  return (
    <Group>
      {blasts.map((s, i) => (
        <BlastView key={`b${i}`} slot={s} cell={cell} size={size} />
      ))}
      {particles.map((s, i) => (
        <ParticleView key={`p${i}`} slot={s} cell={cell} />
      ))}
    </Group>
  );
}

type Slot = { data: SharedValue<number[]>; progress: SharedValue<number> };
const makeSlots = (n: number): Slot[] =>
  Array.from({ length: n }, () => ({ data: makeMutable<number[]>([]), progress: makeMutable(1) }));

/** One path per color: a burst of 300+ particles is still only 7 draw calls. */
function ParticleView({ slot, cell }: { slot: Slot; cell: number }) {
  return (
    <>
      {PALETTE.map((color, idx) => (
        <ParticleColor key={color} slot={slot} cell={cell} idx={idx} color={color} />
      ))}
    </>
  );
}

function ParticleColor({ slot, cell, idx, color }: { slot: Slot; cell: number; idx: number; color: string }) {
  const path = useDerivedValue(() => {
    const p = Skia.PathBuilder.Make();
    const t = slot.progress.value;
    if (t >= 1) return p.detach();
    const sec = (t * LIFE) / 1000;
    const gravity = cell * 16;
    const d = slot.data.value;
    for (let i = 0; i < d.length; i += 6) {
      if (d[i + 4] !== idx) continue;
      const x = d[i] + d[i + 2] * sec;
      const y = d[i + 1] + d[i + 3] * sec + 0.5 * gravity * sec * sec;
      p.addCircle(x, y, d[i + 5] * (1 - t));
    }
    return p.detach();
  });
  return <Path path={path} color={color} />;
}

function BlastView({ slot, cell, size }: { slot: Slot; cell: number; size: number }) {
  const kind = useDerivedValue(() => (slot.progress.value >= 1 ? 0 : slot.data.value[0] ?? 0));
  const fade = useDerivedValue(() => 1 - slot.progress.value);
  const beamH = useDerivedValue(() => {
    const h = cell * (0.25 + 0.75 * (1 - slot.progress.value));
    return { x: 0, y: ((slot.data.value[1] ?? 0) + 0.5) * cell - h / 2, width: size, height: h };
  });
  const beamV = useDerivedValue(() => {
    const w = cell * (0.25 + 0.75 * (1 - slot.progress.value));
    return { x: ((slot.data.value[2] ?? 0) + 0.5) * cell - w / 2, y: 0, width: w, height: size };
  });
  const hOpacity = useDerivedValue(() => (kind.value === 1 ? fade.value * 0.85 : 0));
  const vOpacity = useDerivedValue(() => (kind.value === 2 ? fade.value * 0.85 : 0));
  const ringOpacity = useDerivedValue(() => (kind.value >= 3 ? fade.value : 0));
  const cx = useDerivedValue(() => ((slot.data.value[2] ?? 0) + 0.5) * cell);
  const cy = useDerivedValue(() => ((slot.data.value[1] ?? 0) + 0.5) * cell);
  // Bomb ring reaches its 3x3 edge; a color bomb's wave sweeps most of the board.
  const radius = useDerivedValue(() => cell * (0.4 + slot.progress.value * (kind.value === 4 ? 5.5 : 1.6)));
  const stroke = useDerivedValue(() => cell * 0.35 * (1 - slot.progress.value) + 1);

  return (
    <>
      <Rect rect={beamH} color="#FFFFFF" opacity={hOpacity} />
      <Rect rect={beamV} color="#FFFFFF" opacity={vOpacity} />
      <Circle cx={cx} cy={cy} r={radius} style="stroke" strokeWidth={stroke} color="#FFF3C4" opacity={ringOpacity} />
    </>
  );
}
