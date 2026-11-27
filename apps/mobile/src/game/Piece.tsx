import { memo, useEffect } from 'react';
import { Group, RoundedRect } from '@shopify/react-native-skia';
import { useDerivedValue, useSharedValue, type SharedValue } from 'react-native-reanimated';

export type PieceAnim = { x: SharedValue<number>; y: SharedValue<number>; s: SharedValue<number> };

const PAD = 3;

type Props = {
  id: number;
  color: string;
  cell: number;
  row: number; // initial position only; afterwards the shared values drive it
  col: number;
  register: (id: number, anim: PieceAnim) => void;
};

/** One board piece. Position and scale live on the UI thread; React only re-renders on color change. */
export const Piece = memo(function Piece({ id, color, cell, row, col, register }: Props) {
  const x = useSharedValue(col * cell);
  const y = useSharedValue(row * cell);
  const s = useSharedValue(1);
  useEffect(() => register(id, { x, y, s }), [id, register, x, y, s]);

  const size = cell - PAD * 2;
  const transform = useDerivedValue(() => {
    const offset = PAD + ((1 - s.value) * size) / 2;
    return [{ translateX: x.value + offset }, { translateY: y.value + offset }, { scale: s.value }];
  });
  return (
    <Group transform={transform}>
      <RoundedRect x={0} y={0} width={size} height={size} r={size * 0.24} color={color} />
      {/* Top highlight gives the flat square a little volume. */}
      <RoundedRect x={size * 0.16} y={size * 0.1} width={size * 0.68} height={size * 0.22} r={size * 0.11} color="rgba(255,255,255,0.28)" />
    </Group>
  );
});
