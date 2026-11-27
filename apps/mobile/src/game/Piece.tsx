import { memo, useEffect } from 'react';
import { Circle, Group, RoundedRect } from '@shopify/react-native-skia';
import { useDerivedValue, useSharedValue, type SharedValue } from 'react-native-reanimated';
import type { Kind } from '@match3/game-core';
import { PIECE_COLORS } from '../theme';

export type PieceAnim = { x: SharedValue<number>; y: SharedValue<number>; s: SharedValue<number> };

const PAD = 3;
const STRIPE = 'rgba(255,255,255,0.85)';
const SHINE = 'rgba(255,255,255,0.28)';

type Props = {
  id: number;
  color: string;
  kind: Kind;
  cell: number;
  row: number; // initial position only; afterwards the shared values drive it
  col: number;
  register: (id: number, anim: PieceAnim) => void;
};

/** One board piece. Position and scale live on the UI thread; React only re-renders on color/kind change. */
export const Piece = memo(function Piece({ id, color, kind, cell, row, col, register }: Props) {
  const x = useSharedValue(col * cell);
  const y = useSharedValue(row * cell);
  const s = useSharedValue(1);
  useEffect(() => register(id, { x, y, s }), [id, register, x, y, s]);

  const size = cell - PAD * 2;
  const transform = useDerivedValue(() => {
    const offset = PAD + ((1 - s.value) * size) / 2;
    return [{ translateX: x.value + offset }, { translateY: y.value + offset }, { scale: s.value }];
  });
  return <Group transform={transform}>{shape(kind, color, size)}</Group>;
});

function shape(kind: Kind, color: string, size: number) {
  const half = size / 2;
  switch (kind) {
    case 'lineH':
    case 'lineV': {
      const vertical = kind === 'lineV';
      const t = size * 0.09; // stripe thickness
      return (
        <>
          <RoundedRect x={0} y={0} width={size} height={size} r={size * 0.24} color={color} />
          {[0.3, 0.5, 0.7].map((f) =>
            vertical ? (
              <RoundedRect key={f} x={size * f - t / 2} y={size * 0.14} width={t} height={size * 0.72} r={t / 2} color={STRIPE} />
            ) : (
              <RoundedRect key={f} x={size * 0.14} y={size * f - t / 2} width={size * 0.72} height={t} r={t / 2} color={STRIPE} />
            ),
          )}
        </>
      );
    }
    case 'bomb':
      return (
        <>
          <Circle cx={half} cy={half} r={half} color={color} />
          <Circle cx={half} cy={half} r={half * 0.62} color="rgba(0,0,0,0.35)" />
          <Circle cx={half} cy={half} r={half * 0.3} color={STRIPE} />
        </>
      );
    case 'colorBomb':
      return (
        <>
          <Circle cx={half} cy={half} r={half} color="#20253A" />
          {PIECE_COLORS.map((c, i) => {
            const a = (i / PIECE_COLORS.length) * Math.PI * 2;
            return <Circle key={c} cx={half + Math.cos(a) * half * 0.55} cy={half + Math.sin(a) * half * 0.55} r={half * 0.2} color={c} />;
          })}
          <Circle cx={half} cy={half} r={half * 0.18} color="#FFFFFF" />
        </>
      );
    default:
      return (
        <>
          <RoundedRect x={0} y={0} width={size} height={size} r={size * 0.24} color={color} />
          {/* Top highlight gives the flat square a little volume. */}
          <RoundedRect x={size * 0.16} y={size * 0.1} width={size * 0.68} height={size * 0.22} r={size * 0.11} color={SHINE} />
        </>
      );
  }
}
