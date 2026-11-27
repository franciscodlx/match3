// The saved progress, kept in memory and written through to the device's key-value store.
// Synchronous on purpose: it is a few KB, and reading it before the first frame means the map
// never flashes an empty state.
import { useSyncExternalStore } from 'react';
import Storage from 'expo-sqlite/kv-store';
import { emptyProgress, parseProgress, type Progress } from '@match3/meta';
import { feedbackSettings } from '../game/feedback';

const KEY = 'match3.progress.v1';
let state: Progress = parseProgress(Storage.getItemSync(KEY));
feedbackSettings.set(state.settings);
const listeners = new Set<() => void>();

export const getProgress = () => state;

export function setProgress(update: (p: Progress) => Progress) {
  state = update(state);
  Storage.setItemSync(KEY, JSON.stringify(state));
  feedbackSettings.set(state.settings);
  listeners.forEach((l) => l());
}

export const resetProgress = () => setProgress(() => emptyProgress());

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useProgress = () => useSyncExternalStore(subscribe, getProgress);
