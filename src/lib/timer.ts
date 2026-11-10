import { useSyncExternalStore } from 'react';
import { actions, demoMode, getState } from './store';

export type TimerMode = 'focus' | 'break';
export interface TimerState {
  mode: TimerMode;
  /** Set while running: wall-clock end time. Timestamps keep it accurate in background tabs. */
  endsAt?: number;
  /** Remaining milliseconds while paused. */
  remaining: number;
  taskId?: string;
}

const KEY = 'daily-dashboard:timer';
const listeners = new Set<() => void>();

const lengthOf = (mode: TimerMode) => (mode === 'focus' ? getState().settings.focusMinutes : getState().settings.breakMinutes) * 60_000;

function load(): TimerState {
  if (demoMode) return { mode: 'focus', remaining: lengthOf('focus') }; // the sample day never touches your timer
  try {
    const t = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (t && (t.mode === 'focus' || t.mode === 'break')) return t;
  } catch {
    /* fall through */
  }
  return { mode: 'focus', remaining: lengthOf('focus') };
}

let timer: TimerState = load();

function set(next: TimerState) {
  timer = next;
  if (demoMode) {
    listeners.forEach((l) => l());
    return;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(timer));
  } catch {
    /* optional */
  }
  listeners.forEach((l) => l());
}

export const remainingMs = (t = timer, now = Date.now()) => Math.max(0, t.endsAt ? t.endsAt - now : t.remaining);
export const totalMs = (t = timer) => lengthOf(t.mode);
export const isRunning = () => !!timer.endsAt;

export const timerActions = {
  start() {
    if (timer.endsAt) return;
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
    set({ ...timer, endsAt: Date.now() + (timer.remaining || lengthOf(timer.mode)) });
  },
  pause() {
    if (!timer.endsAt) return;
    set({ ...timer, endsAt: undefined, remaining: remainingMs() });
  },
  toggle() {
    timer.endsAt ? timerActions.pause() : timerActions.start();
  },
  reset() {
    set({ ...timer, endsAt: undefined, remaining: lengthOf(timer.mode) });
  },
  setMode(mode: TimerMode) {
    set({ ...timer, mode, endsAt: undefined, remaining: lengthOf(mode) });
  },
  setTask(taskId?: string) {
    set({ ...timer, taskId });
  },
  /** Re-sync paused timer when the user changes the session length in settings. */
  syncLength() {
    if (!timer.endsAt) set({ ...timer, remaining: lengthOf(timer.mode) });
  },
};

/** Called on an interval by the app; finishes a session when its time is up. */
export function tick(onComplete: (mode: TimerMode) => void) {
  if (!timer.endsAt || Date.now() < timer.endsAt) return;
  const finished = timer.mode;
  if (finished === 'focus') actions.logFocus(getState().settings.focusMinutes, timer.taskId);
  const next: TimerMode = finished === 'focus' ? 'break' : 'focus';
  set({ mode: next, remaining: lengthOf(next), taskId: timer.taskId });
  onComplete(finished);
}

export function useTimer(): TimerState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => timer,
  );
}

export function chime() {
  try {
    const ctx = new AudioContext();
    [660, 880].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      const t0 = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.18, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.9);
      o.connect(g).connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + 1);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch {
    /* audio is a nice-to-have */
  }
}
