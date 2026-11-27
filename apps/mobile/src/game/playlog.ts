// Dev-only playtest telemetry: sends finished games to scripts/playlog-server.ts on the dev machine.
// Disabled unless running in __DEV__ with EXPO_PUBLIC_PLAYLOG_URL set; failures are silent.
// Real analytics (with consent) arrive in iteration 6.
const URL = process.env.EXPO_PUBLIC_PLAYLOG_URL;
const session = Date.now().toString(36);

export type GameLog = {
  type: 'game';
  level: string;
  seed: string; // the dealt board, to replay a game exactly
  status: 'won' | 'lost';
  moves: number;
  movesUsed: number;
  score: number;
  stars: number;
  seconds: number;
  maxCombo: number;
  specialsCreated: number;
  specialsFired: number;
  invalidSwaps: number;
  reshuffles: number;
  goals: { type: string; current: number; target: number }[];
  avgFps: number;
  minFps: number;
};
export type FeelLog = { type: 'feel'; level: string; status: 'won' | 'lost'; feel: 'fácil' | 'justo' | 'difícil' };

/** Session-loop events: opening/leaving the app, rewards, lives. Extra fields are flat key/values. */
export type SessionLog = {
  type: 'session';
  event: 'open' | 'close' | 'notification' | 'daily' | 'life-lost' | 'no-lives' | 'continue';
} & Record<string, string | number | boolean | undefined>;

export const playlogEnabled = __DEV__ && !!URL;

export function playlog(entry: GameLog | FeelLog | SessionLog) {
  if (!playlogEnabled) return;
  fetch(URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session, at: new Date().toISOString(), ...entry }),
  }).catch(() => {});
}
