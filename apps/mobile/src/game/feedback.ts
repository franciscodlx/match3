// Sound effects and haptics. One place decides what each game event feels like, so the
// screen just says "this happened" and tuning the mix never touches game code.
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import type { Kind } from '@match3/game-core';

const SOURCES = {
  swap: require('../../assets/sfx/swap.wav'),
  invalid: require('../../assets/sfx/invalid.wav'),
  pop1: require('../../assets/sfx/pop1.wav'),
  pop2: require('../../assets/sfx/pop2.wav'),
  pop3: require('../../assets/sfx/pop3.wav'),
  pop4: require('../../assets/sfx/pop4.wav'),
  pop5: require('../../assets/sfx/pop5.wav'),
  pop6: require('../../assets/sfx/pop6.wav'),
  create: require('../../assets/sfx/create.wav'),
  line: require('../../assets/sfx/line.wav'),
  bomb: require('../../assets/sfx/bomb.wav'),
  colorBomb: require('../../assets/sfx/colorBomb.wav'),
  win: require('../../assets/sfx/win.wav'),
  lose: require('../../assets/sfx/lose.wav'),
} as const;
type Sound = keyof typeof SOURCES;

let players: Partial<Record<Sound, AudioPlayer>> | null = null;
const settings = { sound: true, haptics: true };

/** Loads every effect once for the app's lifetime (they are tiny). Safe to call repeatedly. */
export function initFeedback() {
  if (players) return;
  // Sound effects respect the silent switch and never stop the player's own music.
  setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
  players = {};
  for (const name of Object.keys(SOURCES) as Sound[]) players[name] = createAudioPlayer(SOURCES[name]);
}

export const feedbackSettings = {
  get: () => ({ ...settings }),
  set: (next: Partial<typeof settings>) => Object.assign(settings, next),
};

function play(name: Sound) {
  const p = players?.[name];
  if (!settings.sound || !p) return;
  p.seekTo(0).catch(() => {});
  p.play();
}

const buzz = (fn: () => Promise<void>) => {
  if (settings.haptics) fn().catch(() => {});
};

const BLAST_RANK: Partial<Record<Kind, number>> = { lineH: 1, lineV: 1, bomb: 2, colorBomb: 3 };

export const feedback = {
  swap: () => play('swap'),
  invalid: () => {
    play('invalid');
    buzz(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
  },
  /** One cascade step clearing pieces. Pitch and strength climb with the combo. */
  step: (combo: number, fired: Kind[], created: number) => {
    play(`pop${Math.min(combo, 6)}` as Sound);
    // The biggest blast of the step sets the sound and the thump.
    const top = fired.reduce((best, k) => ((BLAST_RANK[k] ?? 0) > (BLAST_RANK[best] ?? 0) ? k : best), 'normal' as Kind);
    if (top === 'colorBomb') play('colorBomb');
    else if (top === 'bomb') play('bomb');
    else if (top === 'lineH' || top === 'lineV') play('line');
    if (created > 0) play('create');

    const style =
      top === 'colorBomb' || top === 'bomb'
        ? Haptics.ImpactFeedbackStyle.Heavy
        : top !== 'normal' || combo >= 3
          ? Haptics.ImpactFeedbackStyle.Medium
          : combo === 2
            ? Haptics.ImpactFeedbackStyle.Light
            : Haptics.ImpactFeedbackStyle.Soft;
    buzz(() => Haptics.impactAsync(style));
  },
  win: () => {
    play('win');
    buzz(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  },
  lose: () => {
    play('lose');
    buzz(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
  },
};
