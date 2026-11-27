import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Canvas } from '@shopify/react-native-skia';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  FadeOutUp,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import {
  SIZE,
  continueGame,
  findValidSwaps,
  goalProgress,
  newGame,
  playSwap,
  starsFor,
  type Board,
  type Cell,
  type GameState,
  type Kind,
  type Level,
} from '@match3/game-core';
import { PIECE_COLORS, colors as theme } from '../theme';
import { Effects, type EffectsHandle } from './Effects';
import { feedback } from './feedback';
import { Goals } from './Goals';
import { winCoins } from '@match3/meta';
import { Jelly } from './Jelly';
import { Piece, type PieceAnim } from './Piece';
import { playlog, playlogEnabled, type FeelLog } from './playlog';
import { useFpsMeter, type FpsSummary } from './useFpsMeter';

const T = { swap: 140, clear: 170, fallBase: 140, fallPerRow: 40, reshuffle: 220 };
const HINT_AFTER_MS = 5000; // idle time before a valid move starts pulsing
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Props = {
  level: Level;
  hasNext: boolean;
  onRetry: () => void;
  onNext: () => void;
  onExit: () => void;
  onWin: (result: GameResult) => void;
  /** The loss became final: the player left a lost game, or quit mid-game. Costs a life. */
  onLoss: (result: GameResult) => void;
  coins: number;
  continueCost: number;
  /** Pays for a continue; false if the player can't afford it. */
  onContinue: () => boolean;
};
type GameResult = { won: boolean; stars: number; score: number };

type Hud = { score: number; movesLeft: number; combo: number; comboKey: number; collected: number[]; jelly: number[] };
type Ending = { state: GameState; stars: number; perf: FpsSummary; feel?: FeelLog['feel'] };
type Popup = { key: number; x: number; y: number; points: number };
const fmt = (n: number) => n.toLocaleString('es-MX');

export function GameScreen(props: Props) {
  const { level, hasNext, onRetry, onNext, onExit, onWin, onLoss, coins, continueCost, onContinue } = props;
  const { width } = useWindowDimensions();
  const boardPx = Math.min(width - 24, 480);
  const cell = boardPx / SIZE;

  // The engine state lives in a ref (it changes mid-animation); React only mirrors what is drawn.
  const [initial] = useState(() => newGame(level));
  const game = useRef<GameState>(initial);
  const [pieceColors, setPieceColors] = useState<number[]>(initial.board.colors);
  const [pieceKinds, setPieceKinds] = useState<Kind[]>(initial.board.kinds);
  const showBoard = (b: Board) => {
    setPieceColors(b.colors);
    setPieceKinds(b.kinds);
  };
  // Where each piece id starts; only read on first mount, afterwards the anims own position.
  const [initialPos] = useState(() =>
    initial.board.grid.flatMap((row, r) => row.map((id, c) => ({ id, r, c }))).sort((a, b) => a.id - b.id),
  );
  const anims = useRef<PieceAnim[]>([]);
  const busy = useRef(false);
  const register = useCallback((id: number, a: PieceAnim) => {
    anims.current[id] = a;
  }, []);

  const [hud, setHud] = useState<Hud>({
    score: 0,
    movesLeft: level.moves,
    combo: 0,
    comboKey: 0,
    collected: initial.collected,
    jelly: initial.jelly,
  });
  const [ending, setEnding] = useState<Ending | null>(null);
  const { fps, summarize } = useFpsMeter();
  const effects = useRef<EffectsHandle>(null);
  const [popups, setPopups] = useState<Popup[]>([]);
  const popupKey = useRef(0);

  // ── Hint: after a few idle seconds, two pieces that make a match pulse until the next move ──
  const hint = useRef<{ timer?: ReturnType<typeof setTimeout>; ids: number[] }>({ ids: [] });
  const clearHint = () => {
    clearTimeout(hint.current.timer);
    for (const id of hint.current.ids) anims.current[id].s.value = withTiming(1, { duration: 120 });
    hint.current = { ids: [] };
  };
  const scheduleHint = () => {
    clearHint();
    hint.current.timer = setTimeout(() => {
      const g = game.current;
      if (busy.current || g.status !== 'playing') return;
      const options = findValidSwaps(g.board);
      if (!options.length) return;
      const [a, b] = options[Math.floor(Math.random() * options.length)];
      hint.current.ids = [g.board.grid[a.r][a.c], g.board.grid[b.r][b.c]];
      for (const id of hint.current.ids)
        anims.current[id].s.value = withRepeat(
          withSequence(withTiming(1.14, { duration: 320 }), withTiming(0.94, { duration: 320 })),
          -1,
          true,
        );
    }, HINT_AFTER_MS);
  };
  useEffect(() => {
    scheduleHint();
    return () => clearTimeout(hint.current.timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on mount; later calls come from onSwipe
  }, []);
  // Playtest stats for this attempt; the clock starts on the first accepted move.
  const stats = useRef({ startedAt: 0, maxCombo: 0, created: 0, fired: 0, invalid: 0, reshuffles: 0 });

  // Board shake for big blasts (UI thread).
  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));
  const doShake = (px: number) => {
    shake.value = withSequence(
      ...[px, -px, px * 0.6, -px * 0.6, px * 0.3, 0].map((v) => withTiming(v, { duration: 40 })),
    );
  };
  const showPoints = (cells: Cell[], points: number) => {
    if (!cells.length || points <= 0) return;
    const x = (cells.reduce((s, c) => s + c.c, 0) / cells.length + 0.5) * cell;
    const y = (cells.reduce((s, c) => s + c.r, 0) / cells.length + 0.5) * cell;
    const key = ++popupKey.current;
    setPopups((p) => [...p, { key, x, y, points }]);
    setTimeout(() => setPopups((p) => p.filter((q) => q.key !== key)), 650);
  };

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
    clearHint();
    try {
      const before = game.current;
      const turn = playSwap(before, a, b);
      const idA = before.board.grid[a.r][a.c];
      const idB = before.board.grid[b.r][b.c];
      moveTo(idA, b.r, b.c, T.swap);
      moveTo(idB, a.r, a.c, T.swap);
      feedback.swap();
      await wait(T.swap);

      if (!turn.valid) {
        stats.current.invalid++;
        feedback.invalid();
        moveTo(idA, a.r, a.c, T.swap);
        moveTo(idB, b.r, b.c, T.swap);
        await wait(T.swap);
        return;
      }

      setHud((h) => ({ ...h, movesLeft: turn.state.movesLeft }));
      const st = stats.current;
      if (!st.startedAt) st.startedAt = Date.now();
      st.maxCombo = Math.max(st.maxCombo, turn.steps.length);
      st.reshuffles += turn.reshuffled ? 1 : 0;
      for (const step of turn.steps) {
        st.created += step.created.length;
        st.fired += step.fired.length;
      }
      let prev: Board = turn.swapped!;
      for (const [i, step] of turn.steps.entries()) {
        // Juice first, so sound, buzz and particles land with the pieces vanishing.
        const fired = step.fired.map((f) => f.kind);
        if (i === 0 && step.runs.length === 0) {
          // Special swap: the two swapped specials go off together at the landing cell.
          for (const at of [a, b]) {
            const id = prev.grid[at.r][at.c];
            fired.push(prev.kinds[id]);
            effects.current?.blast(b.r, b.c, prev.kinds[id]);
          }
        }
        for (const f of step.fired) effects.current?.blast(f.cell.r, f.cell.c, f.kind);
        effects.current?.burst(
          step.cleared.map(({ r, c }) => {
            const id = prev.grid[r][c];
            return { r, c, color: prev.kinds[id] === 'colorBomb' ? -1 : prev.colors[id] };
          }),
        );
        feedback.step(step.combo, fired, step.created.length);
        if (fired.includes('colorBomb')) doShake(9);
        else if (fired.includes('bomb')) doShake(6);
        else if (fired.length) doShake(3);
        showPoints(step.cleared, step.points);
        scaleAll(step.cleared.map(({ r, c }) => prev.grid[r][c]), 0, T.clear);
        setHud((h) => ({
          ...h,
          score: h.score + step.points,
          collected: step.collected,
          jelly: step.jelly,
          combo: step.combo,
          comboKey: step.combo > 1 ? h.comboKey + 1 : h.comboKey,
        }));
        await wait(T.clear);

        showBoard(step.board);
        // A special left behind by this step pops in place while the rest falls.
        for (const { id } of step.created) {
          anims.current[id].s.value = withSequence(withTiming(1.3, { duration: 110 }), withTiming(1, { duration: 140 }));
        }
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
        showBoard(turn.reshuffled);
        scaleAll(ids, 1, T.reshuffle);
        await wait(T.reshuffle);
      }

      game.current = turn.state;
      setHud((h) => ({ ...h, score: turn.state.score, combo: 0 }));
      if (turn.state.status !== 'playing') {
        if (turn.state.status === 'won') {
          feedback.win();
          // Confetti: a burst from a random third of the board, in every color.
          const cells = Array.from({ length: SIZE * SIZE }, (_, k) => ({ r: Math.floor(k / SIZE), c: k % SIZE }))
            .filter(() => Math.random() < 0.33)
            .map((c) => ({ ...c, color: Math.floor(Math.random() * PIECE_COLORS.length) }));
          effects.current?.burst(cells);
        } else feedback.lose();
        await wait(300);
        const end = turn.state;
        const perf = summarize();
        playlog({
          type: 'game',
          level: level.id,
          seed: String(level.seed),
          status: end.status as 'won' | 'lost',
          moves: level.moves,
          movesUsed: level.moves - end.movesLeft,
          score: end.score,
          stars: starsFor(end),
          seconds: Math.round((Date.now() - st.startedAt) / 1000),
          maxCombo: st.maxCombo,
          specialsCreated: st.created,
          specialsFired: st.fired,
          invalidSwaps: st.invalid,
          reshuffles: st.reshuffles,
          goals: goalProgress(end).map((g) => ({ type: g.goal.type, current: g.current, target: g.target })),
          avgFps: perf.avgFps,
          minFps: perf.minFps,
        });
        if (end.status === 'won') onWin({ won: true, stars: starsFor(end), score: end.score });
        setEnding({ state: end, stars: starsFor(end), perf });
      }
    } finally {
      busy.current = false;
      if (game.current.status === 'playing') scheduleHint();
    }
  };

  // ── Leaving, losing and continuing ──
  const lossReported = useRef(false);
  const finalizeLoss = () => {
    if (lossReported.current) return;
    lossReported.current = true;
    onLoss({ won: false, stars: 0, score: game.current.score });
  };
  /** Leave a lost game: the loss is final now (no continue taken). */
  const leaveLost = (then: () => void) => () => {
    finalizeLoss();
    then();
  };
  const requestExit = () => {
    const g = game.current;
    if (g.status === 'lost') return leaveLost(onExit)();
    if (g.status !== 'playing' || g.swaps.length === 0) return onExit();
    Alert.alert('¿Salir del nivel?', 'Perderás una vida.', [
      { text: 'Seguir jugando', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: leaveLost(onExit) },
    ]);
  };
  const doContinue = () => {
    const revived = continueGame(game.current);
    if (!revived || !onContinue()) return;
    game.current = revived;
    setHud((h) => ({ ...h, movesLeft: revived.movesLeft }));
    setEnding(null);
    scheduleHint();
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

  const goals = goalProgress({ level, score: hud.score, collected: hud.collected, jelly: hud.jelly });

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable style={styles.stat} onPress={requestExit} hitSlop={8}>
          <Text style={styles.statLabel}>‹ Nivel</Text>
          <Text style={styles.statValue}>{level.id}</Text>
        </Pressable>
        <View style={[styles.stat, styles.statWide]}>
          <Text style={styles.statLabel}>Objetivos</Text>
          <Goals goals={goals} />
          <Text style={styles.points}>{fmt(hud.score)} puntos</Text>
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
        <Animated.View style={[styles.board, { width: boardPx, height: boardPx }, shakeStyle]}>
          <Canvas style={{ width: boardPx, height: boardPx }}>
            <Jelly layers={hud.jelly} cell={cell} />
            {pieceColors.map((color, id) => (
              <Piece
                key={id}
                id={id}
                color={PIECE_COLORS[color]}
                kind={pieceKinds[id]}
                cell={cell}
                row={initialPos[id].r}
                col={initialPos[id].c}
                register={register}
              />
            ))}
            <Effects ref={effects} cell={cell} size={boardPx} />
          </Canvas>
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {popups.map((p) => (
              <Animated.Text
                key={p.key}
                entering={ZoomIn.duration(140)}
                exiting={FadeOutUp.duration(380)}
                style={[styles.popup, { left: p.x - 60, top: p.y - 14 }]}
              >
                +{fmt(p.points)}
              </Animated.Text>
            ))}
          </View>
        </Animated.View>
      </GestureDetector>

      <Text style={styles.fps}>{fps} fps</Text>

      {ending && (
        <Animated.View entering={FadeIn.duration(200)} style={styles.overlay}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{ending.state.status === 'won' ? '¡Nivel superado!' : 'Sin movimientos'}</Text>
            {ending.state.status === 'won' && (
              <Text style={styles.stars}>
                {[1, 2, 3].map((n) => (
                  <Text key={n} style={n <= ending.stars ? styles.starOn : styles.starOff}>
                    ★
                  </Text>
                ))}
              </Text>
            )}
            <Text style={styles.cardScore}>{fmt(ending.state.score)} puntos</Text>
            {ending.state.moveBonus > 0 && (
              <Text style={styles.cardDim}>
                incluye +{fmt(ending.state.moveBonus)} por{' '}
                {ending.state.movesLeft === 1 ? '1 movimiento restante' : `${ending.state.movesLeft} movimientos restantes`}
              </Text>
            )}
            {ending.state.status === 'won' && <Text style={styles.cardCoins}>+{winCoins(ending.stars)} 🪙</Text>}
            <Goals goals={goalProgress(ending.state)} />
            {ending.state.status === 'lost' && (
              <Pressable
                style={[styles.btn, styles.btnContinue, coins < continueCost && styles.btnDisabled]}
                disabled={coins < continueCost}
                onPress={doContinue}
              >
                <Text style={styles.btnContinueText}>+5 movimientos · 🪙 {continueCost}</Text>
                {coins < continueCost && (
                  <Text style={styles.cardDim}>
                    Tienes 🪙 {coins}; te faltan {continueCost - coins}
                  </Text>
                )}
              </Pressable>
            )}
            <Text style={styles.cardPerf}>
              Rendimiento: prom {ending.perf.avgFps} fps · mín {ending.perf.minFps} · frames lentos {ending.perf.slowPct}% ·{' '}
              {ending.perf.seconds} s
            </Text>
            {playlogEnabled && (
              <View style={styles.feelRow}>
                <Text style={styles.cardDim}>¿Cómo se sintió?</Text>
                {(['fácil', 'justo', 'difícil'] as const).map((feel) => (
                  <Pressable
                    key={feel}
                    style={[styles.feelBtn, ending.feel === feel && styles.feelOn]}
                    onPress={() => {
                      if (ending.feel) return;
                      playlog({ type: 'feel', level: level.id, status: ending.state.status as 'won' | 'lost', feel });
                      setEnding({ ...ending, feel });
                    }}
                  >
                    <Text style={styles.feelText}>{feel}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <View style={styles.cardActions}>
              <Pressable style={[styles.btn, styles.btnGhost]} onPress={ending.state.status === 'lost' ? leaveLost(onExit) : onExit}>
                <Text style={styles.btnText}>Mapa</Text>
              </Pressable>
              <Pressable style={[styles.btn, styles.btnGhost]} onPress={ending.state.status === 'lost' ? leaveLost(onRetry) : onRetry}>
                <Text style={styles.btnText}>Reintentar</Text>
              </Pressable>
              {ending.state.status === 'won' && hasNext && (
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
  points: { color: theme.textDim, fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: 4, fontVariant: ['tabular-nums'] },
  stars: { textAlign: 'center', fontSize: 34, letterSpacing: 6 },
  starOn: { color: '#FFB400' },
  starOff: { color: theme.surfaceHi },
  comboSlot: { height: 56, justifyContent: 'center' },
  combo: { color: '#FFB400', fontSize: 26, fontWeight: '900' },
  board: { backgroundColor: theme.surface, borderRadius: 16, overflow: 'hidden' },
  popup: {
    position: 'absolute',
    width: 120,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
  fps: { color: theme.textDim, fontSize: 12, marginTop: 12, fontVariant: ['tabular-nums'] },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8,10,20,0.78)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: theme.surface, borderRadius: 20, padding: 24, alignSelf: 'stretch', gap: 8 },
  cardTitle: { color: theme.text, fontSize: 26, fontWeight: '800', textAlign: 'center' },
  cardScore: { color: theme.good, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  cardDim: { color: theme.textDim, fontSize: 14, textAlign: 'center' },
  cardPerf: { color: theme.textDim, fontSize: 12, textAlign: 'center', marginTop: 8 },
  feelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 },
  feelBtn: { backgroundColor: theme.surfaceHi, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  feelOn: { backgroundColor: theme.accent },
  feelText: { color: theme.text, fontSize: 13, fontWeight: '600' },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 12 },
  btn: { backgroundColor: theme.accent, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24 },
  cardCoins: { color: '#FFD45C', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  btnContinue: { backgroundColor: theme.good, alignItems: 'center', marginTop: 8 },
  btnContinueText: { color: '#0F1220', fontWeight: '900', fontSize: 16 },
  btnDisabled: { opacity: 0.5 },
  btnGhost: { backgroundColor: theme.surfaceHi },
  btnText: { color: theme.text, fontWeight: '700', fontSize: 15 },
});
