import { RoundedRect } from '@shopify/react-native-skia';
import { SIZE } from '@match3/game-core';

const FILL = ['transparent', 'rgba(255,122,198,0.22)', 'rgba(255,122,198,0.45)'];

/** Jelly under the pieces: fixed to its cell, darker with more layers. */
export function Jelly({ layers, cell }: { layers: number[]; cell: number }) {
  return (
    <>
      {layers.map((n, k) =>
        n > 0 ? (
          <RoundedRect
            key={k}
            x={(k % SIZE) * cell + 1}
            y={Math.floor(k / SIZE) * cell + 1}
            width={cell - 2}
            height={cell - 2}
            r={cell * 0.2}
            color={FILL[Math.min(n, FILL.length - 1)]}
          />
        ) : null,
      )}
    </>
  );
}
