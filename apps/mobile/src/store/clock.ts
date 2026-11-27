// The app's notion of "now". Dev builds can push it forward to test lives, the daily reward and
// streaks without waiting (Ajustes → Reloj de prueba); release builds always use the real clock.
import { useEffect, useState } from 'react';
import Storage from 'expo-sqlite/kv-store';
import { localDay } from '@match3/meta';

const KEY = 'match3.devClockOffset';
let offset = __DEV__ ? Number(Storage.getItemSync(KEY) ?? 0) || 0 : 0;

export const now = () => Date.now() + offset;
/** Today's local calendar day (YYYY-MM-DD) in the device's time zone. */
export const today = () => localDay(now(), -new Date(now()).getTimezoneOffset());

export const devClock = {
  offset: () => offset,
  advance(ms: number) {
    if (!__DEV__) return;
    offset += ms;
    Storage.setItemSync(KEY, String(offset));
  },
  reset() {
    offset = 0;
    Storage.setItemSync(KEY, '0');
  },
};

/** Re-renders every `everyMs` with the current time, for countdowns. */
export function useNow(everyMs = 1000) {
  const [t, setT] = useState(now);
  useEffect(() => {
    const id = setInterval(() => setT(now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return t;
}

export function formatWait(ms: number) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
