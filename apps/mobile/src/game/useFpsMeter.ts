import { useEffect, useRef, useState } from 'react';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';

// A frame over 20.7 ms is a dropped frame even at 60 Hz.
const SLOW_MS = 20.7;

export type FpsSummary = { avgFps: number; minFps: number; slowPct: number; seconds: number };

/** Counts frames on the UI thread (where Skia draws) and keeps a per-second history for the session. */
export function useFpsMeter() {
  const frames = useSharedValue(0);
  const slow = useSharedValue(0);
  const [fps, setFps] = useState(0);
  const history = useRef<{ fps: number; slow: number }[]>([]);

  useFrameCallback((info) => {
    const dt = info.timeSincePreviousFrame;
    if (dt == null) return;
    frames.value += 1;
    if (dt > SLOW_MS) slow.value += 1;
  });

  useEffect(() => {
    const id = setInterval(() => {
      history.current.push({ fps: frames.value, slow: slow.value });
      setFps(frames.value);
      frames.value = 0;
      slow.value = 0;
    }, 1000);
    return () => clearInterval(id);
  }, [frames, slow]);

  const summarize = (): FpsSummary => {
    const secs = history.current.slice(1); // drop the warm-up second
    const total = secs.reduce((n, s) => n + s.fps, 0);
    const slowTotal = secs.reduce((n, s) => n + s.slow, 0);
    return {
      avgFps: secs.length ? Math.round((10 * total) / secs.length) / 10 : 0,
      minFps: secs.length ? Math.min(...secs.map((s) => s.fps)) : 0,
      slowPct: total ? Math.round((1000 * slowTotal) / total) / 10 : 0,
      seconds: secs.length,
    };
  };

  return { fps, summarize };
}
