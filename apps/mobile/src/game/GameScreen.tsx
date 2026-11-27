import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Canvas } from '@shopify/react-native-skia';
import Animated, { Easing, FadeIn, FadeOut, ZoomIn, withTiming } from 'react-native-reanimated';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { SIZE, newGame, playSwap, type Board, type Cell, type GameState, type Level } from '@match3/game-core';
import { PIECE_COLORS, colors as theme } from '../theme';
import { Piece, type PieceAnim } from './Piece';
import { useFpsMeter, type FpsSummary } from './useFpsMeter';

const T = { swap: 140, clear: 170, fallBase: 140, fallPerRow: 40, reshuffle: 220 };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Props = {
  level: Level;
  hasNext: boolean;
  onRetry: () => void;
  onNext: () => void;
};

type Hud = { score: number; movesLeft: number; combo: number; comboKey: number };
type Ending = { status: 'won' | 'lost'; score: number; movesLeft: number; perf: FpsSummary };

export function GameScreen({ level, hasNext, onRetry, onNext }: Props) {
  const { width } = useWindowDimensions();
  const boardPx = Math.min(width - 24, 480);
  const cell = boardPx / SIZE;

  // The engine state lives in a ref (it changes mid-animation); React only mirrors what is drawn.
  const [initial] = useState(() => newGame(level));
  const game = useRef<GameState>(initial);
  const [pieceColors, setPieceColors] = useState<number[]>(initial.board.colors);
  // Where each piece id starts; only read on first mount, afterwards the anims own position.
  const [initialPos] = useState(() =>
    initial.board.grid.flatMap((row, r) => row.map((id, c) => ({ id, r, c }))).sort((a, b) => a.id - b.id),
  );
  const anims = useRef<PieceAnim[]>([]);
  const busy = useRef(false);
  const register = useCallback((id: number, a: PieceAnim) => {
    anims.current[id] = a;
  }, []);

  const [hud, setHud] = useState<Hud>({ score: 0, movesLeft: level.moves, combo: 0, comboKey: 0 });
  const [ending, setEnding] = useState<Ending | null>(null);
  const { fps, summarize } = useFpsMeter();

  // ── Animation primitives (JS decides, UI thread animates) ──
  const moveTo = (id: number, r: number, c: number, ms: number) => {
    const a = anims.current[id];
    a.x.value = withTiming(c * cell, { duration: ms, easing: Easing.out(Easing.quad) });
    a.y.value = withTiming(r * cell, { duration: ms, easing: Easing.out(Easing.quad) });
  };
  const scaleAll = (ids: number[], to: number, ms: number) => {
    for (const id of ids) anims.current[id].s.value = withTiming(to, { duration: ms });
  };

  /** Plays one turn: the engine resolves it instantly, then we animate its steps in order. */
  const onSwipe = async (a: Cell, b: Cell) => {
    if (busy.current || game.current.status !== 'playing') return;
    busy.current = true;
    try {
      const before = game.current;
      const turn = playSwap(before, a, b);
      const idA = before.board.grid[a.r][a.c];
      const idB = before.board.grid[b.r][b.c];
      moveTo(idA, b.r, b.c, T.swap);
      moveTo(idB, a.r, a.c, T.swap);
      await wait(T.swap);

      if (!turn.valid) {
        moveTo(idA, a.r, a.c, T.swap);
        moveTo(idB, b.r, b.c, T.swap);
        await wait(T.swap);
        return;
      }

      setHud((h) => ({ ...h, movesLeft: turn.state.movesLeft }));
      let prev: Board = turn.swapped!;
      for (const step of turn.steps) {
        scaleAll(step.cleared.map(({ r, c }) => prev.grid[r][c]), 0, T.clear);
        setHud((h) => ({
          ...h,
          score: h.score + step.points,
          combo: step.combo,
          comboKey: step.combo > 1 ? h.comboKey + 1 : h.comboKey,
        }));
        await wait(T.clear);

        setPieceColors(step.board.colors);
        let longest = 0;
        for (const m of step.moves) {
          const anim = anims.current[m.id];
          if (m.spawned) {
            // Recycled piece: jump above the board (clipped by the canvas), restore size, then fall.
            anim.x.value = m.col * cell;
            anim.y.value = m.fromRow * cell;
            anim.s.value = 1;
          }
          const ms = T.fallBase + T.fallPerRow * (m.toRow - m.fromRow);
          longest = Math.max(longest, ms);
          anim.y.value = withTiming(m.toRow * cell, { duration: ms, easing: Easing.out(Easing.cubic) });
        }
        await wait(longest);
        prev = step.board;
      }

      if (turn.reshuffled) {
        const ids = turn.reshuffled.grid.flat();
        scaleAll(ids, 0, T.reshuffle);
        await wait(T.reshuffle);
        setPieceColors(turn.reshuffled.colors);
        scaleAll(ids, 1, T.reshuffle);
        await wait(T.reshuffle);
      }

      game.current = turn.state;
      setHud((h) => ({ ...h, score: turn.state.score, combo: 0 }));
      if (turn.state.status !== 'playing') {
        await wait(300);
        setEnding({ status: turn.state.status, score: turn.state.score, movesLeft: turn.state.movesLeft, perf: summarize() });
      }
    } finally {
      busy.current = false;
    }
  };

  // ── Gesture: swipe from a cell towards a neighbour ──
  const pan = usePanGesture({
    runOnJS: true,
    minDistance: 10,
    onDeactivate: (e) => {
      if (e.canceled) return;
      const from = { r: Math.floor((e.y - e.translationY) / cell), c: Math.floor((e.x - e.translationX) / cell) };
      if (from.r < 0 || from.r >= SIZE || from.c < 0 || from.c >= SIZE) return;
      const horizontal = Math.abs(e.translationX) > Math.abs(e.translationY);
      const to = horizontal
        ? { r: from.r, c: from.c + Math.sign(e.translationX) }
        : { r: from.r + Math.sign(e.translationY), c: from.c };
      if (to.r < 0 || to.r >= SIZE || to.c < 0 || to.c >= SIZE) return;
      onSwipe(from, to);
    },
  });

  const progress = Math.min(1, hud.score / level.targetScore);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Nivel</Text>
          <Text style={styles.statValue}>{level.id}</Text>
        </View>
        <View style={[styles.stat, styles.statWide]}>
          <Text style={styles.statLabel}>
            Puntos · meta {level.targetScore.toLocaleString('es-MX')}
          </Text>
          <Text style={styles.statValue}>{hud.score.toLocaleString('es-MX')}</Text>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${progress * 100}%` }]} />
          </View>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Movs</Text>
          <Text style={[styles.statValue, hud.movesLeft <= 3 && { color: theme.bad }]}>{hud.movesLeft}</Text>
        </View>
      </View>

      <View style={styles.comboSlot}>
        {hud.combo > 1 && (
          <Animated.Text key={hud.comboKey} entering={ZoomIn.duration(160)} exiting={FadeOut.duration(200)} style={styles.combo}>
            ¡Combo ×{hud.combo}!
          </Animated.Text>
        )}
      </View>

      <GestureDetector gesture={pan}>
        <View style={[styles.board, { width: boardPx, height: boardPx }]}>
          <Canvas style={{ width: boardPx, height: boardPx }}>
            {pieceColors.map((color, id) => (
              <Piece
                key={id}
                id={id}
                color={PIECE_COLORS[color]}
                cell={cell}
                row={initialPos[id].r}
                col={initialPos[id].c}
                register={register}
              />
            ))}
          </Canvas>
        </View>
      </GestureDetector>

      <Text style={styles.fps}>{fps} fps</Text>

      {ending && (
        <Animated.View entering={FadeIn.duration(200)} style={styles.overlay}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{ending.status === 'won' ? '¡Nivel superado!' : 'Sin movimientos'}</Text>
            <Text style={styles.cardScore}>{ending.score.toLocaleString('es-MX')} puntos</Text>
            <Text style={styles.cardDim}>
              Meta {level.targetScore.toLocaleString('es-MX')} ·{' '}
              {ending.status === 'won' ? `te sobraron ${ending.movesLeft} movimientos` : `faltaron ${(level.targetScore - ending.score).toLocaleString('es-MX')}`}
            </Text>
            <Text style={styles.cardPerf}>
              Rendimiento: prom {ending.perf.avgFps} fps · mín {ending.perf.minFps} · frames lentos {ending.perf.slowPct}% ·{' '}
              {ending.perf.seconds} s
            </Text>
            <View style={styles.cardActions}>
              <Pressable style={[styles.btn, styles.btnGhost]} onPress={onRetry}>
                <Text style={styles.btnText}>Reintentar</Text>
              </Pressable>
              {ending.status === 'won' && hasNext && (
                <Pressable style={styles.btn} onPress={onNext}>
                  <Text style={styles.btnText}>Siguiente nivel</Text>
                </Pressable>
              )}
            </View>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg, alignItems: 'center', paddingTop: 64 },
  header: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, alignSelf: 'stretch' },
  stat: { backgroundColor: theme.surface, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center', minWidth: 72 },
  statWide: { flex: 1, alignItems: 'stretch' },
  statLabel: { color: theme.textDim, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  statValue: { color: theme.text, fontSize: 24, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'] },
  bar: { height: 6, borderRadius: 3, backgroundColor: theme.surfaceHi, marginTop: 6, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: theme.good },
  comboSlot: { height: 56, justifyContent: 'center' },
  combo: { color: '#FFB400', fontSize: 26, fontWeight: '900' },
  board: { backgroundColor: theme.surface, borderRadius: 16, overflow: 'hidden' },
  fps: { color: theme.textDim, fontSize: 12, marginTop: 12, fontVariant: ['tabular-nums'] },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8,10,20,0.78)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: theme.surface, borderRadius: 20, padding: 24, alignSelf: 'stretch', gap: 8 },
  cardTitle: { color: theme.text, fontSize: 26, fontWeight: '800', textAlign: 'center' },
  cardScore: { color: theme.good, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  cardDim: { color: theme.textDim, fontSize: 14, textAlign: 'center' },
  cardPerf: { color: theme.textDim, fontSize: 12, textAlign: 'center', marginTop: 8 },
  cardActions: { flexDirection: 'row', gap: 12, justifyContent: 'center', marginTop: 12 },
  btn: { backgroundColor: theme.accent, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24 },
  btnGhost: { backgroundColor: theme.surfaceHi },
  btnText: { color: theme.text, fontWeight: '700', fontSize: 15 },
});
